import "server-only";
import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { MotionJob } from "@/lib/motion-models";
import { ApiError } from "./kie";
export type StoredMotionJob = MotionJob & { owner: string };
const directory = path.join(process.cwd(), ".data", "motion");
export function validId(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    )
  )
    throw new ApiError("Invalid job ID.");
  return id;
}
function file(id: string) {
  return path.join(directory, validId(id) + ".json");
}
export async function createJob(job: StoredMotionJob) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(file(job.id), JSON.stringify(job), {
      flag: "wx",
      mode: 0o600,
    });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw e;
  }
}
export async function readJob(id: string, owner: string) {
  try {
    const job = JSON.parse(await readFile(file(id), "utf8")) as StoredMotionJob;
    if (job.owner !== owner)
      throw new ApiError("Job not found for this Kie key.", 404);
    return job;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new ApiError("Job not found.", 404);
    throw e;
  }
}
export async function updateJob(job: StoredMotionJob) {
  const temp = file(job.id) + "." + crypto.randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(job), { mode: 0o600 });
  await rename(temp, file(job.id));
}
export async function listJobs(owner: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const names = (await readdir(directory)).filter((n) => n.endsWith(".json"));
  const jobs = await Promise.all(
    names.map(async (n) => {
      try {
        return JSON.parse(
          await readFile(path.join(directory, n), "utf8"),
        ) as StoredMotionJob;
      } catch {
        return null;
      }
    }),
  );
  return jobs
    .filter((j): j is StoredMotionJob => !!j && j.owner === owner)
    .sort((a, b) => b.created - a.created);
}
export function publicJob(job: StoredMotionJob): MotionJob {
  const { owner, ...safe } = job;
  void owner;
  return {
    ...safe,
    needsRecovery: !job.taskId && Date.now() - job.created > 300000,
  };
}
