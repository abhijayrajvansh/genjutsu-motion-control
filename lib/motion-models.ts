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
export type MotionJob = {
  needsRecovery?: boolean;
  id: string;
  model: MotionModelId;
  label: string;
  prompt: string;
  created: number;
  updated: number;
  state: MotionState;
  taskId?: string;
  resultUrls?: string[];
  error?: string;
  seconds: number;
  resolution: string;
  creditsConsumed?: number;
};
export function motionModel(id: string) {
  const model = MOTION_MODELS.find((m) => m.id === id);
  if (!model) throw new Error("Choose a supported Kie motion model.");
  return model;
}
export function defaultMotionPrompt(id: string) {
  return id === "wan"
    ? "Use the character from Image1 and reproduce the motion in Video1. Preserve the clothing, background, camera framing and timing from Video1. Keep the character identity from Image1 consistent. A single continuous shot, natural movement."
    : id === "kling"
      ? "Reproduce the motion from the reference video using the character in the reference image. Keep the character identity consistent and the movement natural."
      : "Use the first reference image for the character identity. Reproduce the movement in the reference video, keeping the video clothing, scene, camera framing and timing. A single continuous shot, consistent identity and natural motion.";
}
export type MotionInput = {
  model: MotionModelId;
  prompt: string;
  seconds: number;
  resolution: string;
  audio: boolean;
  orientation: "image" | "video";
  imageUrls: string[];
  videoUrl: string;
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
  const refs = {
    reference_image_urls: o.imageUrls,
    reference_video_urls: [o.videoUrl],
  };
  let input: Record<string, unknown>;
  if (o.model === "kling")
    input = {
      prompt: o.prompt,
      input_urls: o.imageUrls,
      video_urls: [o.videoUrl],
      mode: o.resolution,
      character_orientation: o.orientation,
    };
  else if (o.model === "h3")
    input = {
      prompt: o.prompt,
      ...refs,
      duration: o.seconds,
      resolution: o.resolution,
      aspect_ratio: "adaptive",
    };
  else if (o.model === "wan")
    input = {
      prompt: o.prompt,
      ...refs,
      duration: o.seconds,
      resolution: o.resolution.toUpperCase(),
      audio: o.audio,
      aspect_ratio: "adaptive",
    };
  else
    input = {
      prompt: o.prompt,
      ...refs,
      duration: o.seconds,
      resolution: o.resolution,
      generate_audio: o.audio,
      aspect_ratio: "adaptive",
    };
  return { model: m.kieModel, input };
}
