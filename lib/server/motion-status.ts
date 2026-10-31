import "server-only";
import { motionModel, MotionState } from "@/lib/motion-models";
import { ApiError, kie, redact } from "./kie";
import { StoredMotionJob, updateJob } from "./motion-store";
import { providerVideoPoster } from "./video-trim";
export async function refreshJob(job: StoredMotionJob, key: string) {
  if (!job.taskId || job.state === "success" || job.state === "fail")
    return job;
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
    previewImage,
    previewAttempted: job.previewAttempted || shouldRecoverPreview,
    state: task.state as MotionState,
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
