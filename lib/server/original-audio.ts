import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { ApiError } from "./kie";
import { validId } from "./motion-store";

const execute = promisify(execFile);
const directory = path.join(process.cwd(), ".data", "motion");
const audioPath = (id: string) => path.join(directory, `${validId(id)}-input.m4a`);
const resultPath = (id: string) => path.join(directory, `${validId(id)}-audio.mp4`);

export async function saveInputAudio(id: string, file: File): Promise<boolean> {
  validId(id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(path.join(directory, `${id}-audio-`));
  try {
    const input = path.join(temporary, "source");
    const output = path.join(temporary, "audio.m4a");
    await writeFile(input, new Uint8Array(await file.arrayBuffer()), { mode: 0o600 });
    const { stdout } = await execute("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "json", input], { timeout: 20000 });
    const codec = JSON.parse(stdout).streams?.[0]?.codec_name;
    if (!codec) return false;
    await execute("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", input, "-map", "0:a:0", "-vn", "-c:a", codec === "aac" ? "copy" : "aac", output], { timeout: 120000, maxBuffer: 1024 * 1024 });
    await chmod(output, 0o600);
    await rename(output, audioPath(id));
    return true;
  } catch {
    throw new ApiError("The original clip audio could not be saved. No generation was started.");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function savedAudioResult(id: string): Promise<string | undefined> {
  try { return (await stat(resultPath(id))).size > 0 ? resultPath(id) : undefined; }
  catch { return undefined; }
}

export async function attachInputAudio(id: string, body: ReadableStream<Uint8Array>, hasAudio: boolean): Promise<string> {
  const cached = await savedAudioResult(id);
  if (cached) { await body.cancel(); return cached; }
  const temporary = await mkdtemp(path.join(directory, `${validId(id)}-download-`));
  try {
    const input = path.join(temporary, "generated.mp4");
    const output = path.join(temporary, "combined.mp4");
    let size = 0;
    const limit = new Transform({ transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(size > 512 * 1024 * 1024 ? new Error("Result is too large.") : null, chunk);
    } });
    await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), limit, createWriteStream(input, { mode: 0o600 }));
    const { stdout } = await execute("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration:format=duration", "-of", "json", input], { timeout: 20000 });
    const probe = JSON.parse(stdout);
    const duration = Number(probe.streams?.[0]?.duration ?? probe.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Unreadable output duration.");
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", input];
    if (hasAudio) {
      await stat(audioPath(id));
      args.push("-i", audioPath(id), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-af", "apad");
    } else args.push("-map", "0:v:0", "-c:v", "copy", "-an");
    args.push("-t", String(duration), "-movflags", "+faststart", output);
    await execute("ffmpeg", args, { timeout: 120000, maxBuffer: 1024 * 1024 });
    await chmod(output, 0o600);
    await rename(output, resultPath(id));
    return resultPath(id);
  } catch {
    throw new ApiError("The video could not be combined with its original audio. Try downloading again.", 502);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
