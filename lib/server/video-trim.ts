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
export async function providerVideoPoster(param: string): Promise<string | undefined> {
  try {
    const parameters = JSON.parse(param);
    const input = typeof parameters.input === "string" ? JSON.parse(parameters.input) : parameters.input;
    const videoUrl = input?.reference_video_urls?.[0] ?? input?.video_urls?.[0];
    if (typeof videoUrl !== "string") return undefined;
    let url = new URL(videoUrl);
    const limit = 200 * 1024 * 1024;
    const signal = AbortSignal.timeout(20000);
    for (let redirect = 0; redirect < 4; redirect++) {
      const allowedHost = url.hostname === "kieai.redpandaai.co" || url.hostname === "tempfile.redpandaai.co" || url.hostname === "aiquickdraw.com" || url.hostname.endsWith(".aiquickdraw.com");
      if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !allowedHost)
        return undefined;
      const response = await fetch(url, { redirect: "manual", signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return undefined;
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body || Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        return undefined;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) { await reader.cancel(); return undefined; }
        chunks.push(new Uint8Array(chunk.value));
      }
      return await videoPoster(new File(chunks, "provider-clip.mp4", { type: "video/mp4" }));
    }
  } catch {
    // Expired or unavailable inputs use the animated fallback instead.
  }
  return undefined;
}

export async function videoPoster(file: File): Promise<string | undefined> {
  const directory = await mkdtemp(path.join(tmpdir(), "aiorbust-poster-"));
  try {
    const input = path.join(directory, "input");
    const output = path.join(directory, "poster.jpg");
    await writeFile(input, new Uint8Array(await file.arrayBuffer()), { mode: 0o600 });
    await execute("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-i", input,
      "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", output,
    ], { timeout: 20000, maxBuffer: 1024 * 1024 });
    return `data:image/jpeg;base64,${(await readFile(output)).toString("base64")}`;
  } catch {
    // A missing preview must not prevent an otherwise valid generation.
    return undefined;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

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
