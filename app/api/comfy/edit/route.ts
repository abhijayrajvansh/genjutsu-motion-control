import {
  IMAGE_EDIT_MAX_IMAGES,
  IMAGE_EDIT_MAX_MB,
  IMAGE_EDIT_MAX_SEED,
  IMAGE_EDIT_MODELS,
  ImageEditJob,
  ImageEditResolution,
  isImageEditModel,
  isImageEditQuality,
  isImageEditSize,
} from "@/lib/image-edit";
import { comboOptions, comfyErrorMessage, comfyFetch, comfyServer, objectInfo, redactComfy } from "@/lib/server/comfy";
import {
  createEditJob,
  IMAGE_TYPES,
  listEditJobs,
  readEditJob,
  saveEditImage,
  sniffImage,
  updateEditJob,
} from "@/lib/server/image-edit-store";
import { ApiError, errorResponse, json, sameOrigin } from "@/lib/server/kie";
import { validId } from "@/lib/server/motion-store";
import { editPrompt, fillDefaults, MODEL_NODES, requiredFiles } from "@/lib/server/qwen-edit-workflow";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    return json({ jobs: await listEditJobs() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  let job: ImageEditJob | undefined;
  try {
    sameOrigin(req);
    const server = comfyServer(req);
    if (Number(req.headers.get("content-length") || 0) > (IMAGE_EDIT_MAX_MB * IMAGE_EDIT_MAX_IMAGES + 1) * 1024 * 1024)
      throw new ApiError("Upload is too large.", 413);
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new ApiError("Submit images as multipart form data.", 415);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError("Invalid upload form.");
    }
    const id = validId(String(form.get("id") || ""));
    try {
      return json({ job: await readEditJob(id), reused: true });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
    const prompt = String(form.get("prompt") || "").trim();
    if (!prompt) throw new ApiError("Describe the edit you want.");
    if (prompt.length > 4000) throw new ApiError("The prompt is too long (4,000 characters maximum).");
    const model = form.get("model") ?? "qwen-image-2.1";
    if (!isImageEditModel(model)) throw new ApiError("Choose a model.");
    const settings = IMAGE_EDIT_MODELS[model];
    const quality = form.get("quality");
    if (!isImageEditQuality(quality)) throw new ApiError("Choose a quality setting.");
    const requested = Number(form.get("resolution") ?? 1024) as ImageEditResolution;
    const resolution: ImageEditResolution = model === "qwen-image-2.1" ? 1024 : requested;
    if (!settings.resolutions.includes(resolution)) throw new ApiError(`${settings.label} does not support that resolution.`);
    const size = form.get("size") ?? "auto";
    if (!isImageEditSize(size)) throw new ApiError("Choose a valid output size.");
    const seed = Number(form.get("seed"));
    if (!Number.isInteger(seed) || seed < 0 || seed > IMAGE_EDIT_MAX_SEED)
      throw new ApiError(`Seed must be a whole number from 0 to ${IMAGE_EDIT_MAX_SEED}.`);
    const consistency = model === "qwen-image-2.1" && form.get("consistency") === "true";
    const bfs = model === "qwen-image-2.1" && form.get("bfs") === "true";
    const files = form.getAll("images").filter((value): value is File => value instanceof File);
    if (!files.length) throw new ApiError("Add the image you want to edit.");
    if (files.length > IMAGE_EDIT_MAX_IMAGES) throw new ApiError(`Use at most ${IMAGE_EDIT_MAX_IMAGES} images.`);
    const images: { bytes: Uint8Array; type: string }[] = [];
    for (const file of files) {
      if (file.size > IMAGE_EDIT_MAX_MB * 1024 * 1024) throw new ApiError(`Each image must be ${IMAGE_EDIT_MAX_MB} MB or smaller.`, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = sniffImage(bytes);
      if (!type) throw new ApiError("Use PNG, JPEG or WebP images.", 415);
      images.push({ bytes, type });
    }

    // Confirm the server can run this workflow before saving anything.
    const info = await objectInfo(server, MODEL_NODES[model]);
    const missing = MODEL_NODES[model].filter((node) => !info[node]);
    if (missing.length) throw new ApiError(`This ComfyUI is missing nodes: ${missing.join(", ")}. Update ComfyUI.`, 409);
    const preset = settings.quality[quality];
    const absent = requiredFiles(model, !!(preset.lightning || preset.turbo), consistency, bfs).filter(([node, input, file]) => !comboOptions(info, node, input).includes(file)).map(([, , file]) => file);
    if (absent.length) throw new ApiError(`Models not installed on the GPU: ${absent.join(", ")}. Run setup-qwen-edit-vast.sh there.`, 409);

    const now = Date.now();
    job = {
      id,
      created: now,
      updated: now,
      state: "submitting",
      model,
      prompt,
      quality,
      steps: preset.steps,
      cfg: preset.cfg,
      seed,
      size,
      resolution,
      ...(consistency ? { consistency: true } : {}),
      ...(bfs ? { bfs: true } : {}),
      inputCount: images.length,
      server: server.origin,
    };
    if (!(await createEditJob(job))) return json({ job: await readEditJob(id), reused: true });
    await Promise.all(images.map((image, index) => saveEditImage(id, `input${index + 1}.${IMAGE_TYPES[image.type]}`, image.bytes)));

    const names: string[] = [];
    for (const [index, image] of images.entries()) {
      const upload = new FormData();
      const name = `genjutsu-${id}-${index + 1}.${IMAGE_TYPES[image.type]}`;
      upload.set("image", new Blob([image.bytes as Uint8Array<ArrayBuffer>], { type: image.type }), name);
      upload.set("type", "input");
      upload.set("overwrite", "true");
      const response = await comfyFetch(server, "/upload/image", { method: "POST", body: upload }, 120000);
      const body = (await response.json().catch(() => ({}))) as { name?: string; subfolder?: string };
      if (!response.ok || !body.name) throw new ApiError(`ComfyUI did not accept image ${index + 1}.`, 502);
      names.push(body.subfolder ? `${body.subfolder}/${body.name}` : body.name);
    }

    const graph = fillDefaults(
      editPrompt(model, { images: names, prompt, quality, size, resolution, seed, consistency, bfs, prefix: `genjutsu/qwen-edit-${id.slice(0, 8)}` }),
      info,
    );
    const response = await comfyFetch(
      server,
      "/prompt",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: graph, client_id: id }) },
      60000,
    );
    const body = (await response.json().catch(() => ({}))) as { prompt_id?: string };
    if (!response.ok || !body.prompt_id)
      throw new ApiError(redactComfy(comfyErrorMessage(body) || `ComfyUI refused the workflow (${response.status}).`, server), 502);
    job = { ...job, state: "queued", promptId: body.prompt_id, updated: Date.now() };
    await updateEditJob(job);
    return json({ job });
  } catch (error) {
    if (job && job.state === "submitting") {
      const now = Date.now();
      const message = error instanceof ApiError ? error.message : "The edit could not be submitted.";
      await updateEditJob({ ...job, state: "fail", error: message, updated: now, completedAt: now }).catch(() => {});
    }
    return errorResponse(error);
  }
}
