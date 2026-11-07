import "server-only";
import { H3Job } from "@/lib/h3-swap";
import { ComfyServer, comfyFetch, comfyJson, redactComfy } from "./comfy";
import { saveH3Stream, updateH3Job } from "./h3-store";
import { MASK_NODES, NODES } from "./h3-workflow";

type HistoryFile = { filename?: string; subfolder?: string; type?: string };
type HistoryEntry = {
  status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] };
  outputs?: Record<string, { images?: HistoryFile[]; gifs?: HistoryFile[]; videos?: HistoryFile[] }>;
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
  return "ComfyUI could not finish this video.";
}

// The swap saves to output/; the mask check previews into temp/.
const isVideo = (file: HistoryFile) => (file.type === "output" || file.type === "temp") && !!file.filename && /\.(mp4|webm|mov|mkv)$/i.test(file.filename);

// The swap's Final Video node, or the mask check's preview video; any saved video as a fallback.
function outputVideo(job: H3Job, entry: HistoryEntry) {
  const files = (id: string) => [...(entry.outputs?.[id]?.images ?? []), ...(entry.outputs?.[id]?.gifs ?? []), ...(entry.outputs?.[id]?.videos ?? [])];
  const preferred = files(job.kind === "swap" ? NODES.final : MASK_NODES.combine).find(isVideo);
  return preferred ?? Object.keys(entry.outputs ?? {}).flatMap(files).find(isVideo);
}

async function finish(job: H3Job, server: ComfyServer, entry: HistoryEntry): Promise<H3Job> {
  const now = Date.now();
  if (entry.status?.status_str === "error")
    return { ...job, state: "fail", error: redactComfy(failure(entry), server), updated: now, completedAt: now };
  const video = outputVideo(job, entry);
  if (!video?.filename) return { ...job, state: "fail", error: "ComfyUI finished without saving a video.", updated: now, completedAt: now };
  const query = new URLSearchParams({ filename: video.filename, subfolder: video.subfolder || "", type: video.type || "output" });
  const response = await comfyFetch(server, `/view?${query}`, {}, 600000);
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`ComfyUI could not send the finished video (${response.status}).`);
  }
  const extension = (video.filename.split(".").pop() || "mp4").toLowerCase();
  await saveH3Stream(job.id, `output.${extension}`, response.body);
  return { ...job, state: "success", hasOutput: true, outputName: video.filename, error: undefined, updated: now, completedAt: now };
}

// Several pollers may refresh the same job; only one downloads its result.
const finishing = new Map<string, Promise<H3Job>>();

// Advance a job using ComfyUI's queue and history. Jobs from another server are left untouched.
export async function refreshH3Job(job: H3Job, server: ComfyServer): Promise<H3Job> {
  if (job.state === "success" || job.state === "fail" || !job.promptId || job.server !== server.origin) return job;
  const running = finishing.get(job.id);
  if (running) return running;
  const work = (async () => {
    let next = job;
    const entry = await history(server, job.promptId!);
    if (entry && (entry.status?.completed || entry.status?.status_str === "error" || entry.outputs)) {
      next = await finish(job, server, entry);
    } else {
      const queue = await comfyJson<{ queue_running?: QueueItem[]; queue_pending?: QueueItem[] }>(server, "/queue");
      const isRunning = queue.queue_running?.some((item) => item[1] === job.promptId);
      const isPending = queue.queue_pending?.some((item) => item[1] === job.promptId);
      if (isRunning || isPending) {
        const state = isRunning ? "running" : "queued";
        if (state !== job.state) next = { ...job, state, updated: Date.now(), ...(isRunning && !job.startedAt ? { startedAt: Date.now() } : {}) };
      } else {
        // History is written just after the queue clears, so look once more before giving up.
        const late = await history(server, job.promptId!);
        if (late) next = await finish(job, server, late);
        else {
          const now = Date.now();
          next = { ...job, state: "fail", error: "ComfyUI no longer has this job. The server may have restarted.", updated: now, completedAt: now };
        }
      }
    }
    if (next !== job) await updateH3Job(next);
    return next;
  })();
  finishing.set(job.id, work);
  try {
    return await work;
  } finally {
    finishing.delete(job.id);
  }
}
