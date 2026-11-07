import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { H3_ACCELERATIONS, H3_DEFAULT_MODEL, H3_MARGINS, H3_MOTION_SIZES, hasSpeedLora } from "@/lib/h3-swap";
import type { H3Margin, H3ModelSettings, H3MotionSize, H3Resolution, H3Section, H3Size, H3SwapSettings } from "@/lib/h3-swap";
import { comboOptions, type ObjectInfo } from "./comfy";

// Openjutsu's Simple motion transfer (MIT, D3voz), adapted from its lib/simple.ts, lib/model.ts and lib/comfy.ts.
// The exports carry the hat fix and No lip-sync; each request prunes what it does not use.

export type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } };
export type ApiGraph = Record<string, ApiNode>;
export type H3Workflow = "simple" | "mask";

// Node ids in simple.api.json.
export const NODES = {
  picture: "2",
  video: "5",
  plan: "11",
  target: "24",
  peopleMask: "39",
  growMask: "42",
  final: "67",
  hat: ["47", "48", "49", "50", "51", "52"],
};

// Node ids in mask.api.json.
export const MASK_NODES = {
  video: "1",
  target: "3",
  peopleMask: "7",
  growMask: "9",
  combine: "18",
  hat: ["10", "11", "12", "13", "19", "20"],
};

const directory = path.join(process.cwd(), "artifacts", "comfyui", "openjutsu-h3");

export async function loadGraph(kind: H3Workflow): Promise<ApiGraph> {
  const graph: ApiGraph = JSON.parse(await readFile(path.join(directory, `${kind}.api.json`), "utf8"));
  silenceWhenSoundless(graph);
  return graph;
}

export function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number";
}

export function nodeByTitle(graph: ApiGraph, title: string) {
  const ids = Object.keys(graph).filter((id) => graph[id]._meta?.title === title);
  if (ids.length !== 1) throw new Error(`Expected one "${title}" node in the workflow, found ${ids.length}.`);
  return ids[0];
}

// VHS fails as soon as anything reads the soundtrack of a video that has none, so every reader gets silence instead.
function silenceWhenSoundless(graph: ApiGraph) {
  for (const id of Object.keys(graph).filter((id) => graph[id].class_type === "VHS_LoadVideo")) {
    const soundtrack = `${id}_soundtrack`;
    let read = false;
    for (const node of Object.values(graph)) {
      for (const [name, value] of Object.entries(node.inputs)) {
        if (isLink(value) && value[0] === id && value[1] === 2) {
          node.inputs[name] = [soundtrack, 0];
          read = true;
        }
      }
    }
    if (read)
      graph[soundtrack] = { class_type: "H3SoundtrackOrSilence", inputs: { audio: [id, 2], video_info: [id, 3] }, _meta: { title: "Soundtrack (silence if none)" } };
  }
}

function checkLinks(graph: ApiGraph) {
  for (const [id, node] of Object.entries(graph)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (isLink(value) && !graph[value[0]]) throw new Error(`Node ${id}.${name} still links to removed node ${value[0]}.`);
    }
  }
}

type MaskNodes = { target: string; hat: string[]; growMask: string; peopleMask: string };
function maskSettings(source: ApiGraph, hatFix: boolean, margin: H3Margin, target: string, nodes: MaskNodes): ApiGraph {
  const graph: ApiGraph = structuredClone(source);
  graph[nodes.target].inputs.text = target;
  graph[nodes.growMask].inputs.expand = H3_MARGINS[margin];
  if (!hatFix) {
    for (const id of nodes.hat) delete graph[id];
    graph[nodes.growMask].inputs.mask = [nodes.peopleMask, 0];
  }
  checkLinks(graph);
  return graph;
}

const MUTE = /^Mute the (clip|reference) audio H3 hears$/;
const NO_LIP_SYNC = /^(No lip-sync in the prompt|SAM: faces|SAM 3\.1 track faces|Faces \(shown on the mannequins?\))$/;

// No lip-sync off: the nodes go, H3 hears the soundtrack again and the mannequins get no faces.
function dropNoLipSync(graph: ApiGraph) {
  const through = new Map<string, unknown>();
  for (const [id, node] of Object.entries(graph)) {
    const title = node._meta?.title ?? "";
    if (MUTE.test(title)) through.set(id, node.inputs.audio);
    else if (NO_LIP_SYNC.test(title)) through.set(id, undefined);
  }
  for (const id of through.keys()) delete graph[id];
  for (const [id, node] of Object.entries(graph)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (!isLink(value) || !through.has(value[0])) continue;
      if (through.get(value[0])) node.inputs[name] = through.get(value[0]);
      else if (["no_lip_sync", "faces", "face_size"].includes(name)) delete node.inputs[name];
      else throw new Error(`Node ${id}.${name} still links to removed node ${value[0]}.`);
    }
  }
}

// Settings the Swap Plan's run name does not know get their own run, so a rerun never resumes from clips made without them.
function suffixRunName(graph: ApiGraph, id: string, suffix: string, title: string) {
  const plans = Object.values(graph).filter((node) => node.class_type === "MiniMaxH3ChainPlanModern");
  if (plans.length !== 1) throw new Error(`Expected one Production Plan node in the workflow, found ${plans.length}.`);
  graph[id] = { class_type: "StringConcatenate", inputs: { string_a: plans[0].inputs.run_name, string_b: suffix, delimiter: "" }, _meta: { title } };
  plans[0].inputs.run_name = [id, 0];
}

function setMotionSize(graph: ApiGraph, size: H3MotionSize) {
  const nodes = Object.values(graph).filter((node) => node.class_type === "ImageScaleToMaxDimension" && /motion reference/i.test(node._meta?.title ?? ""));
  if (!nodes.length) throw new Error("Expected a motion reference resize in the workflow.");
  for (const node of nodes) node.inputs.largest_size = size;
  if (size === H3_MOTION_SIZES[0]) return;
  suffixRunName(graph, "motion_run_name", `_motion${size}`, "Run name for this motion reference size");
}

// A custom size scales and centre-crops the source frames before anything reads them.
function cropSource(graph: ApiGraph, video: string, size: H3Size) {
  for (const node of Object.values(graph)) {
    for (const [name, value] of Object.entries(node.inputs)) if (isLink(value) && value[0] === video && value[1] === 0) node.inputs[name] = ["custom_size", 0];
  }
  graph.custom_size = {
    class_type: "ImageScale",
    inputs: { image: [video, 0], upscale_method: "bilinear", width: size.width, height: size.height, crop: "center" },
    _meta: { title: "Custom size (centre crop)" },
  };
}

function setResolution(graph: ApiGraph, plan: string, video: string, resolution: H3Resolution) {
  if (typeof resolution === "string") {
    graph[plan].inputs.resolution = resolution;
    return;
  }
  cropSource(graph, video, resolution);
  graph[plan].inputs.short_edge = Math.min(resolution.width, resolution.height);
}

// Every export loads the video at force_rate 24; VHS cuts the soundtrack to the same part.
function setSection(graph: ApiGraph, video: string, section: H3Section) {
  graph[video].inputs.skip_first_frames = Math.round(section.start * 24);
  graph[video].inputs.frame_load_cap = Math.round(section.length * 24);
}

export function checkAcceleration(settings: H3ModelSettings) {
  if (!H3_ACCELERATIONS.includes(settings.acceleration ?? "none")) throw new Error("Choose a supported acceleration option.");
  if (settings.acceleration === "spectrum" && hasSpeedLora(settings.loras)) throw new Error("Turn off Spectrum or remove the speed LoRA.");
}

// Steps, model components and the LoRA chain that replaces the "DMAD LoRA" node.
function applyModel(graph: ApiGraph, settings: H3ModelSettings) {
  checkAcceleration(settings);
  graph[nodeByTitle(graph, "Describer: Qwen3-VL 8B")].inputs.clip_name = settings.describer ?? H3_DEFAULT_MODEL.describer;
  for (const [title, input, value] of [
    ["H3 Text Encoder", "clip_name", settings.textEncoder ?? H3_DEFAULT_MODEL.textEncoder],
    ["Video VAE", "vae_name", settings.videoVae ?? H3_DEFAULT_MODEL.videoVae],
    ["Audio VAE", "vae_name", settings.audioVae ?? H3_DEFAULT_MODEL.audioVae],
  ] as const)
    graph[nodeByTitle(graph, title)].inputs[input] = value;
  const plans = Object.values(graph).filter((node) => node.class_type === "H3OneClickSwapPlan");
  if (plans.length !== 1) throw new Error(`Expected one Swap Plan node in the workflow, found ${plans.length}.`);
  plans[0].inputs.steps = settings.steps;
  const unet = nodeByTitle(graph, "H3 Diffusion Model");
  const lora = nodeByTitle(graph, "DMAD LoRA");
  graph[unet].inputs.unet_name = settings.model;

  const template = graph[lora];
  delete graph[lora];
  let last: [string, number] = [unet, 0];
  settings.loras
    .filter((item) => item.enabled !== false)
    .forEach((item, i) => {
      const id = i === 0 ? lora : `${lora}_lora${i + 1}`;
      graph[id] = { ...template, inputs: { ...template.inputs, lora_name: item.name, strength_model: item.strength, model: last }, _meta: { title: `LoRA ${i + 1}` } };
      last = [id, 0];
    });
  for (const [id, node] of Object.entries(graph)) {
    if (id === lora || id.startsWith(`${lora}_lora`)) continue;
    for (const [name, value] of Object.entries(node.inputs)) if (isLink(value) && value[0] === lora) node.inputs[name] = last;
  }

  // Separate saved clips when model components change; default runs stay resumable.
  const componentKey = (value: H3ModelSettings) =>
    JSON.stringify([
      value.model,
      value.loras.filter((item) => item.enabled !== false && item.strength !== 0).map(({ name, strength }) => [name, strength]),
      value.textEncoder ?? H3_DEFAULT_MODEL.textEncoder,
      value.videoVae ?? H3_DEFAULT_MODEL.videoVae,
      value.audioVae ?? H3_DEFAULT_MODEL.audioVae,
      value.acceleration ?? "none",
      ...(value.describer && value.describer !== H3_DEFAULT_MODEL.describer ? [value.describer] : []),
    ]);
  const key = componentKey(settings);
  if (key !== componentKey(H3_DEFAULT_MODEL)) {
    let hash = BigInt("14695981039346656037");
    for (const char of key) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * BigInt("1099511628211"));
    suffixRunName(graph, "model_run_name", `_model${hash.toString(16)}`, "Run name for these model components");
  }

  if (settings.acceleration === "spectrum") {
    const patched = new Map<string, string>();
    for (const node of Object.values(graph)) {
      if (node.class_type !== "BasicGuider" && node.class_type !== "CFGGuider") continue;
      const model = node.inputs.model as [string, number];
      const linkKey = JSON.stringify(model);
      let id = patched.get(linkKey);
      if (!id) {
        id = `${model[0]}_spectrum`;
        graph[id] = {
          class_type: "SpectrumApplyMiniMaxH3",
          inputs: {
            model, enabled: true, blend_weight: 0.5, degree: 1, ridge_lambda: 0.1,
            window_size: 2, flex_window: 0.75, warmup_steps: 1, tail_actual_steps: 1,
            max_history: 8, debug: false, history_storage: "system_ram",
            audio_blend_weight: 0, offline_smoothing_replay: true,
          },
          _meta: { title: "Spectrum acceleration" },
        };
        patched.set(linkKey, id);
      }
      node.inputs.model = [id, 0];
    }
  }
}

// The swap graph for one job: uploaded file names, settings, model components and a unique output name.
export function swapGraph(
  source: ApiGraph,
  o: { video: string; picture: string; section: H3Section; settings: H3SwapSettings; model: H3ModelSettings; outputName: string },
): ApiGraph {
  const graph = maskSettings(source, o.settings.hatFix, o.settings.margin, o.settings.target, NODES);
  if (!o.settings.noLipSync) dropNoLipSync(graph);
  setMotionSize(graph, o.settings.motion);
  setResolution(graph, NODES.plan, NODES.video, o.settings.resolution);
  const plan = graph[NODES.plan].inputs;
  plan.seed = o.settings.seed;
  plan.clip_seconds = o.settings.clipSeconds;
  plan.roles = o.settings.role.replace(/\s+/g, " ").trim();
  applyModel(graph, o.model);
  setSection(graph, NODES.video, o.section);
  graph[NODES.video].inputs.video = o.video;
  graph[NODES.picture].inputs.image = o.picture;
  graph[NODES.final].inputs.filename = o.outputName;
  checkLinks(graph);
  return graph;
}

export function maskGraph(
  source: ApiGraph,
  o: { video: string; section: H3Section; hatFix: boolean; margin: H3Margin; target: string; outputName: string },
): ApiGraph {
  const graph = maskSettings(source, o.hatFix, o.margin, o.target, MASK_NODES);
  setSection(graph, MASK_NODES.video, o.section);
  graph[MASK_NODES.video].inputs.video = o.video;
  graph[MASK_NODES.combine].inputs.filename_prefix = o.outputName;
  return graph;
}

// Node types both workflows use, plus the ones requests may add.
export async function requiredNodes(): Promise<string[]> {
  const types = new Set<string>(["H3SoundtrackOrSilence", "StringConcatenate", "ImageScale"]);
  for (const kind of ["simple", "mask"] as const) for (const node of Object.values(await loadGraph(kind))) types.add(node.class_type);
  return [...types].sort();
}

// Missing node types and model files (every combo value the default graphs use that ComfyUI does not list).
export async function inspectReadiness(info: ObjectInfo) {
  const nodes = await requiredNodes();
  const missingNodes = nodes.filter((node) => !info[node]);
  const missingModels = new Set<string>();
  for (const kind of ["simple", "mask"] as const) {
    for (const node of Object.values(await loadGraph(kind))) {
      if (!info[node.class_type]) continue;
      for (const [input, value] of Object.entries(node.inputs)) {
        if (typeof value !== "string" || !value || !/\.(safetensors|pt|pth|bin|ckpt|gguf)$/i.test(value)) continue;
        const options = comboOptions(info, node.class_type, input);
        if (options.length && !options.includes(value)) missingModels.add(value);
      }
    }
  }
  return { ready: !missingNodes.length && !missingModels.size, missingNodes, missingModels: [...missingModels] };
}
