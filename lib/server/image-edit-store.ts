import "server-only";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageEditJob } from "@/lib/image-edit";
import { ApiError } from "./kie";
import { validId } from "./motion-store";

// Jobs and their images live in the ignored .data/image-edit/ directory, so
// results survive after the GPU rental is destroyed.
const directory = path.join(process.cwd(), ".data", "image-edit");
export const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function jobFile(id: string) {
  return path.join(directory, validId(id) + ".json");
}
export function jobFolder(id: string) {
  return path.join(directory, validId(id));
}

export async function createEditJob(job: ImageEditJob) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(jobFile(job.id), JSON.stringify(job), { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export async function readEditJob(id: string): Promise<ImageEditJob> {
  try {
    return JSON.parse(await readFile(jobFile(id), "utf8")) as ImageEditJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ApiError("Edit not found.", 404);
    throw error;
  }
}

export async function updateEditJob(job: ImageEditJob) {
  const temporary = `${jobFile(job.id)}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
  await rename(temporary, jobFile(job.id));
}

export async function listEditJobs() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  const jobs = await Promise.all(
    names.map(async (name) => {
      try {
        return JSON.parse(await readFile(path.join(directory, name), "utf8")) as ImageEditJob;
      } catch {
        return null;
      }
    }),
  );
  return jobs.filter((job): job is ImageEditJob => !!job).sort((a, b) => b.created - a.created);
}

export async function deleteEditJob(id: string) {
  await rm(jobFolder(id), { recursive: true, force: true });
  await rm(jobFile(id), { force: true });
}

export async function saveEditImage(id: string, name: string, data: Uint8Array) {
  const folder = jobFolder(id);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await writeFile(path.join(folder, name), data, { mode: 0o600 });
}

export async function findEditImage(id: string, base: string) {
  const folder = jobFolder(id);
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return null;
  }
  const name = names.find((value) => value.startsWith(base + "."));
  if (!name) return null;
  const extension = name.split(".").pop() || "";
  const type = Object.entries(IMAGE_TYPES).find(([, value]) => value === extension)?.[0] || "application/octet-stream";
  return { file: path.join(folder, name), type, name };
}

// Accept only real PNG, JPEG and WebP files, checked by their first bytes.
export function sniffImage(bytes: Uint8Array): string | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
