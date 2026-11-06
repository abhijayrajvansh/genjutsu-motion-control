import "server-only";
import { ImageEditJob } from "@/lib/image-edit";
import { ComfyServer, comfyFetch, comfyJson, redactComfy } from "./comfy";
import { IMAGE_TYPES, saveEditImage, sniffImage, updateEditJob } from "./image-edit-store";

type HistoryImage = { filename?: string; subfolder?: string; type?: string };
type HistoryEntry = {
  status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] };
  outputs?: Record<string, { images?: HistoryImage[] }>;
};
type QueueItem = [number, string, ...unknown[]];

async function history(server: ComfyServer, promptId: string) {
  const data = await comfyJson<Record<string, HistoryEntry>>(server, `/history/${encodeURIComponent(promptId)}`);
  return data[promptId];
}

function failure(entry: HistoryEntry) {
  for (const [kind, data] of entry.status?.messages || []) {
    if (kind === "execution_error") {
      const node = typeof data.node_type === "string" ? `${data.node_type}: ` : "";
      const message = typeof data.exception_message === "string" ? data.exception_message.trim() : "";
      if (message) return node + message.split("\n")[0];
    }
    if (kind === "execution_interrupted") return "The render was cancelled in ComfyUI.";
  }
  return "ComfyUI could not finish this edit.";
}

async function finish(job: ImageEditJob, server: ComfyServer, entry: HistoryEntry): Promise<ImageEditJob> {
  const now = Date.now();
  if (entry.status?.status_str === "error")
    return { ...job, state: "fail", error: redactComfy(failure(entry), server), updated: now, completedAt: now };
  const image = Object.values(entry.outputs || {})
    .flatMap((output) => output.images || [])
    .find((item) => item.type === "output" && item.filename);
  if (!image?.filename)
    return { ...job, state: "fail", error: "ComfyUI finished without saving an image.", updated: now, completedAt: now };
  const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || "", type: "output" });
  const response = await comfyFetch(server, `/view?${query}`, {}, 120000);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`ComfyUI could not send the finished image (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) throw new Error("ComfyUI sent an unrecognised image file.");
  await saveEditImage(job.id, `output.${IMAGE_TYPES[type]}`, bytes);
  return { ...job, state: "success", hasOutput: true, error: undefined, updated: now, completedAt: now };
}

// Advance a job using ComfyUI's queue and history. Jobs from another server are left untouched.
export async function refreshEditJob(job: ImageEditJob, server: ComfyServer): Promise<ImageEditJob> {
  if (job.state === "success" || job.state === "fail" || !job.promptId || job.server !== server.origin) return job;
  let next = job;
  const entry = await history(server, job.promptId);
  if (entry && (entry.status?.completed || entry.status?.status_str === "error" || entry.outputs)) {
    next = await finish(job, server, entry);
  } else {
    const queue = await comfyJson<{ queue_running?: QueueItem[]; queue_pending?: QueueItem[] }>(server, "/queue");
    const running = queue.queue_running?.some((item) => item[1] === job.promptId);
    const pending = queue.queue_pending?.some((item) => item[1] === job.promptId);
    if (running || pending) {
      const state = running ? "running" : "queued";
      if (state !== job.state) next = { ...job, state, updated: Date.now() };
    } else {
      // History is written just after the queue clears, so look once more before giving up.
      const late = await history(server, job.promptId);
      if (late) next = await finish(job, server, late);
      else {
        const now = Date.now();
        next = {
          ...job,
          state: "fail",
          error: "ComfyUI no longer has this job. The server may have restarted.",
          updated: now,
          completedAt: now,
        };
      }
    }
  }
  if (next !== job) await updateEditJob(next);
  return next;
}
