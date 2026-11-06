// Shared Edit Image settings (client + server): Qwen models run in ComfyUI on a rented GPU.

export type ImageEditModel = "qwen-edit-2511" | "qwen-image-2.1";
export type ImageEditQuality = "fast" | "balanced" | "best";
export type ImageEditResolution = 1024 | 2048;

export const QWEN_EDIT_FILES = {
  unet: "qwen_image_edit_2511_fp8mixed.safetensors",
  clip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
  vae: "qwen_image_vae.safetensors",
  lightning: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
} as const;

export const QWEN21_FILES = {
  unet: "qwen_image_2.1_int8_convrot.safetensors",
  turbo: "qwen_image_2.1_turbo_int8_convrot.safetensors",
  clip: "qwen3vl_8b_int8_convrot.safetensors",
  vae: "qwen_image_2.1_vae_bf16.safetensors",
  // AusBoss step 1500. Holds the photo still; strength 1 in the workflow.
  consistency: "qwen-image-2.1-consistency.safetensors",
} as const;

// Qwen-Image-2.1 Turbo's 8-step schedule from the official ComfyUI template.
export const QWEN21_TURBO_SIGMAS = "1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0";

export type QualityPreset = {
  label: string;
  hint: string;
  steps: number;
  cfg: number;
  // 2511 Fast adds the Lightning LoRA; 2.1 Fast swaps in the Turbo model.
  lightning?: boolean;
  turbo?: boolean;
};

export const IMAGE_EDIT_MODELS: Record<
  ImageEditModel,
  { label: string; short: string; hint: string; sizeStep: number; resolutions: ImageEditResolution[]; quality: Record<ImageEditQuality, QualityPreset> }
> = {
  "qwen-edit-2511": {
    label: "Qwen-Image-Edit 2511",
    short: "Qwen Edit 2511",
    hint: "Apache 2.0 · commercial use allowed · about 1 MP",
    sizeStep: 16,
    resolutions: [1024],
    // Settings from Comfy-Org's image_qwen_image_edit_2511 template.
    quality: {
      fast: { label: "Fast · 4 steps", hint: "Lightning LoRA, CFG 1. Quick previews; skin can look smoother.", steps: 4, cfg: 1, lightning: true },
      balanced: { label: "Balanced · 20 steps", hint: "CFG 4. Good photorealism in about 2 minutes.", steps: 20, cfg: 4 },
      best: { label: "Best · 40 steps", hint: "CFG 4. Most detailed, about 4–5 minutes.", steps: 40, cfg: 4 },
    },
  },
  "qwen-image-2.1": {
    label: "Qwen-Image 2.1",
    short: "Qwen Image 2.1",
    hint: "Newer, native 2K · Qwen Research License: no commercial use",
    sizeStep: 32,
    resolutions: [1024, 2048],
    // Settings from Comfy-Org's image_qwen_image_2_1(_turbo)_image_edit templates.
    quality: {
      fast: { label: "Turbo · 8 steps", hint: "Qwen-Image-2.1 Turbo model, CFG 1.", steps: 8, cfg: 1, turbo: true },
      balanced: { label: "Balanced · 25 steps", hint: "ComfyUI template default, CFG 1.", steps: 25, cfg: 1 },
      best: { label: "Best · 40 steps", hint: "Qwen's official 40–50 step range, CFG 1. Slowest.", steps: 40, cfg: 1 },
    },
  },
};

export function isImageEditModel(value: unknown): value is ImageEditModel {
  return value === "qwen-edit-2511" || value === "qwen-image-2.1";
}
export function isImageEditQuality(value: unknown): value is ImageEditQuality {
  return value === "fast" || value === "balanced" || value === "best";
}

// Output canvas. "auto" keeps image 1's shape; ratios are ~1 MP at 1K.
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

// Exact pixels for a ratio, model and resolution (2K doubles each side).
export function canvasSize(size: ImageEditSize, model: ImageEditModel, resolution: ImageEditResolution = 1024) {
  const base = IMAGE_EDIT_SIZES[size];
  const step = IMAGE_EDIT_MODELS[model].sizeStep;
  const scale = resolution / 1024;
  const round = (value: number) => Math.max(step, Math.round((value * scale) / step) * step);
  return { width: round(base.width), height: round(base.height) };
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
  // Missing on edits made before Qwen-Image-2.1 was added (they used 2511).
  model?: ImageEditModel;
  prompt: string;
  quality: ImageEditQuality;
  steps: number;
  cfg: number;
  seed: number;
  // Missing on edits made before the size option existed (they matched the input).
  size?: ImageEditSize;
  resolution?: ImageEditResolution;
  // Qwen Image 2.1 only. Missing means the AusBoss consistency LoRA was not used.
  consistency?: boolean;
  inputCount: number;
  // ComfyUI server origin (never its token) and its prompt ID.
  server: string;
  promptId?: string;
  hasOutput?: boolean;
  error?: string;
};

export type ModelReadiness = {
  ready: boolean;
  missingNodes: string[];
  missingModels: string[];
  fast: boolean;
  // Qwen Image 2.1: the AusBoss consistency LoRA is in models/loras.
  consistency: boolean;
};

export type ComfyStatus = {
  ok: boolean;
  server?: string;
  gpu?: string;
  vramGB?: number;
  comfyVersion?: string;
  models?: Record<ImageEditModel, ModelReadiness>;
  queue?: { running: number; pending: number };
  error?: string;
};
