import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { motionModel } from "@/lib/motion-models";
import { ApiError } from "./kie";
import { inspectFile } from "./media-validation";

const execute = promisify(execFile);
export async function trimDrivingVideo(file: File, modelId: string, start: number, end: number) {
  const model = motionModel(modelId);
  const seconds = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || seconds <= 0)
    throw new ApiError("Choose a valid start and end time.");
  if (Math.abs(seconds - Math.round(seconds)) > 0.000001)
    throw new ApiError("The selected segment must be a whole number of seconds.");
  if (seconds < Math.max(model.minSeconds, model.minReference) || seconds > Math.min(model.maxSeconds, model.maxReference))
    throw new ApiError("The selected segment is outside this model’s duration limits.");
  const source = await inspectFile(file, modelId, true, { sourceVideo: true });
  if (end > source.duration + 0.000001)
    throw new ApiError("The selected end time is beyond the source video.");
  const directory = await mkdtemp(path.join(tmpdir(), "aiorbust-trim-"));
  try {
    const input = path.join(directory, "source");
    const output = path.join(directory, "selected.mp4");
    await writeFile(input, new Uint8Array(await file.arrayBuffer()), { mode: 0o600 });
    try {
      await execute("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", String(start), "-i", input,
        "-t", String(Math.round(seconds)), "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2,fps=30", "-c:v", "libx264",
        "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
        "-af", "apad", "-movflags", "+faststart", output,
      ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new ApiError("FFmpeg is required to trim the selected segment.", 503);
      throw new ApiError("This video could not be trimmed. Choose another clip.");
    }
    const trimmed = new File([new Uint8Array(await readFile(output))], "selected-clip.mp4", { type: "video/mp4" });
    const media = await inspectFile(trimmed, modelId, true);
    if (Math.abs(media.duration - seconds) > 0.04)
      throw new ApiError("The trimmed video did not match the selected duration.");
    return { file: trimmed, media, selection: { start, end, sourceSeconds: source.duration } };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
