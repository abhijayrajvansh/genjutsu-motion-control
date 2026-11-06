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
