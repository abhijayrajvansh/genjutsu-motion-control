import {
  apiKey,
  ApiError,
  errorResponse,
  json,
  keyId,
  kie,
  sameOrigin,
} from "@/lib/server/kie";
import {
  createJob,
  listJobs,
  publicJob,
  readJob,
  StoredMotionJob,
  updateJob,
  validId,
} from "@/lib/server/motion-store";
import { inspectFile } from "@/lib/server/media-validation";
import {
  motionModel,
  MOTION_MODELS,
  MotionModelId,
  motionPayload,
} from "@/lib/motion-models";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  try {
    const owner = keyId(apiKey(req));
    return json({ jobs: (await listJobs(owner)).map(publicJob) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  let stored: StoredMotionJob | undefined,
    submitted = false;
  try {
    sameOrigin(req);
    const key = apiKey(req),
      owner = keyId(key);
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 350 * 1024 * 1024)
      throw new ApiError("Upload is too large.", 413);
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new ApiError("Submit files as multipart form data.", 415);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError("Invalid upload form.");
    }
    const id = validId(String(form.get("id") || ""));
    try {
      const existing = await readJob(id, owner);
      return json({ job: publicJob(existing), reused: true });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }

    const requestedModel = String(form.get("model") || "");
    if (!MOTION_MODELS.some((model) => model.id === requestedModel))
      throw new ApiError("Choose a supported Kie motion model.");
    const model = motionModel(requestedModel);
    const mode = String(form.get("mode") ?? "reference");
    if (mode !== "reference" && mode !== "first-frame")
      throw new ApiError("Choose a supported motion mode.");
    const firstFrame = form.get("firstFrame");
    if (mode === "first-frame" && model.maxImages < 2)
      throw new ApiError(
        "Kling supports one image. Choose Wan, Official H3 or Seedance for First frame + reference.",
      );
    if (mode === "first-frame" && !(firstFrame instanceof File))
      throw new ApiError("Add the corrected first frame for this mode.");
    if (mode === "reference" && firstFrame)
      throw new ApiError(
        "Switch to First frame + reference to submit a first frame.",
      );
    const prompt = String(form.get("prompt") || "").trim(),
      seconds = Number(form.get("seconds")),
      resolution = String(form.get("resolution") || "");
    const orientation = form.get("orientation") === "image" ? "image" : "video",
      audio = form.get("audio") === "true";
    const images = form
        .getAll("images")
        .filter((f): f is File => f instanceof File),
      video = form.get("video");
    if (
      !images.length ||
      images.length > model.maxImages ||
      !(video instanceof File)
    )
      throw new ApiError(
        `Supply 1–${model.maxImages} reference images and one driving video.`,
      );
    // Validate parameters before uploads or any billable request.
    try {
      motionPayload({
        model: model.id,
        mode,
        firstFrameUrl:
          mode === "first-frame"
            ? "https://example.com/first-frame.png"
            : undefined,
        prompt,
        seconds,
        resolution,
        orientation,
        audio,
        imageUrls: images.map(() => "https://example.com/reference.png"),
        videoUrl: "https://example.com/reference.mp4",
      });
    } catch (e) {
      throw new ApiError(
        e instanceof Error ? e.message : "Invalid model parameters.",
      );
    }
    if (mode === "first-frame" && firstFrame instanceof File)
      await inspectFile(firstFrame, model.id, false);
    const media = await inspectFile(video, model.id, true);
    for (const image of images) await inspectFile(image, model.id, false);
    if (model.id === "wan" && media.duration + seconds > 30.04)
      throw new ApiError(
        "Wan input duration plus output duration must not exceed 30 seconds.",
      );
    if (
      model.id === "kling" &&
      orientation === "image" &&
      media.duration > 10.04
    )
      throw new ApiError(
        "Kling image orientation accepts a driving video up to 10 seconds.",
      );
    const balance = await kie<number>("/api/v1/chat/credit", key);
    if (balance <= 0)
      throw new ApiError(
        "Your Kie account has no credits. Top up before generating.",
        402,
      );
    stored = {
      id,
      owner,
      model: model.id,
      mode,
      label: model.label,
      prompt,
      seconds: model.id === "kling" ? media.duration : seconds,
      resolution,
      created: Date.now(),
      updated: Date.now(),
      state: "uploading",
    };
    if (!(await createJob(stored)))
      return json({ job: publicJob(await readJob(id, owner)), reused: true });
    async function upload(file: File) {
      const body = new FormData();
      body.set("file", file, file.name);
      body.set("uploadPath", `aiorbust/motion/${id}`);
      const extension =
        file.name
          .split(".")
          .pop()
          ?.replace(/[^a-z0-9]/gi, "") || "bin";
      body.set("fileName", `${crypto.randomUUID()}.${extension}`);
      const result = await kie<{ downloadUrl: string }>(
        "/api/file-stream-upload",
        key,
        { method: "POST", body },
        true,
      );
      if (!result.downloadUrl || !/^https:\/\//.test(result.downloadUrl))
        throw new ApiError("Kie upload returned no valid file URL.", 502);
      return result.downloadUrl;
    }
    const imageUrls: string[] = [];
    for (const image of images) imageUrls.push(await upload(image));
    const firstFrameUrl =
      mode === "first-frame" && firstFrame instanceof File
        ? await upload(firstFrame)
        : undefined;
    const videoUrl = await upload(video);
    stored = { ...stored, state: "submitting", updated: Date.now() };
    await updateJob(stored);
    const payload = motionPayload({
      model: model.id as MotionModelId,
      mode,
      firstFrameUrl,
      prompt,
      seconds,
      resolution,
      orientation,
      audio,
      imageUrls,
      videoUrl,
    });
    stored = { ...stored, prompt: payload.input.prompt as string };
    await updateJob(stored);
    submitted = true;
    const task = await kie<{ taskId: string }>("/api/v1/jobs/createTask", key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!task.taskId)
      throw new ApiError(
        "Kie did not return a task ID. Check Kie logs before trying again.",
        502,
      );
    stored = {
      ...stored,
      taskId: task.taskId,
      state: "waiting",
      updated: Date.now(),
    };
    await updateJob(stored);
    return json({ job: publicJob(stored) }, 201);
  } catch (e) {
    if (stored) {
      const unknown =
        submitted && (!(e instanceof ApiError) || e.status >= 500);
      stored = {
        ...stored,
        state: unknown ? "submission_unknown" : "fail",
        updated: Date.now(),
        error:
          e instanceof ApiError
            ? e.message
            : "The request could not be completed.",
      };
      try {
        await updateJob(stored);
      } catch {
        /* Preserve the original error and never resubmit automatically. */
      }
      return json(
        { error: stored.error, job: publicJob(stored) },
        e instanceof ApiError ? e.status : 500,
      );
    }
    return errorResponse(e);
  }
}
