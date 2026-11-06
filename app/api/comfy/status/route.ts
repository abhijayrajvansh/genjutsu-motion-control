import { ComfyStatus, ImageEditModel, IMAGE_EDIT_MODELS, ModelReadiness } from "@/lib/image-edit";
import { comboOptions, comfyJson, comfyServer, ObjectInfo, objectInfo } from "@/lib/server/comfy";
import { ApiError, json } from "@/lib/server/kie";
import { ALL_NODES, MODEL_NODES, requiredFiles } from "@/lib/server/qwen-edit-workflow";
export const runtime = "nodejs";

type SystemStats = {
  system?: { comfyui_version?: string };
  devices?: { name?: string; type?: string; vram_total?: number }[];
};
type Queue = { queue_running?: unknown[]; queue_pending?: unknown[] };

function readiness(model: ImageEditModel, info: ObjectInfo): ModelReadiness {
  const missingNodes = MODEL_NODES[model].filter((node) => !info[node]);
  if (
    model === "qwen-edit-2511" &&
    info.FluxKontextMultiReferenceLatentMethod &&
    !comboOptions(info, "FluxKontextMultiReferenceLatentMethod", "reference_latents_method").includes("index_timestep_zero")
  )
    missingNodes.push("FluxKontextMultiReferenceLatentMethod (index_timestep_zero)");
  const installed = ([node, input, file]: [string, string, string]) => comboOptions(info, node, input).includes(file);
  const folder: Record<string, string> = { UNETLoader: "diffusion_models", CLIPLoader: "text_encoders", VAELoader: "vae", LoraLoaderModelOnly: "loras" };
  const missingModels = requiredFiles(model, false)
    .filter((file) => !installed(file))
    .map(([node, , file]) => `${folder[node]}/${file}`);
  const fastFile = requiredFiles(model, true).find((file) => !requiredFiles(model, false).some((base) => base[2] === file[2]));
  return {
    ready: !missingNodes.length && !missingModels.length,
    missingNodes,
    missingModels,
    fast: !fastFile || installed(fastFile),
  };
}

// Check the ComfyUI link and which Qwen models it can run.
export async function GET(req: Request) {
  let status: ComfyStatus = { ok: false };
  try {
    const server = comfyServer(req);
    status.server = server.origin;
    const [stats, queue] = await Promise.all([
      comfyJson<SystemStats>(server, "/system_stats"),
      comfyJson<Queue>(server, "/queue"),
    ]);
    const gpu = stats.devices?.find((device) => device.type === "cuda") ?? stats.devices?.[0];
    const info = await objectInfo(server, ALL_NODES);
    const models = Object.fromEntries(
      (Object.keys(IMAGE_EDIT_MODELS) as ImageEditModel[]).map((model) => [model, readiness(model, info)]),
    ) as Record<ImageEditModel, ModelReadiness>;
    status = {
      ok: true,
      server: server.origin,
      gpu: gpu?.name?.replace(/^cuda:\d+\s*/, "").replace(/\s*:\s*cudaMallocAsync$/, ""),
      vramGB: gpu?.vram_total ? Math.round(gpu.vram_total / 1024 ** 3) : undefined,
      comfyVersion: stats.system?.comfyui_version,
      models,
      queue: { running: queue.queue_running?.length ?? 0, pending: queue.queue_pending?.length ?? 0 },
    };
    return json({ status });
  } catch (error) {
    status.error = error instanceof ApiError ? error.message : "ComfyUI could not be checked.";
    return json({ status }, error instanceof ApiError && error.status === 401 ? 401 : 200);
  }
}
