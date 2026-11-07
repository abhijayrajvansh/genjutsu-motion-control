import {
  H3_ACCELERATIONS,
  H3_CLIP_SECONDS,
  H3_CUSTOM_SIZE,
  H3_DEFAULT_TARGET,
  H3_MARGINS,
  H3_MAX_IMAGE_MB,
  H3_MAX_LORAS,
  H3_MAX_SEED,
  H3_MAX_VIDEO_MB,
  H3_MIN_SECTION,
  H3_MOTION_SIZES,
  H3_RESOLUTIONS,
  H3_STEPS,
  H3_STRENGTH,
  H3_TUNNEL_MAX_MB,
  H3_CHUNK_SECONDS,
  H3_DETAIL,
  H3_FACE_STYLES,
  H3_TONE_MODES,
  H3_TONE_RANGES,
  H3_DEFAULT_TONE,
  H3ColorSettings,
  H3FaceSettings,
  H3FaceStyle,
  H3ToneMode,
  H3ToneSettings,
  H3ToneValue,
  h3FaceChunkCount,
  H3Acceleration,
  H3Job,
  H3Kind,
  H3Margin,
  H3ModelSettings,
  H3MotionSize,
  H3Preset,
  H3Resolution,
  H3Section,
  H3SwapSettings,
  h3ClipCount,
} from "@/lib/h3-swap";
import { ComfyServer, comboOptions, comfyErrorMessage, comfyFetch, comfyServer, objectInfo, redactComfy } from "@/lib/server/comfy";
import { createH3Job, listH3Jobs, readH3Job, saveH3File, sniffVideo, updateH3Job } from "@/lib/server/h3-store";
import { H3Group, checkAcceleration, colorGraph, faceGraph, inspectReadiness, loadGraph, maskGraph, requiredNodes, swapGraph } from "@/lib/server/h3-workflow";
import { IMAGE_TYPES, sniffImage } from "@/lib/server/image-edit-store";
import { ApiError, errorResponse, json, sameOrigin } from "@/lib/server/kie";
import { validId } from "@/lib/server/motion-store";
export const runtime = "nodejs";
export const maxDuration = 800;

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export async function GET() {
  try {
    return json({ jobs: await listH3Jobs() });
  } catch (error) {
    return errorResponse(error);
  }
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

function parseSection(form: FormData, sourceSeconds: number | undefined): H3Section {
  const start = Number(form.get("start") ?? 0);
  const length = Number(form.get("length") ?? 0);
  if (!Number.isFinite(start) || start < 0) throw new ApiError("The start of the part to use must be 0 s or later.");
  if (!Number.isFinite(length) || !(length === 0 || length >= H3_MIN_SECTION - 0.001))
    throw new ApiError(`The part to use must be at least ${H3_MIN_SECTION} s long.`);
  if (sourceSeconds && start + length > sourceSeconds + 0.1) throw new ApiError("The selected part runs past the end of the video.");
  return { start, length };
}

function parseResolution(value: string): H3Resolution {
  const custom = value.match(/^(\d+)x(\d+)$/);
  if (!custom) {
    if (!H3_RESOLUTIONS.includes(value as H3Preset)) throw new ApiError("Choose a supported resolution.");
    return value as H3Preset;
  }
  const [width, height] = [custom[1], custom[2]].map((side) => Math.round(Number(side) / H3_CUSTOM_SIZE.step) * H3_CUSTOM_SIZE.step);
  if (Math.min(width, height) < H3_CUSTOM_SIZE.min || Math.max(width, height) > H3_CUSTOM_SIZE.max)
    throw new ApiError(`A custom size must be ${H3_CUSTOM_SIZE.min}–${H3_CUSTOM_SIZE.max} px a side.`);
  return { width, height };
}

function parseMask(form: FormData) {
  const margin = text(form, "margin") || "normal";
  if (!Object.hasOwn(H3_MARGINS, margin)) throw new ApiError("Choose a supported mask margin.");
  const target = text(form, "target").replace(/\s+/g, " ").trim().slice(0, 100) || H3_DEFAULT_TARGET;
  return { hatFix: form.get("hat_fix") === "true", margin: margin as H3Margin, target };
}

function parseSettings(form: FormData): H3SwapSettings {
  const motion = Number(form.get("motion"));
  if (!H3_MOTION_SIZES.includes(motion as H3MotionSize)) throw new ApiError("Choose a supported motion reference size.");
  const seed = Number(form.get("seed"));
  if (!Number.isInteger(seed) || seed < 0 || seed > H3_MAX_SEED) throw new ApiError(`Seed must be a whole number from 0 to ${H3_MAX_SEED}.`);
  const clipSeconds = Number(form.get("clip_seconds"));
  if (!(clipSeconds >= H3_CLIP_SECONDS.min && clipSeconds <= H3_CLIP_SECONDS.max))
    throw new ApiError(`Clip length must be ${H3_CLIP_SECONDS.min}–${H3_CLIP_SECONDS.max} s.`);
  return {
    role: text(form, "role").slice(0, 200),
    resolution: parseResolution(text(form, "resolution")),
    motion: motion as H3MotionSize,
    noLipSync: form.get("no_lip_sync") === "true",
    seed,
    clipSeconds,
    ...parseMask(form),
  };
}

function parseModel(form: FormData, files: { models: string[]; loras: string[]; textEncoders: string[]; vaes: string[] }): H3ModelSettings {
  const steps = Number(form.get("steps"));
  if (!Number.isInteger(steps) || steps < H3_STEPS.min || steps > H3_STEPS.max)
    throw new ApiError(`Steps must be a whole number from ${H3_STEPS.min} to ${H3_STEPS.max}.`);
  const model = text(form, "model").trim();
  if (!files.models.includes(model)) throw new ApiError(`Base model not on the GPU: ${model || "none chosen"}.`, 409);
  const names = form.getAll("lora").map((name) => String(name).trim());
  const strengths = form.getAll("lora_strength").map(Number);
  const speed = form.getAll("lora_speed");
  if (names.length > H3_MAX_LORAS || strengths.length !== names.length) throw new ApiError(`Use at most ${H3_MAX_LORAS} LoRAs, each with a strength.`);
  const loras = names.map((name, i) => {
    if (!files.loras.includes(name)) throw new ApiError(`LoRA not on the GPU: ${name || "none chosen"}.`, 409);
    if (!(strengths[i] >= H3_STRENGTH.min && strengths[i] <= H3_STRENGTH.max)) throw new ApiError(`LoRA strength must be ${H3_STRENGTH.min} to ${H3_STRENGTH.max}.`);
    return { name, strength: strengths[i], speed: speed[i] === "true" };
  });
  const acceleration = text(form, "acceleration") || "none";
  if (!H3_ACCELERATIONS.includes(acceleration as H3Acceleration)) throw new ApiError("Choose a supported acceleration option.");
  const selected: H3ModelSettings = { steps, model, loras, acceleration: acceleration as H3Acceleration };
  for (const [field, key, list, label] of [
    ["describer", "describer", files.textEncoders, "visual describer"],
    ["text_encoder", "textEncoder", files.textEncoders, "H3 text encoder"],
    ["video_vae", "videoVae", files.vaes, "video VAE"],
    ["audio_vae", "audioVae", files.vaes, "audio VAE"],
  ] as const) {
    const name = text(form, field).trim();
    if (!list.includes(name)) throw new ApiError(`The ${label} is not on the GPU: ${name || "none chosen"}.`, 409);
    selected[key] = name;
  }
  try {
    checkAcceleration(selected);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "Invalid acceleration.");
  }
  return selected;
}

function parseFace(form: FormData): H3FaceSettings {
  const style = text(form, "style");
  if (!H3_FACE_STYLES.includes(style as H3FaceStyle)) throw new ApiError("Choose Match the photo or Follow the mouth.");
  const seed = Number(form.get("seed"));
  if (!Number.isInteger(seed) || seed < 0 || seed > H3_MAX_SEED) throw new ApiError(`Seed must be a whole number from 0 to ${H3_MAX_SEED}.`);
  const chunkSeconds = Number(form.get("chunk_seconds"));
  if (!(chunkSeconds >= H3_CHUNK_SECONDS.min && chunkSeconds <= H3_CHUNK_SECONDS.max))
    throw new ApiError(`Chunk length must be ${H3_CHUNK_SECONDS.min}–${H3_CHUNK_SECONDS.max} s.`);
  return { style: style as H3FaceStyle, seed, chunkSeconds };
}

// A step without its fields is turned off.
function parseColor(form: FormData): H3ColorSettings {
  const detailEntry = form.get("detail");
  const detail = detailEntry === null ? null : Number(detailEntry);
  if (detail !== null && !(detail >= H3_DETAIL.min && detail <= H3_DETAIL.max)) throw new ApiError(`Detail contrast must be ${H3_DETAIL.min} to ${H3_DETAIL.max}.`);
  const mode = form.get("tone_mode");
  let tone: H3ToneSettings | null = null;
  if (mode !== null) {
    if (!H3_TONE_MODES.includes(mode as H3ToneMode)) throw new ApiError("Choose a supported tone mapper mode.");
    tone = { ...H3_DEFAULT_TONE, mode: mode as H3ToneMode };
    for (const key of Object.keys(H3_TONE_RANGES) as H3ToneValue[]) {
      const range = H3_TONE_RANGES[key];
      const value = Number(form.get(`tone_${key}`));
      if (!(value >= range.min && value <= range.max)) throw new ApiError(`${range.label} must be ${range.min} to ${range.max}.`);
      tone[key] = value;
    }
  }
  if (detail === null && tone === null) throw new ApiError("Turn on detail contrast, the tone mapper or both.");
  const preset = text(form, "preset").slice(0, 100);
  return { detail, tone, ...(preset ? { preset } : {}) };
}

async function upload(server: ComfyServer, name: string, bytes: Uint8Array, type: string, timeout: number) {
  const form = new FormData();
  form.set("image", new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), name);
  form.set("type", "input");
  form.set("overwrite", "true");
  const response = await comfyFetch(server, "/upload/image", { method: "POST", body: form }, timeout);
  const body = (await response.json().catch(() => ({}))) as { name?: string; subfolder?: string };
  if (!response.ok || !body.name)
    throw new ApiError(response.status === 413 ? "The upload is too large for this link. Trim the video or use an SSH tunnel." : "ComfyUI did not accept the upload.", 502);
  return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
}

export async function POST(req: Request) {
  let job: H3Job | undefined;
  try {
    sameOrigin(req);
    const server = comfyServer(req);
    if (Number(req.headers.get("content-length") || 0) > (H3_MAX_VIDEO_MB + H3_MAX_IMAGE_MB + 1) * 1024 * 1024)
      throw new ApiError("Upload is too large.", 413);
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) throw new ApiError("Submit files as multipart form data.", 415);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError("Invalid upload form.");
    }
    const id = validId(text(form, "id"));
    try {
      return json({ job: await readH3Job(id), reused: true });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
    const kind = text(form, "kind") as H3Kind;
    if (!["swap", "mask", "face", "color"].includes(kind)) throw new ApiError("Unknown generation type.");
    const group: H3Group = kind === "swap" || kind === "mask" ? "swap" : kind;
    const needsPicture = kind === "swap" || kind === "face";
    const needsModel = kind === "swap" || kind === "face";

    const videoFile = form.get("video");
    if (!(videoFile instanceof File) || !videoFile.size) throw new ApiError("Add a driving video.");
    const tunnelled = !LOOPBACK.has(new URL(server.origin).hostname);
    const videoLimit = tunnelled ? H3_TUNNEL_MAX_MB : H3_MAX_VIDEO_MB;
    if (videoFile.size > videoLimit * 1024 * 1024)
      throw new ApiError(
        tunnelled
          ? `Videos over ${H3_TUNNEL_MAX_MB} MB cannot pass the Cloudflare link. Trim or compress it, or connect through an SSH tunnel (http://127.0.0.1:8188).`
          : `The video must be ${H3_MAX_VIDEO_MB} MB or smaller.`,
        413,
      );
    const video = new Uint8Array(await videoFile.arrayBuffer());
    const videoExtension = sniffVideo(video);
    if (!videoExtension) throw new ApiError("Use an MP4, MOV or WebM video.", 415);

    let picture: { bytes: Uint8Array; type: string } | undefined;
    if (needsPicture) {
      const pictureFile = form.get("picture");
      if (!(pictureFile instanceof File) || !pictureFile.size) throw new ApiError(kind === "face" ? "Add the photo of the person whose face to fix." : "Add the character photo.");
      if (pictureFile.size > H3_MAX_IMAGE_MB * 1024 * 1024) throw new ApiError(`The photo must be ${H3_MAX_IMAGE_MB} MB or smaller.`, 413);
      const bytes = new Uint8Array(await pictureFile.arrayBuffer());
      const type = sniffImage(bytes);
      if (!type) throw new ApiError("Use a PNG, JPEG or WebP photo.", 415);
      picture = { bytes, type };
    }

    const number = (name: string) => {
      const value = Number(form.get(name));
      return Number.isFinite(value) && value > 0 ? value : undefined;
    };
    const sourceSeconds = number("source_seconds");
    const section = parseSection(form, sourceSeconds);

    // Confirm the server can run the workflow before saving anything.
    const info = await objectInfo(server, [...new Set([...(await requiredNodes([group])), "UNETLoader", "LoraLoaderModelOnly", "CLIPLoader", "VAELoader"])]);
    const readiness = await inspectReadiness(info, group);
    if (readiness.missingNodes.length)
      throw new ApiError(`This ComfyUI is missing nodes: ${readiness.missingNodes.join(", ")}. Install the Openjutsu custom nodes and restart ComfyUI.`, 409);
    if (group !== "swap" && readiness.missingModels.length)
      throw new ApiError(`Models not on the GPU: ${readiness.missingModels.join(", ")}.`, 409);

    const settings = kind === "swap" ? parseSettings(form) : undefined;
    const mask = kind === "mask" ? parseMask(form) : undefined;
    const face = kind === "face" ? parseFace(form) : undefined;
    const color = kind === "color" ? parseColor(form) : undefined;
    const model =
      needsModel
        ? parseModel(form, {
            models: comboOptions(info, "UNETLoader", "unet_name"),
            loras: comboOptions(info, "LoraLoaderModelOnly", "lora_name"),
            textEncoders: comboOptions(info, "CLIPLoader", "clip_name"),
            vaes: comboOptions(info, "VAELoader", "vae_name"),
          })
        : undefined;
    const length = section.length || (sourceSeconds ? sourceSeconds - section.start : 0);

    const now = Date.now();
    job = {
      id,
      kind,
      created: now,
      updated: now,
      state: "submitting",
      section,
      sourceSeconds,
      sourceWidth: number("source_width"),
      sourceHeight: number("source_height"),
      ...(settings ? { settings, clips: length ? h3ClipCount(length, settings.clipSeconds) : undefined } : {}),
      ...(model ? { model } : {}),
      ...(mask ? { mask } : {}),
      ...(face ? { face, clips: length ? h3FaceChunkCount(length, face.chunkSeconds) : undefined } : {}),
      ...(color ? { color } : {}),
      videoName: (videoFile.name || "video").slice(0, 200),
      ...(picture && form.get("picture") instanceof File ? { pictureName: ((form.get("picture") as File).name || "photo").slice(0, 200) } : {}),
      server: server.origin,
    };
    if (!(await createH3Job(job))) return json({ job: await readH3Job(id), reused: true });
    await saveH3File(id, `video.${videoExtension}`, video);
    if (picture) await saveH3File(id, `picture.${IMAGE_TYPES[picture.type]}`, picture.bytes);

    const videoName = await upload(server, `genjutsu-h3-${id}.${videoExtension}`, video, videoFile.type || "video/mp4", 900000);
    const pictureName = picture ? await upload(server, `genjutsu-h3-${id}.${IMAGE_TYPES[picture.type]}`, picture.bytes, picture.type, 120000) : "";

    const short = id.slice(0, 8);
    const graph =
      kind === "swap"
        ? swapGraph(await loadGraph("simple"), { video: videoName, picture: pictureName, section, settings: settings!, model: model!, outputName: `genjutsu_h3_${short}` })
        : kind === "mask"
          ? maskGraph(await loadGraph("mask"), { video: videoName, section, ...mask!, outputName: `genjutsu/h3-mask-${short}` })
          : kind === "face"
            ? faceGraph(await loadGraph("face"), info, { video: videoName, picture: pictureName, section, settings: face!, model: model!, outputName: `genjutsu/h3-face-${short}` })
            : colorGraph(await loadGraph("color"), info, { video: videoName, section, settings: color!, outputName: `genjutsu/h3-color-${short}` });
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
    await updateH3Job(job);
    return json({ job });
  } catch (error) {
    if (job && job.state === "submitting") {
      const now = Date.now();
      const message = error instanceof ApiError ? error.message : "The generation could not be submitted.";
      await updateH3Job({ ...job, state: "fail", error: message, updated: now, completedAt: now }).catch(() => {});
    }
    if (!(error instanceof ApiError) && error instanceof Error) return errorResponse(new ApiError(error.message, 500));
    return errorResponse(error);
  }
}
