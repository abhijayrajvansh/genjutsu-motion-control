import "server-only";
import { IMAGE_EDIT_QUALITY, ImageEditQuality, QWEN_EDIT_FILES } from "@/lib/image-edit";
import { ObjectInfo } from "./comfy";

type Link = [string, number];
type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
export type ApiPrompt = Record<string, ApiNode>;

export const QWEN_EDIT_NODES = [
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
  "KSampler",
  "VAEDecode",
  "SaveImage",
];

// API-format graph equivalent to Comfy-Org's image_qwen_image_edit_2511 template.
// images[0] is the picture being edited; images[1..2] are optional references.
export function qwenEditPrompt({
  images,
  prompt,
  quality,
  seed,
  prefix,
}: {
  images: string[];
  prompt: string;
  quality: ImageEditQuality;
  seed: number;
  prefix: string;
}): ApiPrompt {
  const preset = IMAGE_EDIT_QUALITY[quality];
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
  graph.latent = { class_type: "VAEEncode", inputs: { pixels: ["scaled", 0], vae: ["vae", 0] } };
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
