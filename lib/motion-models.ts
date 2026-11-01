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
  if (!o.prompt.trim() || o.prompt.length > 2500)
    throw new Error("Prompt must contain 1–2500 characters.");
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
export function apimartMotionPayload(o: MotionInput) {
  if (o.model !== "wan") throw new Error("APIMart is available only for Wan 3.");
  if (o.mode && o.mode !== "reference")
    throw new Error("APIMart motion control supports reference image + video mode only.");
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
