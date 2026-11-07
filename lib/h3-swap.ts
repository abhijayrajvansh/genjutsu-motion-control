// Shared settings (client + server) for MiniMax H3 Simple motion transfer, run in ComfyUI on a rented GPU.
// Ported from Openjutsu (MIT, D3voz): one character photo replaces the main person in a video.

export const H3_MOTION_ID = "h3-comfy";

export const H3_RESOLUTIONS = ["480p", "576p", "736p", "768p", "1080p"] as const;
export type H3Preset = (typeof H3_RESOLUTIONS)[number];
export type H3Size = { width: number; height: number };
// A preset is the short edge and keeps the source shape; a custom size is the exact canvas.
export type H3Resolution = H3Preset | H3Size;
export const H3_CUSTOM_SIZE = { min: 256, max: 2048, step: 32 };

export const H3_CLIP_SECONDS = { min: 2.5, max: 15, default: 6 };
export const H3_MAX_SEED = 0xffffffff;
export const H3_MIN_SECTION = 2;
export const H3_DEFAULT_TARGET = "person";

// Edit-mask grow in pixels at SAM's 1008 px canvas.
export const H3_MARGINS = { tight: 20, normal: 40, loose: 60 } as const;
export type H3Margin = keyof typeof H3_MARGINS;

// Long edge of the grey-mannequin motion reference H3 follows.
export const H3_MOTION_SIZES = [512, 768, 1376] as const;
export type H3MotionSize = (typeof H3_MOTION_SIZES)[number];

export type H3Lora = { name: string; strength: number; speed?: boolean; enabled?: boolean };
export const H3_ACCELERATIONS = ["none", "spectrum"] as const;
export type H3Acceleration = (typeof H3_ACCELERATIONS)[number];
export type H3ModelSettings = {
  model: string;
  loras: H3Lora[];
  steps: number;
  describer?: string;
  textEncoder?: string;
  videoVae?: string;
  audioVae?: string;
  acceleration?: H3Acceleration;
};
export type H3ModelFiles = { models: string[]; loras: string[]; textEncoders: string[]; vaes: string[] };

export const H3_DEFAULT_DESCRIBER = "qwen3vl_8b_int8_convrot.safetensors";
export const H3_DEFAULT_MODEL = {
  model: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
  loras: [{ name: "minimax_h3_DMAD_4step_full_lora_avg_rank_39_bf16.safetensors", strength: 1 }],
  steps: 6,
  describer: H3_DEFAULT_DESCRIBER,
  textEncoder: "qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
  videoVae: "minimax_h3_video_vae_int8_convrot.safetensors",
  audioVae: "minimax_h3_audio_vae_fp32.safetensors",
  acceleration: "none",
} satisfies H3ModelSettings;
export const H3_MAX_LORAS = 4;
export const H3_STEPS = { min: 1, max: 100 };
export const H3_STRENGTH = { min: -4, max: 4 };

export function isSpeedLora(lora: H3Lora) {
  return lora.speed === true || /dmad|light[ _-]?x2v|turbo|(?:^|[\/ _-])(?:[12468][ _-]?steps?|lightning)(?:[_. -]|$)/i.test(lora.name.replaceAll("\\", "/"));
}
export function hasSpeedLora(loras: H3Lora[]) {
  return loras.some((lora) => lora.enabled !== false && lora.strength !== 0 && isSpeedLora(lora));
}

// Canvas the Swap Plan makes for a source of this size.
export function h3CanvasSize(width: number, height: number, resolution: H3Resolution): [number, number] {
  if (typeof resolution === "object") return [resolution.width, resolution.height];
  const scale = parseInt(resolution) / Math.min(width, height);
  return [width, height].map((side) => Math.max(32, Math.round((side * scale) / 32) * 32)) as [number, number];
}

export function resolutionLabel(resolution: H3Resolution) {
  return typeof resolution === "object" ? `${resolution.width}×${resolution.height}` : resolution;
}

// Estimate of the Swap Plan's clip count (exact for a video without hard cuts).
const FPS = 24;
const OVERLAP = 39;
const gridFloor = (frames: number) => Math.floor((frames - 5) / 17) * 17 + 5;
export function h3ClipCount(durationSeconds: number, clipSeconds: number) {
  const total = Math.floor(durationSeconds * FPS);
  const longest = gridFloor(Math.floor(clipSeconds * FPS));
  if (!Number.isFinite(total) || total < 5 || !Number.isFinite(longest) || longest <= OVERLAP) return 0;
  let clips = 0, end = 0, context = 0;
  while (true) {
    const start = end - context;
    const length = gridFloor(Math.min(longest, total - start));
    if (clips && length - context < 17) return clips;
    clips++;
    end = start + length;
    context = Math.min(OVERLAP, gridFloor(length - context));
  }
}

export type H3SwapSettings = {
  role: string; // who the character replaces; "" lets the describer name the main person
  resolution: H3Resolution;
  motion: H3MotionSize;
  hatFix: boolean;
  noLipSync: boolean;
  margin: H3Margin;
  target: string; // what SAM tracks; the biggest match is replaced
  seed: number;
  clipSeconds: number;
};

// Part of the source video to use, in seconds; length 0 runs to the end.
export type H3Section = { start: number; length: number };

export type H3Kind = "swap" | "mask" | "face" | "color";
export const H3_MOTION_KINDS: H3Kind[] = ["swap", "mask"];
export const H3_POST_KINDS: H3Kind[] = ["face", "color"];
export type H3State = "submitting" | "queued" | "running" | "success" | "fail";
export const H3_PENDING: H3State[] = ["submitting", "queued", "running"];

export type H3Job = {
  id: string;
  kind: H3Kind;
  created: number;
  updated: number;
  startedAt?: number;
  completedAt?: number;
  state: H3State;
  section: H3Section;
  sourceSeconds?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  // Swap only.
  settings?: H3SwapSettings;
  model?: H3ModelSettings;
  // Mask check only.
  mask?: { hatFix: boolean; margin: H3Margin; target: string };
  // Fix faces / Fix colours only.
  face?: H3FaceSettings;
  color?: H3ColorSettings;
  clips?: number;
  videoName: string;
  pictureName?: string;
  // ComfyUI server origin (never its token) and its prompt ID.
  server: string;
  promptId?: string;
  hasOutput?: boolean;
  outputName?: string;
  error?: string;
};

export type H3Readiness = { ready: boolean; missingNodes: string[]; missingModels: string[] };

export type H3Status = {
  ok: boolean;
  server?: string;
  gpu?: string;
  vramGB?: number;
  comfyVersion?: string;
  readiness?: H3Readiness;
  // Post-processing workflows.
  face?: H3Readiness;
  color?: H3Readiness;
  presets?: H3TonePreset[];
  files?: H3ModelFiles;
  queue?: { running: number; pending: number };
  error?: string;
};

export const H3_MAX_VIDEO_MB = 500;
export const H3_TUNNEL_MAX_MB = 100;
export const H3_MAX_IMAGE_MB = 30;

// ---- Post-processing: Fix faces and Fix colours (Openjutsu's face and color workflows) ----

export const H3_FACE_STYLES = ["photo", "mouth"] as const;
export type H3FaceStyle = (typeof H3_FACE_STYLES)[number];
export type H3FaceSettings = { style: H3FaceStyle; seed: number; chunkSeconds: number };
export const H3_CHUNK_SECONDS = { min: 2.5, max: 15, default: 6.5 };

// Mirrors H3FaceChunks in the swap pack, before chunks with only close-ups are dropped.
export function h3FaceChunkCount(durationSeconds: number, chunkSeconds: number) {
  const total = Math.floor(durationSeconds * FPS);
  const length = Math.floor((Math.floor(chunkSeconds * FPS) - 5) / 17) * 17 + 5;
  return total <= length ? 1 : Math.ceil((total - 24) / (length - 24));
}

export const H3_TONE_MODES = ["Filmic Soft", "Filmic Strong", "ACES Approx", "Reinhard", "Cineon-ish"] as const;
export type H3ToneMode = (typeof H3_TONE_MODES)[number];
export type H3ToneSettings = {
  mode: H3ToneMode; exposure: number; contrast: number; pivot: number; highlight_rolloff: number;
  shadow_lift: number; black_floor: number; saturation: number; strength: number;
};
export type H3ToneValue = Exclude<keyof H3ToneSettings, "mode">;
// Orion's own ranges for each value.
export const H3_TONE_RANGES: Record<H3ToneValue, { label: string; min: number; max: number; step: number }> = {
  exposure: { label: "Exposure", min: -5, max: 5, step: 0.01 },
  contrast: { label: "Contrast", min: 0, max: 3, step: 0.01 },
  pivot: { label: "Pivot", min: 0.01, max: 1, step: 0.01 },
  highlight_rolloff: { label: "Highlight rolloff", min: 0, max: 2, step: 0.01 },
  shadow_lift: { label: "Shadow lift", min: -1, max: 1, step: 0.01 },
  black_floor: { label: "Black floor", min: 0, max: 0.25, step: 0.01 },
  saturation: { label: "Saturation", min: 0, max: 3, step: 0.01 },
  strength: { label: "Strength", min: 0, max: 2, step: 0.01 },
};
export const H3_DEFAULT_PRESET = "H3 soft";
// zuanfilm's H3 preset, lighter: softer contrast and highlights, blacks kept.
export const H3_DEFAULT_TONE: H3ToneSettings = {
  mode: "Reinhard", exposure: 0.09, contrast: 0.84, pivot: 0.69, highlight_rolloff: 0.27,
  shadow_lift: 0.15, black_floor: 0.03, saturation: 1.05, strength: 0.2,
};
export const H3_DETAIL = { min: -1, max: 1, default: -0.2 };
// null turns a step off.
export type H3ColorSettings = { detail: number | null; tone: H3ToneSettings | null; preset?: string };
export type H3TonePreset = { name: string; settings: Record<string, unknown> };

// An Orion preset as ComfyUI returns it, keeping only the values the page shows.
export function toneFromPreset(settings: Record<string, unknown>): H3ToneSettings {
  const tone = { ...H3_DEFAULT_TONE };
  if (H3_TONE_MODES.includes(settings.mode as H3ToneMode)) tone.mode = settings.mode as H3ToneMode;
  for (const key of Object.keys(H3_TONE_RANGES) as H3ToneValue[]) {
    const value = settings[key];
    if (typeof value === "number") tone[key] = value;
  }
  return tone;
}
