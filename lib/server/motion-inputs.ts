import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { MotionInputMedia, motionModel } from "@/lib/motion-models";
import { ApiError, kie } from "./kie";
import { StoredMotionJob, validId } from "./motion-store";

type StoredInput = MotionInputMedia & { remoteUrl?: string };
const directory = (id: string) => path.join(process.cwd(), ".data", "motion-inputs", validId(id));
function inputPath(id: string, file: string) {
  if (!/^(image-[1-9]|video|first-frame|face)$/.test(file)) throw new ApiError("Input not found.", 404);
  return path.join(directory(id), file);
}
async function writeManifest(id: string, inputs: StoredInput[]) {
  await mkdir(directory(id), { recursive: true, mode: 0o700 });
  const file = path.join(directory(id), "manifest.json");
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(inputs), { mode: 0o600 });
  await rename(temp, file);
}
async function manifest(id: string): Promise<StoredInput[] | undefined> {
  try { return JSON.parse(await readFile(path.join(directory(id), "manifest.json"), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
export async function saveMotionInputs(id: string, images: File[], video: File, firstFrame?: File, videoName = video.name, face?: File) {
  await mkdir(directory(id), { recursive: true, mode: 0o700 });
  const entries = [
    ...images.map((file, index) => ({ id: `image-${index + 1}`, kind: "image" as const, file })),
    ...(firstFrame ? [{ id: "first-frame", kind: "first-frame" as const, file: firstFrame }] : []),
    ...(face ? [{ id: "face", kind: "face" as const, file: face }] : []),
    { id: "video", kind: "video" as const, file: video },
  ];
  const inputs: StoredInput[] = [];
  for (const { file, ...entry } of entries) {
    await writeFile(inputPath(id, entry.id), new Uint8Array(await file.arrayBuffer()), { mode: 0o600 });
    inputs.push({ ...entry, name: entry.kind === "video" ? videoName : file.name, type: file.type });
  }
  await writeManifest(id, inputs);
  return inputs;
}
function allowedUploadUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !(host === "kieai.redpandaai.co" || host === "tempfile.redpandaai.co" || host === "aiquickdraw.com" || host.endsWith(".aiquickdraw.com")))
    throw new ApiError("The original input link is unavailable.", 410);
  return url;
}
export async function loadMotionInputs(job: StoredMotionJob, key: string): Promise<MotionInputMedia[]> {
  let inputs = await manifest(job.id);
  // Older APIMart records do not retain their uploaded media URLs.
  if (!inputs && job.provider !== "apimart" && job.taskId) {
    const task = await kie<{ model?: string; param?: string }>(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(job.taskId)}`, key);
    if (task.model && task.model !== motionModel(job.model).kieModel) throw new ApiError("The provider task does not match this generation.", 409);
    let input: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(task.param || "{}");
      const value = typeof parsed?.input === "string" ? JSON.parse(parsed.input) : parsed?.input;
      if (value && typeof value === "object" && !Array.isArray(value)) input = value;
    } catch { /* An old task may no longer expose its original parameters. */ }
    const urls = (value: unknown): string[] => typeof value === "string" ? [value]
      : Array.isArray(value) ? value.filter((url): url is string => typeof url === "string") : [];
    const images = urls(input.reference_image_urls ?? input.image_urls ?? input.input_urls ?? input.image_url).slice(0, 4);
    const video = urls(input.reference_video_urls ?? input.video_urls ?? input.video_url)[0];
    inputs = [];
    for (const [index, value] of [...images, ...(video ? [video] : [])].entries()) {
      try {
        const url = allowedUploadUrl(value);
        const isVideo = index === images.length;
        const extension = path.extname(url.pathname).toLowerCase();
        const type = isVideo ? "video/mp4" : extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
        const isFrame = job.mode === "first-frame" && index === 1 && !isVideo;
        const isFace = job.faceReference === true && index === 1 && !isVideo;
        inputs.push({ id: isVideo ? "video" : isFrame ? "first-frame" : isFace ? "face" : `image-${index + 1}`,
          kind: isVideo ? "video" : isFrame ? "first-frame" : isFace ? "face" : "image", type,
          name: isVideo ? "Recovered driving clip.mp4" : `Recovered reference ${index + 1}${extension || ".jpg"}`, remoteUrl: url.href });
      } catch { /* Do not follow links outside the provider's upload hosts. */ }
    }
    if (inputs.length) await writeManifest(job.id, inputs);
  }
  return (inputs ?? []).map(({ remoteUrl, ...input }) => { void remoteUrl; return input; });
}
export async function readMotionInput(id: string, file: string) {
  const target = inputPath(id, file);
  const input = (await manifest(id))?.find(entry => entry.id === file);
  if (!input) throw new ApiError("Input not found.", 404);
  try { return { data: await readFile(target), type: input.type }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (!input.remoteUrl) throw new ApiError("This input is no longer available.", 410);
  let url = allowedUploadUrl(input.remoteUrl);
  const signal = AbortSignal.timeout(30000);
  const limit = (input.kind === "video" ? 200 : 30) * 1024 * 1024;
  for (let redirect = 0; redirect < 5; redirect++) {
    const response = await fetch(url, { redirect: "manual", signal, cache: "no-store" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next) break;
      url = allowedUploadUrl(new URL(next, url).href);
      continue;
    }
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > limit || response.headers.get("content-type")?.includes("text/")) {
      await response.body?.cancel();
      break;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ApiError("The recovered input is too large.", 413); }
      chunks.push(chunk.value);
    }
    if (!size) break;
    const data = Buffer.concat(chunks);
    await writeFile(target, data, { mode: 0o600 });
    return { data, type: input.type };
  }
  throw new ApiError("The provider's original input link has expired or is unavailable.", 410);
}
