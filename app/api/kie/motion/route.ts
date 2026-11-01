import { apimart, apimartBalance } from "@/lib/server/apimart";
import { cloudinaryConfigured, uploadMotionMedia } from "@/lib/server/cloudinary";
import { estimateMotionCost, formatMotionAmount } from "@/lib/motion-pricing";
import { currentMotionPricing } from "@/lib/server/motion-pricing";
import {
  apiKey,
  ApiError,
  errorResponse,
  json,
  requestOwner,
  kie,
  sameOrigin,
  requestProvider,
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
import { trimDrivingVideo, videoPoster } from "@/lib/server/video-trim";
import { saveInputAudio } from "@/lib/server/original-audio";
import { rememberSeed } from "@/lib/server/motion-status";
import {
  motionModel,
  MOTION_MODELS,
  MotionModelId,
  motionPayload,
  apimartMotionPayload,
} from "@/lib/motion-models";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  try {
    const key = apiKey(req);
    const owner = requestOwner(req, key);
    const jobs = [];
    for (const job of await listJobs(owner)) jobs.push(await rememberSeed(job, key));
    return json({ jobs: jobs.map(publicJob) });
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
      owner = requestOwner(req, key);
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

    if (!form.has("maxEstimatedCredits")) {
      return json(
        {
          error:
            "This tab is running an older version without total-credit estimates. Reload the page, reconnect Kie if prompted, and review the estimate on the Generate button. No paid generation was started.",
          code: "CLIENT_UPDATE_REQUIRED",
          generationStarted: false,
        },
        409,
      );
    }
    const requestedModel = String(form.get("model") || "");
    if (!MOTION_MODELS.some((model) => model.id === requestedModel))
      throw new ApiError("Choose a supported Kie motion model.");
    const model = motionModel(requestedModel);
    const provider = requestProvider(req);
    if (provider === "apimart" && model.id !== "wan") throw new ApiError("APIMart supports Wan 3 only.");
    if (provider === "apimart" && !cloudinaryConfigured()) throw new ApiError("Configure Cloudinary on the server: set CLOUDINARY_URL in .env.local and restart the server.", 503);
    const mode = String(form.get("mode") ?? "reference");
    if (mode !== "reference" && mode !== "first-frame")
      throw new ApiError("Choose a supported motion mode.");
    if (provider === "apimart" && mode !== "reference") throw new ApiError("APIMart motion control supports reference image + video only.");
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
      preserveInputAudio = form.get("preserveInputAudio") === "true",
      audio = !preserveInputAudio && form.get("audio") === "true",
      seedRaw = String(form.get("seed") ?? "").trim(),
      seed = seedRaw === "" ? undefined : Number(seedRaw),
      nsfwChecker = form.get("nsfwChecker") === "true";
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
        seed,
        nsfwChecker,
      });
    } catch (e) {
      throw new ApiError(
        e instanceof Error ? e.message : "Invalid model parameters.",
      );
    }
    if (mode === "first-frame" && firstFrame instanceof File)
      await inspectFile(firstFrame, model.id, false);
    const hasSelection = form.has("trimStart") || form.has("trimEnd");
    if (hasSelection && (!form.has("trimStart") || !form.has("trimEnd")))
      throw new ApiError("Supply both start and end times.");
    const prepared = hasSelection
      ? await trimDrivingVideo(video, model.id, Number(form.get("trimStart")), Number(form.get("trimEnd")))
      : { file: video, media: await inspectFile(video, model.id, true), selection: undefined };
    const media = prepared.media;
    if (hasSelection && seconds !== Math.round(prepared.selection!.end - prepared.selection!.start))
      throw new ApiError("Output duration must match the selected input segment.");
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
    const pricing = await currentMotionPricing(model.id, provider);
    const cost = estimateMotionCost(
      pricing,
      resolution,
      seconds,
      media.duration,
      images.length + Number(mode === "first-frame"),
    );
    const quoted = Number(form.get("maxEstimatedCredits"));
    if (!Number.isFinite(quoted) || quoted <= 0)
      throw new ApiError("A valid total-credit estimate is required.");
    if (cost.total > quoted + 0.001)
      return json(
        {
          error: `The total estimate is now ${formatMotionAmount(cost.total, pricing.currency)}. Refresh pricing and review the total before generating. No paid generation was started.`,
          code: "PRICE_CHANGED",
          generationStarted: false,
          estimatedCredits: cost.total,
        },
        409,
      );
    const balance = provider === "apimart" ? await apimartBalance(key) : await kie<number>("/api/v1/chat/credit", key);
    if (provider === "kie" && balance !== null && balance < cost.total)
      throw new ApiError(
        `Insufficient Kie balance: ${formatMotionAmount(balance!)}, estimated total ${formatMotionAmount(cost.total)}.`,
        402,
      );
    stored = {
      id,
      owner,
      provider,
      estimatedCurrency: pricing.currency,
      model: model.id,
      mode,
      label: model.label,
      selection: prepared.selection,
      previewImage: await videoPoster(images[0]),
      previewAttempted: true,
      preserveInputAudio,
      prompt,
      seconds: model.id === "kling" ? media.duration : seconds,
      resolution,
      estimatedCredits: cost.total,
      pricingCheckedAt: pricing.checkedAt,
      created: Date.now(),
      updated: Date.now(),
      state: "uploading",
    };
    if (!(await createJob(stored)))
      return json({ job: publicJob(await readJob(id, owner)), reused: true });
    if (preserveInputAudio) {
      stored = { ...stored, inputHasAudio: await saveInputAudio(id, prepared.file) };
      await updateJob(stored);
    }
    async function upload(file: File) {
      if (provider === "apimart") return uploadMotionMedia(file, id);
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
    const videoUrl = await upload(prepared.file);
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
      seed,
      nsfwChecker,
    });
    stored = {
      ...stored,
      prompt: payload.input.prompt as string,
      ...(typeof payload.input.seed === "number"
        ? { seed: payload.input.seed, seedChecked: true }
        : {}),
    };
    await updateJob(stored);
    submitted = true;
    let task: { taskId: string };
    if (provider === "apimart") {
      const apimartPayload = apimartMotionPayload({ model: model.id, mode, prompt, seconds, resolution, orientation, audio, imageUrls, videoUrl, seed, nsfwChecker });
      stored = { ...stored, prompt: apimartPayload.prompt };
      await updateJob(stored);
      const result = await apimart<{ data: { task_id: string }[] }>("/v1/videos/generations", key, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apimartPayload),
      });
      task = { taskId: result.data?.[0]?.task_id };
    } else task = await kie<{ taskId: string }>("/api/v1/jobs/createTask", key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!task.taskId)
      throw new ApiError(
        "The provider did not return a task ID. Check provider tasks before trying again.",
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
        {
          error: stored.error,
          job: publicJob(stored),
          ...(!submitted ? { generationStarted: false } : {}),
        },
        e instanceof ApiError ? e.status : 500,
      );
    }
    const response = errorResponse(e);
    const data = await response.json();
    return json({ ...data, generationStarted: false }, response.status);
  }
}
