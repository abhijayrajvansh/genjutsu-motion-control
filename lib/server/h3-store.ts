import "server-only";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { H3Job } from "@/lib/h3-swap";
import { ApiError } from "./kie";
import { validId } from "./motion-store";

// H3 jobs, their inputs and finished videos live in the ignored .data/h3-swap/ directory,
// so results survive after the GPU rental is destroyed.
const directory = path.join(process.cwd(), ".data", "h3-swap");

export const H3_MEDIA_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function jobFile(id: string) {
  return path.join(directory, validId(id) + ".json");
}
export function h3Folder(id: string) {
  return path.join(directory, validId(id));
}

export async function createH3Job(job: H3Job) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(jobFile(job.id), JSON.stringify(job), { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export async function readH3Job(id: string): Promise<H3Job> {
  try {
    return JSON.parse(await readFile(jobFile(id), "utf8")) as H3Job;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ApiError("Generation not found.", 404);
    throw error;
  }
}

export async function updateH3Job(job: H3Job) {
  const temporary = `${jobFile(job.id)}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
  await rename(temporary, jobFile(job.id));
}

export async function listH3Jobs() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  const jobs = await Promise.all(
    names.map(async (name) => {
      try {
        return JSON.parse(await readFile(path.join(directory, name), "utf8")) as H3Job;
      } catch {
        return null;
      }
    }),
  );
  return jobs.filter((job): job is H3Job => !!job).sort((a, b) => b.created - a.created);
}

export async function deleteH3Job(id: string) {
  await rm(h3Folder(id), { recursive: true, force: true });
  await rm(jobFile(id), { force: true });
}

export async function saveH3File(id: string, name: string, data: Uint8Array) {
  const folder = h3Folder(id);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await writeFile(path.join(folder, name), data, { mode: 0o600 });
}

// Stream a download (the finished video) to disk without holding it in memory.
export async function saveH3Stream(id: string, name: string, body: ReadableStream<Uint8Array>) {
  const folder = h3Folder(id);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const target = path.join(folder, name);
  const temporary = `${target}.${crypto.randomUUID()}.part`;
  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>), createWriteStream(temporary, { mode: 0o600 }));
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

// which: "output", "video" or "picture".
export async function findH3File(id: string, which: string) {
  const folder = h3Folder(id);
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return null;
  }
  const name = names.find((value) => value.startsWith(which + ".") && !value.endsWith(".part"));
  if (!name) return null;
  const extension = (name.split(".").pop() || "").toLowerCase();
  const file = path.join(folder, name);
  return { file, name, type: H3_MEDIA_TYPES[extension] || "application/octet-stream", size: (await stat(file)).size };
}

// Accept real videos only, checked by their first bytes.
export function sniffVideo(bytes: Uint8Array): string | null {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length > 12 && text(4, 8) === "ftyp") return text(8, 12) === "qt  " ? "mov" : "mp4";
  if (bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  return null;
}
