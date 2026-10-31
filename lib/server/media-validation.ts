import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { motionModel } from "@/lib/motion-models";
import { ApiError } from "./kie";
const execute = promisify(execFile);
export async function inspectFile(file: File, modelId: string, video: boolean) {
  const model = motionModel(modelId),
    types = video
      ? ["video/mp4", "video/quicktime"]
      : modelId === "kling"
        ? ["image/png", "image/jpeg"]
        : ["image/png", "image/jpeg", "image/webp"];
  if (!types.includes(file.type))
    throw new ApiError(
      video
        ? "Use an MP4 or MOV driving video."
        : "Unsupported reference image format.",
    );
  const limit = (video ? model.videoMB : model.imageMB) * 1024 * 1024;
  if (!file.size || file.size > limit)
    throw new ApiError(
      `${video ? "Video" : "Image"} must be smaller than ${limit / 1024 / 1024} MB.`,
    );
  const directory = await mkdtemp(path.join(tmpdir(), "aiorbust-media-"));
  try {
    const target = path.join(directory, "input");
    await writeFile(target, new Uint8Array(await file.arrayBuffer()), {
      mode: 0o600,
    });
    let stdout: string;
    try {
      ({ stdout } = await execute(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration,format_name:stream=codec_type,codec_name,width,height,r_frame_rate",
          "-of",
          "json",
          target,
        ],
        { timeout: 20000, maxBuffer: 1024 * 1024 },
      ));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        throw new ApiError(
          "ffprobe is required for media validation. Install FFmpeg on this computer.",
          503,
        );
      throw new ApiError(
        "This file could not be decoded. Choose a valid image or video.",
      );
    }
    const probe = JSON.parse(stdout),
      stream = probe.streams?.find(
        (s: { codec_type: string }) => s.codec_type === "video",
      );
    const width = Number(stream?.width),
      height = Number(stream?.height);
    if (!width || !height)
      throw new ApiError("The file has no readable image/video stream.");
    const max = video ? model.maxVideoSide : model.maxImageSide,
      ratio = Math.max(width / height, height / width);
    if (
      Math.min(width, height) < model.minSide ||
      Math.max(width, height) > max ||
      ratio > model.maxRatio
    )
      throw new ApiError(
        `${video ? "Video" : "Image"} dimensions must be ${model.minSide}–${max} pixels per side; maximum aspect ratio ${model.maxRatio}:1.`,
      );
    const duration = Number(probe.format?.duration);
    if (video) {
      if (
        !probe.format?.format_name?.includes("mp4") ||
        !["h264", "hevc"].includes(stream.codec_name)
      )
        throw new ApiError("Use an MP4/MOV encoded as H.264 or H.265.");
      if (
        !Number.isFinite(duration) ||
        duration < model.minReference - 0.04 ||
        duration > model.maxReference + 0.04
      )
        throw new ApiError(
          `Driving video must be ${model.minReference}–${model.maxReference} seconds for ${model.label}.`,
        );
      if (modelId.startsWith("seed")) {
        const pixels = width * height;
        if (pixels < 409600 || pixels > 927408)
          throw new ApiError(
            "Seedance reference video must contain 409,600–927,408 pixels per frame (for example, 720 × 1280).",
          );
      }
      if (modelId === "h3" || modelId.startsWith("seed")) {
        const [n, d] = String(stream.r_frame_rate).split("/").map(Number);
        const fps = n / d;
        if (fps < 23.97 || fps > 60.01)
          throw new ApiError("Reference video frame rate must be 24–60 fps.");
      }
    } else if (!["png", "mjpeg", "webp"].includes(stream.codec_name))
      throw new ApiError("Choose a genuine PNG, JPEG or WebP image.");
    return { width, height, duration: video ? duration : 0 };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
