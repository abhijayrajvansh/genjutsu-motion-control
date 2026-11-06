// Shared Qwen-Image-Edit-2511 settings for the Edit Image tab (client + server).

export const QWEN_EDIT_FILES = {
  unet: "qwen_image_edit_2511_fp8mixed.safetensors",
  clip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
  vae: "qwen_image_vae.safetensors",
  lightning: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
} as const;

export type ImageEditQuality = "fast" | "balanced" | "best";

// Settings from the official ComfyUI template (image_qwen_image_edit_2511.json).
export const IMAGE_EDIT_QUALITY: Record<
  ImageEditQuality,
  { label: string; hint: string; steps: number; cfg: number; lightning: boolean }
> = {
  fast: {
    label: "Fast · 4 steps",
    hint: "Lightning LoRA, CFG 1. Quick previews; skin and fine detail can look smoother.",
    steps: 4,
    cfg: 1,
    lightning: true,
  },
  balanced: {
    label: "Balanced · 20 steps",
    hint: "ComfyUI's recommended setting, CFG 4. Good photorealism at half the time of Best.",
    steps: 20,
    cfg: 4,
    lightning: false,
  },
  best: {
    label: "Best · 40 steps",
    hint: "Qwen's reference setting, CFG 4. Most detailed and slowest.",
    steps: 40,
    cfg: 4,
    lightning: false,
  },
};

// Output canvas. "auto" keeps image 1's shape (scaled to ~1 MP); ratios use
// ~1 MP sizes in multiples of 16, which Qwen-Image-Edit handles natively.
export const IMAGE_EDIT_SIZES = {
  auto: { label: "Match input image", width: 0, height: 0 },
  "1:1": { label: "1:1", width: 1024, height: 1024 },
  "2:3": { label: "2:3", width: 832, height: 1248 },
  "3:2": { label: "3:2", width: 1248, height: 832 },
  "3:4": { label: "3:4", width: 864, height: 1152 },
  "4:3": { label: "4:3", width: 1152, height: 864 },
  "9:16": { label: "9:16", width: 768, height: 1360 },
  "16:9": { label: "16:9", width: 1360, height: 768 },
  "21:9": { label: "21:9", width: 1568, height: 672 },
} as const;
export type ImageEditSize = keyof typeof IMAGE_EDIT_SIZES;
export function isImageEditSize(value: unknown): value is ImageEditSize {
  return typeof value === "string" && Object.hasOwn(IMAGE_EDIT_SIZES, value);
}

export const IMAGE_EDIT_MAX_IMAGES = 3;
export const IMAGE_EDIT_MAX_MB = 30;
export const IMAGE_EDIT_MAX_SEED = 2147483647;

export type ImageEditState = "submitting" | "queued" | "running" | "success" | "fail";

export type ImageEditJob = {
  id: string;
  created: number;
  updated: number;
  completedAt?: number;
  state: ImageEditState;
  prompt: string;
  quality: ImageEditQuality;
  steps: number;
  cfg: number;
  seed: number;
  // Missing on edits made before the size option existed (they matched the input).
  size?: ImageEditSize;
  inputCount: number;
  // ComfyUI server origin (never its token) and its prompt ID.
  server: string;
  promptId?: string;
  hasOutput?: boolean;
  error?: string;
};

export type ComfyStatus = {
  ok: boolean;
  server?: string;
  gpu?: string;
  vramGB?: number;
  comfyVersion?: string;
  missingNodes: string[];
  missingModels: string[];
  lightning: boolean;
  queue?: { running: number; pending: number };
  error?: string;
};

export function isImageEditQuality(value: unknown): value is ImageEditQuality {
  return value === "fast" || value === "balanced" || value === "best";
}
