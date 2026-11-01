export const MOTION_MODELS = [
  {
    id: "wan",
    label: "Wan 3",
    kieModel: "wan/3-0-video",
    minSeconds: 2,
    maxSeconds: 15,
    minReference: 1,
    maxReference: 15,
    resolutions: ["480p", "720p", "1080p"],
    imageMB: 20,
    videoMB: 100,
    minSide: 240,
    maxImageSide: 8000,
    maxVideoSide: 4096,
    maxRatio: 8,
    maxImages: 4,
  },
  {
    id: "h3",
    label: "MiniMax Official H3",
    kieModel: "minimax-h3/reference-to-video",
    minSeconds: 4,
    maxSeconds: 15,
    minReference: 2,
    maxReference: 15,
    resolutions: ["768P", "2K"],
    imageMB: 30,
    videoMB: 50,
    minSide: 256,
    maxImageSide: 5760,
    maxVideoSide: 5760,
    maxRatio: 2.5,
    maxImages: 4,
  },
  {
    id: "seed2",
    label: "Seedance 2.0",
    kieModel: "bytedance/seedance-2",
    minSeconds: 4,
    maxSeconds: 15,
    minReference: 2,
    maxReference: 15,
    resolutions: ["480p", "720p", "1080p"],
    imageMB: 30,
    videoMB: 50,
    minSide: 301,
    maxImageSide: 5999,
    maxVideoSide: 6000,
    maxRatio: 2.5,
    maxImages: 4,
  },
  {
    id: "seed25",
    label: "Seedance 2.5",
    kieModel: "bytedance/seedance-2-5",
    minSeconds: 4,
    maxSeconds: 30,
    minReference: 2,
    maxReference: 30,
    resolutions: ["480p", "720p", "1080p"],
    imageMB: 30,
    videoMB: 200,
    minSide: 301,
    maxImageSide: 5999,
    maxVideoSide: 6000,
    maxRatio: 2.5,
    maxImages: 4,
  },
  {
    id: "kling",
    label: "Kling 2.6 Motion Control",
    kieModel: "kling-2.6/motion-control",
    minSeconds: 3,
    maxSeconds: 30,
    minReference: 3,
    maxReference: 30,
    resolutions: ["720p", "1080p"],
    imageMB: 10,
    videoMB: 100,
    minSide: 301,
    maxImageSide: 6000,
    maxVideoSide: 3850,
    maxRatio: 2.5,
    maxImages: 1,
  },
  {
    id: "wan27r2v",
    label: "Wan 2.7 R2V",
    kieModel: "wan2.7-r2v",
    minSeconds: 2,
    maxSeconds: 10,
    minReference: 2,
    maxReference: 10,
    resolutions: ["720p", "1080p"],
    imageMB: 20,
    videoMB: 100,
    minSide: 240,
    maxImageSide: 8000,
    maxVideoSide: 4096,
    maxRatio: 8,
    maxImages: 4,
  },
  {
    id: "wan27edit",
    label: "Wan 2.7 Video Edit",
    kieModel: "wan2.7-videoedit",
    minSeconds: 2,
    maxSeconds: 10,
    minReference: 2,
    maxReference: 10,
    resolutions: ["720p", "1080p"],
    imageMB: 20,
    videoMB: 100,
    minSide: 240,
    maxImageSide: 8000,
    maxVideoSide: 4096,
    maxRatio: 8,
    maxImages: 4,
  },
] as const;
export type MotionModelId = (typeof MOTION_MODELS)[number]["id"];
export type MotionState =
  | "uploading"
  | "submitting"
  | "waiting"
  | "queuing"
  | "generating"
  | "success"
  | "fail"
  | "submission_unknown";
export type MotionMode = "reference" | "first-frame";
export type MotionProvider = "kie" | "apimart";
export const APIMART_MODEL_IDS = ["wan", "wan27r2v", "wan27edit"] as const;
export function apimartOnly(id: string) {
  return id === "wan27r2v" || id === "wan27edit";
}
export function apimartTaskModel(id: string) {
  if (id === "wan") return "wan3.0-video";
  if (id === "wan27r2v") return "wan2.7-r2v";
  if (id === "wan27edit") return "wan2.7-videoedit";
  return undefined;
}
export type MotionJob = {
  provider?: MotionProvider;
  estimatedCurrency?: "CNY" | "USD";
  preserveInputAudio?: boolean;
  inputHasAudio?: boolean;
  previewImage?: string;
  selection?: { start: number; end: number; sourceSeconds: number };
  mode?: MotionMode;
  needsRecovery?: boolean;
  id: string;
  model: MotionModelId;
  label: string;
  prompt: string;
  seed?: number;
  created: number;
  completedAt?: number;
  updated: number;
  state: MotionState;
  taskId?: string;
  resultUrls?: string[];
  error?: string;
  seconds: number;
  resolution: string;
  creditsConsumed?: number;
  estimatedCredits?: number;
  pricingCheckedAt?: string;
};
export function motionModel(id: string) {
  const model = MOTION_MODELS.find((m) => m.id === id);
  if (!model) throw new Error("Choose a supported Kie motion model.");
  return model;
}
export function defaultMotionPrompt(
  id: string,
  mode: MotionMode = "reference",
) {
  if (mode === "first-frame")
    return "Continue naturally from the corrected opening image, following the reference video's movement and timing. Keep the identity, clothing, background and camera framing consistent with the opening image.";
  if (id === "wan27r2v")
    return "Use the character from image 1, including their exact clothing and skin coverage. Reproduce only the body motion and timing from video 1. Do not copy the person, face, or clothing from video 1. If image 1 shows bare skin or very little clothing, keep that same coverage for the whole shot. Do not add garments, layers, fabric, or coverage that appear only in video 1. Keep image 1's outfit, colors, accessories and exposed skin consistent. Preserve the background and camera framing from video 1. A single continuous shot, natural movement.";
  if (id === "wan27edit")
    return "Replace the person in the video with the character from the reference image, including their exact clothing and skin coverage. Keep the original body motion, timing, background and camera framing. Do not copy the original person's face or clothing.";
  return id === "wan"
    ? "Use the character from Image1, including their exact clothing and skin coverage. Reproduce only the body motion and timing from Video1. Do not copy the person, face, or clothing from Video1. If Image1 shows bare skin or very little clothing, keep that same coverage for the whole shot. Do not add garments, layers, fabric, or coverage that appear only in Video1. Keep Image1's outfit, colors, accessories and exposed skin consistent. Preserve the background and camera framing from Video1. A single continuous shot, natural movement."
    : id === "kling"
      ? "Reproduce the motion from the reference video using the character in the reference image. Keep the character identity consistent and the movement natural."
      : "Use the first reference image for the character identity. Reproduce the movement in the reference video, keeping the video clothing, scene, camera framing and timing. A single continuous shot, consistent identity and natural motion.";
}
export type MotionInput = {
  model: MotionModelId;
  mode?: MotionMode;
  firstFrameUrl?: string;
  prompt: string;
  seconds: number;
  resolution: string;
  audio: boolean;
  orientation: "image" | "video";
  imageUrls: string[];
  videoUrl: string;
  seed?: number;
  nsfwChecker?: boolean;
  videoWidth?: number;
  videoHeight?: number;
};
export function motionPayload(o: MotionInput) {
  const m = motionModel(o.model);
  if (
    !Number.isInteger(o.seconds) ||
    o.seconds < m.minSeconds ||
    o.seconds > m.maxSeconds
  )
    throw new Error(
      `Output duration must be ${m.minSeconds}–${m.maxSeconds} seconds.`,
    );
  if (!(m.resolutions as readonly string[]).includes(o.resolution))
    throw new Error("Choose a resolution supported by this model.");
  if (!o.imageUrls.length || o.imageUrls.length > m.maxImages)
    throw new Error("Invalid reference image count.");
  const promptLimit = o.model === "wan27r2v" || o.model === "wan27edit" ? 5000 : 2500;
  if (!o.prompt.trim() || o.prompt.length > promptLimit)
    throw new Error(`Prompt must contain 1–${promptLimit} characters.`);
  const mode = o.mode ?? "reference";
  if (mode !== "reference" && mode !== "first-frame")
    throw new Error("Choose a supported motion mode.");
  if (mode === "first-frame" && m.maxImages < 2)
    throw new Error(
      "Kling accepts one reference image. Choose Wan 3, Official H3 or Seedance for First frame + reference.",
    );
  if (mode === "first-frame" && !o.firstFrameUrl)
    throw new Error("Add the corrected first frame for this mode.");
  if (mode === "reference" && o.firstFrameUrl)
    throw new Error("A first frame belongs to First frame + reference mode.");
  const imageUrls =
    mode === "first-frame"
      ? [o.imageUrls[0], o.firstFrameUrl!, ...o.imageUrls.slice(1)]
      : o.imageUrls;
  if (imageUrls.length > m.maxImages)
    throw new Error(
      `This mode accepts ${m.maxImages} total images, including the first frame.`,
    );
  const directive =
    o.model === "wan"
      ? "Image1 supplies the character identity. Image2 is the already-corrected opening frame. Begin the shot matching Image2's composition, pose, clothing and background, then continue using the motion and timing from Video1. Keep the identity from Image1 consistent."
      : "Reference image 1 supplies the character identity. Reference image 2 is the already-corrected opening frame. Begin the shot matching reference image 2's composition, pose, clothing and background, then continue using the motion and timing from the reference video. Keep the identity from reference image 1 consistent.";
  const prompt =
    mode === "first-frame" ? `${directive}\n\n${o.prompt}` : o.prompt;
  const refs = {
    reference_image_urls: imageUrls,
    reference_video_urls: [o.videoUrl],
  };
  let input: Record<string, unknown>;
  if (o.model === "kling")
    input = {
      prompt,
      input_urls: o.imageUrls,
      video_urls: [o.videoUrl],
      mode: o.resolution,
      character_orientation: o.orientation,
    };
  else if (o.model === "h3")
    input = {
      prompt,
      ...refs,
      duration: o.seconds,
      resolution: o.resolution,
      aspect_ratio: "adaptive",
    };
  else if (o.model === "wan") {
    if (
      o.seed !== undefined &&
      (!Number.isInteger(o.seed) || o.seed < 0 || o.seed > 2147483647)
    )
      throw new Error("Seed must be a whole number from 0 to 2147483647.");
    input = {
      prompt,
      ...refs,
      duration: o.seconds,
      resolution: o.resolution.toUpperCase(),
      audio: o.audio,
      aspect_ratio: "adaptive",
      ...(o.seed === undefined ? {} : { seed: o.seed }),
      nsfw_checker: o.nsfwChecker === true,
    };
  }
  else
    input = {
      prompt,
      ...refs,
      duration: o.seconds,
      resolution: o.resolution,
      generate_audio: o.audio,
      aspect_ratio: "adaptive",
    };
  return { model: m.kieModel, input };
}

// Keep the same validated motion instructions and media ordering across providers.
const APIMART_SIZES = [
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
  ["1:1", 1],
  ["4:3", 4 / 3],
  ["3:4", 3 / 4],
] as const;
function nearestApimartSize(width: number, height: number) {
  const ratio = width / height;
  return APIMART_SIZES.reduce((best, item) =>
    Math.abs(Math.log(ratio / item[1])) < Math.abs(Math.log(ratio / best[1])) ? item : best,
  )[0];
}
function checkedSeed(seed: number | undefined) {
  if (seed === undefined) return {};
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647)
    throw new Error("Seed must be a whole number from 0 to 2147483647.");
  return { seed };
}
export function apimartMotionPayload(o: MotionInput) {
  if (!APIMART_MODEL_IDS.includes(o.model as (typeof APIMART_MODEL_IDS)[number]))
    throw new Error("APIMart supports Wan 3, Wan 2.7 R2V and Wan 2.7 Video Edit.");
  if (o.mode && o.mode !== "reference")
    throw new Error("APIMart motion control supports reference image + video mode only.");
  if (o.model === "wan") {
    const { input } = motionPayload(o);
    return {
      model: "wan3.0-video",
      prompt: String(input.prompt).replace(/Image(\d+)/g, "图$1").replace(/Video(\d+)/g, "视频$1"),
      generation_type: "reference",
      image_urls: o.imageUrls,
      video_urls: [o.videoUrl],
      resolution: o.resolution.toUpperCase(),
      duration: o.seconds,
      size: "adaptive",
      audio: o.audio,
      ...(o.seed === undefined ? {} : { seed: o.seed }),
      nsfw_check: o.nsfwChecker === true,
    };
  }
  const { input } = motionPayload({ ...o, model: o.model });
  if (o.imageUrls.length + 1 > 5)
    throw new Error("Wan 2.7 accepts at most 4 reference images with one driving video.");
  const shared = {
    prompt: String(input.prompt),
    resolution: o.resolution.toUpperCase(),
    prompt_extend: false,
    watermark: false,
    ...checkedSeed(o.seed),
    nsfw_check: o.nsfwChecker === true,
  };
  if (o.model === "wan27r2v") {
    if (!o.videoWidth || !o.videoHeight)
      throw new Error("The driving video has no readable dimensions.");
    return {
      model: "wan2.7-r2v",
      ...shared,
      image_with_roles: o.imageUrls.map((url) => ({ url, role: "reference_image" })),
      video_urls: [o.videoUrl],
      duration: o.seconds,
      size: nearestApimartSize(o.videoWidth, o.videoHeight),
    };
  }
  return {
    model: "wan2.7-videoedit",
    ...shared,
    video_urls: [o.videoUrl],
    image_urls: o.imageUrls,
    duration: 0,
    metadata: { audio_setting: o.audio ? "auto" : "origin" },
  };
}
