import { apimart } from "./apimart";
import "server-only";
import { apimartTaskModel, motionModel, MotionState } from "@/lib/motion-models";
import { ApiError, kie, redact } from "./kie";
import { StoredMotionJob, updateJob } from "./motion-store";
import { providerVideoPoster } from "./video-trim";
export function seedFromTaskParam(param?: string) {
  if (!param) return undefined;
  try {
    const outer = JSON.parse(param) as { input?: unknown };
    const input = typeof outer.input === "string" ? JSON.parse(outer.input) : outer.input;
    const seed = input && typeof input === "object" ? (input as { seed?: unknown }).seed : undefined;
    return Number.isInteger(seed) ? (seed as number) : undefined;
  } catch {
    return undefined;
  }
}
export async function rememberSeed(job: StoredMotionJob, key: string) {
  if (job.provider === "apimart") return job;
  if (job.model !== "wan" || job.seed !== undefined || job.seedChecked || !job.taskId) return job;
  try {
    const task = await kie<{ param?: string }>(
      "/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(job.taskId),
      key,
    );
    const seed = seedFromTaskParam(task.param);
    const updated = { ...job, seed, seedChecked: true, updated: Date.now() };
    await updateJob(updated);
    return updated;
  } catch {
    return job;
  }
}
export async function refreshJob(job: StoredMotionJob, key: string) {
  if (!job.taskId || job.state === "success" || job.state === "fail")
    return job;
  if (job.provider === "apimart") return refreshApimartJob(job, key);
  const task = await kie<{
    model: string;
    state: string;
    resultJson?: string;
    failMsg?: string;
    creditsConsumed?: number;
    param?: string;
  }>("/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(job.taskId), key);
  if (task.model && task.model !== motionModel(job.model).kieModel)
    throw new ApiError("The Kie task model does not match this job.", 409);
  const states: MotionState[] = [
    "waiting",
    "queuing",
    "generating",
    "success",
    "fail",
  ];
  if (!states.includes(task.state as MotionState))
    throw new ApiError(
      "Kie returned an unknown task status. Try refreshing the status later.",
      502,
    );
  let resultUrls: string[] = [];
  if (task.state === "success") {
    try {
      const result = JSON.parse(task.resultJson || "{}");
      resultUrls = Array.isArray(result.resultUrls)
        ? result.resultUrls.filter(
            (u: unknown) => typeof u === "string" && u.startsWith("https://"),
          )
        : [];
    } catch {
      throw new ApiError(
        "The completed task returned unreadable results. Check Kie logs.",
        502,
      );
    }
    if (!resultUrls.length)
      throw new ApiError(
        "The completed task has no video URL. Check Kie logs.",
        502,
      );
  }
  const shouldRecoverPreview = !job.previewImage && !job.previewAttempted && typeof task.param === "string" && task.state !== "success" && task.state !== "fail";
  const previewImage = shouldRecoverPreview ? await providerVideoPoster(task.param!) : job.previewImage;
  const updated = {
    ...job,
    seed: job.seed ?? seedFromTaskParam(task.param),
    seedChecked: job.seed !== undefined || job.seedChecked || seedFromTaskParam(task.param) !== undefined || task.state === "success" || task.state === "fail",
    previewImage,
    previewAttempted: job.previewAttempted || shouldRecoverPreview,
    state: task.state as MotionState,
    completedAt: task.state === "success" || task.state === "fail" ? Date.now() : undefined,
    updated: Date.now(),
    resultUrls: resultUrls.length ? resultUrls : job.resultUrls,
    error:
      task.state === "fail"
        ? redact(task.failMsg || "Kie could not generate this video.", key)
        : undefined,
    creditsConsumed: task.creditsConsumed,
  };
  await updateJob(updated);
  return updated;
}

async function refreshApimartJob(job: StoredMotionJob, key: string) {
  const { data: task } = await apimart<{ data: {
    id: string; model?: string; status: string; credits_cost?: number;
    result?: { videos?: { url: string | string[] }[] }; error?: { message?: string };
  } }>(`/v1/tasks/${encodeURIComponent(job.taskId!)}?language=en`, key);
  const expected = apimartTaskModel(job.model);
  if (!task || task.id !== job.taskId || (task.model && task.model !== expected))
    throw new ApiError("The APIMart task does not match this job.", 409);
  const states: Record<string, MotionState> = { pending: "waiting", submitted: "waiting", processing: "generating", completed: "success", failed: "fail", cancelled: "fail" };
  const state = states[task.status];
  if (!state) throw new ApiError("APIMart returned an unknown task status.", 502);
  const resultUrls = (task.result?.videos ?? []).flatMap((v) => Array.isArray(v.url) ? v.url : [v.url])
    .filter((url): url is string => typeof url === "string" && url.startsWith("https://"));
  if (state === "success" && !resultUrls.length) throw new ApiError("APIMart completed the task without a video URL.", 502);
  const updated: StoredMotionJob = { ...job, state, updated: Date.now(),
    completedAt: state === "success" || state === "fail" ? Date.now() : undefined,
    resultUrls: resultUrls.length ? resultUrls : job.resultUrls,
    error: state === "fail" ? redact(task.error?.message || "APIMart could not generate this video.", key) : undefined,
    creditsConsumed: task.credits_cost,
  };
  await updateJob(updated);
  return updated;
}
