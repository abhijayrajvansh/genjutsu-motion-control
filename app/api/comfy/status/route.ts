import { ComfyStatus, QWEN_EDIT_FILES } from "@/lib/image-edit";
import { comboOptions, comfyJson, comfyServer, objectInfo } from "@/lib/server/comfy";
import { ApiError, json } from "@/lib/server/kie";
import { QWEN_EDIT_NODES } from "@/lib/server/qwen-edit-workflow";
export const runtime = "nodejs";

type SystemStats = {
  system?: { comfyui_version?: string };
  devices?: { name?: string; type?: string; vram_total?: number }[];
};
type Queue = { queue_running?: unknown[]; queue_pending?: unknown[] };

// Check the ComfyUI link, the Qwen Edit nodes and the model files it needs.
export async function GET(req: Request) {
  let status: ComfyStatus = { ok: false, missingNodes: [], missingModels: [], lightning: false };
  try {
    const server = comfyServer(req);
    status.server = server.origin;
    const [stats, queue] = await Promise.all([
      comfyJson<SystemStats>(server, "/system_stats"),
      comfyJson<Queue>(server, "/queue"),
    ]);
    const gpu = stats.devices?.find((device) => device.type === "cuda") ?? stats.devices?.[0];
    const info = await objectInfo(server, QWEN_EDIT_NODES);
    const missingNodes = QWEN_EDIT_NODES.filter((node) => !info[node]);
    if (info.FluxKontextMultiReferenceLatentMethod && !comboOptions(info, "FluxKontextMultiReferenceLatentMethod", "reference_latents_method").includes("index_timestep_zero"))
      missingNodes.push("FluxKontextMultiReferenceLatentMethod (index_timestep_zero — update ComfyUI)");
    const has = (node: string, input: string, file: string) => comboOptions(info, node, input).includes(file);
    const missingModels = [
      !has("UNETLoader", "unet_name", QWEN_EDIT_FILES.unet) && `diffusion_models/${QWEN_EDIT_FILES.unet}`,
      !has("CLIPLoader", "clip_name", QWEN_EDIT_FILES.clip) && `text_encoders/${QWEN_EDIT_FILES.clip}`,
      !has("VAELoader", "vae_name", QWEN_EDIT_FILES.vae) && `vae/${QWEN_EDIT_FILES.vae}`,
    ].filter((value): value is string => !!value);
    status = {
      ok: !missingNodes.length && !missingModels.length,
      server: server.origin,
      gpu: gpu?.name?.replace(/^cuda:\d+\s*/, "").replace(/\s*:\s*cudaMallocAsync$/, ""),
      vramGB: gpu?.vram_total ? Math.round(gpu.vram_total / 1024 ** 3) : undefined,
      comfyVersion: stats.system?.comfyui_version,
      missingNodes,
      missingModels,
      lightning: has("LoraLoaderModelOnly", "lora_name", QWEN_EDIT_FILES.lightning),
      queue: { running: queue.queue_running?.length ?? 0, pending: queue.queue_pending?.length ?? 0 },
    };
    return json({ status });
  } catch (error) {
    status.error = error instanceof ApiError ? error.message : "ComfyUI could not be checked.";
    return json({ status }, error instanceof ApiError && error.status === 401 ? 401 : 200);
  }
}
