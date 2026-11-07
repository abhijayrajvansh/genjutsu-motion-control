import { H3Status, H3TonePreset } from "@/lib/h3-swap";
import type { ComfyServer } from "@/lib/server/comfy";
import { comboOptions, comfyJson, comfyServer, objectInfo } from "@/lib/server/comfy";
import { inspectReadiness, requiredNodes } from "@/lib/server/h3-workflow";
import { ApiError, json } from "@/lib/server/kie";
export const runtime = "nodejs";
export const maxDuration = 60;

type SystemStats = {
  system?: { comfyui_version?: string };
  devices?: { name?: string; type?: string; vram_total?: number }[];
};
type Queue = { queue_running?: unknown[]; queue_pending?: unknown[] };

const LOADERS = ["UNETLoader", "LoraLoaderModelOnly", "CLIPLoader", "VAELoader"];

// Orion4D's saved DCTL Tone Mapper presets; empty when the pack does not answer.
async function tonePresets(server: ComfyServer): Promise<H3TonePreset[]> {
  try {
    const { presets } = await comfyJson<{ presets?: string[] }>(server, "/orion4d_fxmax/presets/color_fx_dctl_tone_mapper");
    if (!Array.isArray(presets)) return [];
    const loaded = await Promise.all(
      presets.slice(0, 50).map(async (name) => {
        try {
          const data = await comfyJson<{ settings?: Record<string, unknown> }>(server, `/orion4d_fxmax/preset/color_fx_dctl_tone_mapper/${encodeURIComponent(name)}`);
          return data.settings && typeof data.settings === "object" ? { name, settings: data.settings } : null;
        } catch {
          return null;
        }
      }),
    );
    return loaded.filter((item): item is H3TonePreset => !!item);
  } catch {
    return [];
  }
}

// Check the ComfyUI link: GPU, whether the H3 swap can run, and the model files the pickers offer.
export async function GET(req: Request) {
  let status: H3Status = { ok: false };
  try {
    const server = comfyServer(req);
    status.server = server.origin;
    const [stats, queue] = await Promise.all([comfyJson<SystemStats>(server, "/system_stats"), comfyJson<Queue>(server, "/queue")]);
    const gpu = stats.devices?.find((device) => device.type === "cuda") ?? stats.devices?.[0];
    const nodes = [...new Set([...(await requiredNodes()), ...LOADERS])];
    const info = await objectInfo(server, nodes);
    status = {
      ok: true,
      server: server.origin,
      gpu: gpu?.name?.replace(/^cuda:\d+\s*/, "").replace(/\s*:\s*cudaMallocAsync$/, ""),
      vramGB: gpu?.vram_total ? Math.round(gpu.vram_total / 1024 ** 3) : undefined,
      comfyVersion: stats.system?.comfyui_version,
      readiness: await inspectReadiness(info, "swap"),
      face: await inspectReadiness(info, "face"),
      color: await inspectReadiness(info, "color"),
      presets: new URL(req.url).searchParams.get("presets") === "1" ? await tonePresets(server) : undefined,
      files: {
        models: comboOptions(info, "UNETLoader", "unet_name"),
        loras: comboOptions(info, "LoraLoaderModelOnly", "lora_name"),
        textEncoders: comboOptions(info, "CLIPLoader", "clip_name"),
        vaes: comboOptions(info, "VAELoader", "vae_name"),
      },
      queue: { running: queue.queue_running?.length ?? 0, pending: queue.queue_pending?.length ?? 0 },
    };
    return json({ status });
  } catch (error) {
    status.error = error instanceof ApiError ? error.message : "ComfyUI could not be checked.";
    return json({ status }, error instanceof ApiError && error.status === 401 ? 401 : 200);
  }
}
