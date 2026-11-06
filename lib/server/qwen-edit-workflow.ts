import "server-only";
import {
  canvasSize,
  IMAGE_EDIT_MODELS,
  ImageEditModel,
  ImageEditQuality,
  ImageEditResolution,
  ImageEditSize,
  QWEN21_FILES,
  QWEN21_TURBO_SIGMAS,
  QWEN_EDIT_FILES,
} from "@/lib/image-edit";
import { ObjectInfo } from "./comfy";

type Link = [string, number];
type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
export type ApiPrompt = Record<string, ApiNode>;

const QWEN_EDIT_2511_NODES = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "LoraLoaderModelOnly",
  "ModelSamplingAuraFlow",
  "CFGNorm",
  "LoadImage",
  "FluxKontextImageScale",
  "TextEncodeQwenImageEditPlus",
  "FluxKontextMultiReferenceLatentMethod",
  "VAEEncode",
  "EmptySD3LatentImage",
  "KSampler",
  "VAEDecode",
  "SaveImage",
];

const QWEN21_NODES = [
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "QwenImage21Cache",
  "LoadImage",
  "TextEncodeQwenImage21",
  "EmptyLatentImage",
  "KSampler",
  "RandomNoise",
  "KSamplerSelect",
  "ManualSigmas",
  "CFGGuider",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "SaveImage",
];

export const MODEL_NODES: Record<ImageEditModel, string[]> = {
  "qwen-edit-2511": QWEN_EDIT_2511_NODES,
  "qwen-image-2.1": QWEN21_NODES,
};
export const ALL_NODES = [...new Set([...QWEN_EDIT_2511_NODES, ...QWEN21_NODES])];

// [node, input, file] that must be installed for a model; fast adds its Fast-mode file.
export function requiredFiles(model: ImageEditModel, fast: boolean): [string, string, string][] {
  if (model === "qwen-image-2.1")
    return [
      ["UNETLoader", "unet_name", fast ? QWEN21_FILES.turbo : QWEN21_FILES.unet],
      ["CLIPLoader", "clip_name", QWEN21_FILES.clip],
      ["VAELoader", "vae_name", QWEN21_FILES.vae],
    ];
  const files: [string, string, string][] = [
    ["UNETLoader", "unet_name", QWEN_EDIT_FILES.unet],
    ["CLIPLoader", "clip_name", QWEN_EDIT_FILES.clip],
    ["VAELoader", "vae_name", QWEN_EDIT_FILES.vae],
  ];
  if (fast) files.push(["LoraLoaderModelOnly", "lora_name", QWEN_EDIT_FILES.lightning]);
  return files;
}

type PromptOptions = {
  images: string[];
  prompt: string;
  quality: ImageEditQuality;
  size?: ImageEditSize;
  resolution?: ImageEditResolution;
  seed: number;
  prefix: string;
};

export function editPrompt(model: ImageEditModel, options: PromptOptions): ApiPrompt {
  return model === "qwen-image-2.1" ? qwen21Prompt(options) : qwenEditPrompt(options);
}

// API-format graph equivalent to Comfy-Org's image_qwen_image_edit_2511 template.
// images[0] is the picture being edited; images[1..2] are optional references.
function qwenEditPrompt({ images, prompt, quality, size = "auto", seed, prefix }: PromptOptions): ApiPrompt {
  const preset = IMAGE_EDIT_MODELS["qwen-edit-2511"].quality[quality];
  const graph: ApiPrompt = {
    unet: { class_type: "UNETLoader", inputs: { unet_name: QWEN_EDIT_FILES.unet, weight_dtype: "default" } },
    clip: { class_type: "CLIPLoader", inputs: { clip_name: QWEN_EDIT_FILES.clip, type: "qwen_image", device: "default" } },
    vae: { class_type: "VAELoader", inputs: { vae_name: QWEN_EDIT_FILES.vae } },
    shift: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["unet", 0], shift: 3.1 } },
    cfgnorm: { class_type: "CFGNorm", inputs: { model: ["shift", 0], strength: 1 } },
  };
  let model: Link = ["cfgnorm", 0];
  if (preset.lightning) {
    graph.lora = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model, lora_name: QWEN_EDIT_FILES.lightning, strength_model: 1 },
    };
    model = ["lora", 0];
  }
  const loaded: Link[] = images.map((name, index) => {
    graph[`image${index + 1}`] = { class_type: "LoadImage", inputs: { image: name } };
    return [`image${index + 1}`, 0];
  });
  graph.scaled = { class_type: "FluxKontextImageScale", inputs: { image: loaded[0] } };
  const encoderImages: Record<string, Link> = { image1: ["scaled", 0] };
  if (loaded[1]) encoderImages.image2 = loaded[1];
  if (loaded[2]) encoderImages.image3 = loaded[2];
  graph.positive = {
    class_type: "TextEncodeQwenImageEditPlus",
    inputs: { clip: ["clip", 0], vae: ["vae", 0], prompt, ...encoderImages },
  };
  graph.negative = {
    class_type: "TextEncodeQwenImageEditPlus",
    inputs: { clip: ["clip", 0], vae: ["vae", 0], prompt: "", ...encoderImages },
  };
  graph.positiveRef = {
    class_type: "FluxKontextMultiReferenceLatentMethod",
    inputs: { conditioning: ["positive", 0], reference_latents_method: "index_timestep_zero" },
  };
  graph.negativeRef = {
    class_type: "FluxKontextMultiReferenceLatentMethod",
    inputs: { conditioning: ["negative", 0], reference_latents_method: "index_timestep_zero" },
  };
  // Denoise is 1, so the starting latent only sets the output canvas size.
  const canvas = canvasSize(size, "qwen-edit-2511");
  graph.latent =
    size === "auto"
      ? { class_type: "VAEEncode", inputs: { pixels: ["scaled", 0], vae: ["vae", 0] } }
      : { class_type: "EmptySD3LatentImage", inputs: { width: canvas.width, height: canvas.height, batch_size: 1 } };
  graph.sampler = {
    class_type: "KSampler",
    inputs: {
      model,
      positive: ["positiveRef", 0],
      negative: ["negativeRef", 0],
      latent_image: ["latent", 0],
      seed,
      steps: preset.steps,
      cfg: preset.cfg,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1,
    },
  };
  graph.decode = { class_type: "VAEDecode", inputs: { samples: ["sampler", 0], vae: ["vae", 0] } };
  graph.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: prefix } };
  return graph;
}

// API-format graph equivalent to Comfy-Org's image_qwen_image_2_1(_turbo)_image_edit
// templates, with the optional prompt enhancer left off (the templates' default).
function qwen21Prompt({ images, prompt, quality, size = "auto", resolution = 1024, seed, prefix }: PromptOptions): ApiPrompt {
  const preset = IMAGE_EDIT_MODELS["qwen-image-2.1"].quality[quality];
  const graph: ApiPrompt = {
    unet: { class_type: "UNETLoader", inputs: { unet_name: preset.turbo ? QWEN21_FILES.turbo : QWEN21_FILES.unet, weight_dtype: "default" } },
    clip: { class_type: "CLIPLoader", inputs: { clip_name: QWEN21_FILES.clip, type: "qwen_image", device: "default" } },
    vae: { class_type: "VAELoader", inputs: { vae_name: QWEN21_FILES.vae } },
    cache: { class_type: "QwenImage21Cache", inputs: { model: ["unet", 0], device: "auto", dtype: "default" } },
  };
  const references: Record<string, Link> = {};
  images.forEach((name, index) => {
    graph[`image${index + 1}`] = { class_type: "LoadImage", inputs: { image: name } };
    references[`images.image_${index + 1}`] = [`image${index + 1}`, 0];
  });
  // resolution is a pixel budget: references are resized to about resolution² pixels.
  graph.encode = {
    class_type: "TextEncodeQwenImage21",
    inputs: { clip: ["clip", 0], vae: ["vae", 0], prompt, negative_prompt: "", resolution, ...references },
  };
  const canvas = canvasSize(size, "qwen-image-2.1", resolution);
  const latent: Link = size === "auto" ? ["encode", 2] : ["latent", 0];
  if (size !== "auto")
    graph.latent = { class_type: "EmptyLatentImage", inputs: { width: canvas.width, height: canvas.height, batch_size: 1 } };
  if (preset.turbo) {
    graph.noise = { class_type: "RandomNoise", inputs: { noise_seed: seed } };
    graph.samplerSelect = { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } };
    graph.sigmas = { class_type: "ManualSigmas", inputs: { sigmas: QWEN21_TURBO_SIGMAS } };
    graph.guider = {
      class_type: "CFGGuider",
      inputs: { model: ["cache", 0], positive: ["encode", 0], negative: ["encode", 1], cfg: preset.cfg },
    };
    graph.sampler = {
      class_type: "SamplerCustomAdvanced",
      inputs: { noise: ["noise", 0], guider: ["guider", 0], sampler: ["samplerSelect", 0], sigmas: ["sigmas", 0], latent_image: latent },
    };
  } else {
    graph.sampler = {
      class_type: "KSampler",
      inputs: {
        model: ["cache", 0],
        positive: ["encode", 0],
        negative: ["encode", 1],
        latent_image: latent,
        seed,
        steps: preset.steps,
        cfg: preset.cfg,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
      },
    };
  }
  graph.decode = { class_type: "VAEDecode", inputs: { samples: ["sampler", 0], vae: ["vae", 0] } };
  graph.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: prefix } };
  return graph;
}

// Fill any required input that a newer ComfyUI added since the template, using its default.
export function fillDefaults(graph: ApiPrompt, info: ObjectInfo) {
  for (const node of Object.values(graph)) {
    const required = info[node.class_type]?.input?.required ?? {};
    for (const [name, spec] of Object.entries(required)) {
      if (name in node.inputs) continue;
      const options = spec?.[1] as { default?: unknown } | undefined;
      if (options && "default" in options) node.inputs[name] = options.default;
    }
  }
  return graph;
}
