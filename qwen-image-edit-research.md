# Qwen-Image-Edit-2511 for ComfyUI

Research date: 2026-11-06. I listed the files and sizes from the Hugging Face API. The workflow settings come from the official ComfyUI template JSON.

## Required for every variant

| Folder | File | Size | Source |
|---|---|---|---|
| `models/text_encoders/` | `qwen_2.5_vl_7b_fp8_scaled.safetensors` (alternatives: `qwen_2.5_vl_7b.safetensors` bf16 16.6 GB, `qwen_2.5_vl_7b_nvfp4.safetensors` 6.1 GB) | 9.4 GB | [Comfy-Org/Qwen-Image](https://huggingface.co/Comfy-Org/Qwen-Image) |
| `models/vae/` | `qwen_image_vae.safetensors` | 0.25 GB | [Comfy-Org/Qwen-Image](https://huggingface.co/Comfy-Org/Qwen-Image) |

## Diffusion model variants

These files go in `models/diffusion_models/`, except the GGUF files, which go in `models/unet/`.

| Variant | File | Size | Repo / requirement |
|---|---|---|---|
| bf16 (full precision) | `qwen_image_edit_2511_bf16.safetensors` | 40.9 GB | [Comfy-Org/Qwen-Image-Edit](https://huggingface.co/Comfy-Org/Qwen-Image-Edit), official |
| fp8mixed (recommended) | `qwen_image_edit_2511_fp8mixed.safetensors` | 20.5 GB | Comfy-Org, official, used by the template |
| int8 convrot | `qwen_image_edit_2511_int8_convrot.safetensors` | 20.5 GB | Comfy-Org, official |
| fp8 scaled | `qwen_image_edit_2511_fp8_e4m3fn_scaled.safetensors` | 20.5 GB | [lightx2v/Qwen-Image-Edit-2511-Lightning](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning) |
| fp8 with Lightning merged (4-step) | `qwen_image_edit_2511_fp8_e4m3fn_scaled_lightning_comfyui_4steps_v1.0.safetensors` | 20.5 GB | lightx2v (no LoRA needed) |
| fp8 e4m3fn | `Qwen-Image-Edit-2511-FP8_e4m3fn.safetensors` | 20.4 GB | [1038lab/Qwen-Image-Edit-2511-FP8](https://huggingface.co/1038lab/Qwen-Image-Edit-2511-FP8) |
| int8 convrot (community) | `qwen_image_edit_2511_int8_convrot.safetensors` / `…_learned_rounding` | 20.6 GB | [cardamonnl/Qwen-Image-Edit-2511-int8-convrot](https://huggingface.co/cardamonnl/Qwen-Image-Edit-2511-int8-convrot) |
| NVFP4 | `qwen_image_edit_2511_nvfp4.safetensors` | 19.8 GB | [Bedovyy/Qwen-Image-Edit-2511-NVFP4](https://huggingface.co/Bedovyy/Qwen-Image-Edit-2511-NVFP4), RTX 50-series only |
| GGUF | `qwen-image-edit-2511-{Q2_K … Q8_0, F16, BF16}.gguf` | 7.7–40.9 GB | [unsloth/Qwen-Image-Edit-2511-GGUF](https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF), needs the **ComfyUI-GGUF** custom node |
| Nunchaku int4 / fp4 | `nunchaku_qwen_image_edit_2511_{ultimate_speed,balance,best_quality}_{int4,fp4}.safetensors` | 11.5–14.6 GB | [QuantFunc/Nunchaku-Qwen-Image-EDIT-2511](https://huggingface.co/QuantFunc/Nunchaku-Qwen-Image-EDIT-2511), needs **ComfyUI-nunchaku** and an NVIDIA GPU (int4 for RTX 20–40, fp4 for RTX 50) |

### GGUF sizes (unsloth)

| Quant | Size |
|---|---|
| Q2_K | 7.7 GB |
| Q3_K_S / Q3_K_M / Q3_K_L | 9.3 / 9.9 / 10.6 GB |
| Q4_0 / Q4_K_S / Q4_K_M / Q4_1 | 11.9 / 12.5 / 12.8 / 12.8 GB |
| Q5_0 / Q5_K_S / Q5_K_M / Q5_1 | 14.4 / 14.4 / 15.4 / 15.4 GB |
| Q6_K | 18.0 GB |
| Q8_0 | 22.4 GB |
| F16 / BF16 | 40.9 GB |

## LoRAs (`models/loras/`)

| LoRA | Files | Size | Repo |
|---|---|---|---|
| Lightning 4-step | `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` (fp32 1.7 GB also available) | 0.85 GB | [lightx2v](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning) |
| Lightning 8-step | `Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` | 0.85 GB | lightx2v |
| Multiple angles | `qwen-image-edit-2511-multiple-angles-lora.safetensors` | 0.3 GB | [fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) |
| Style / task LoRAs | Upscale, Unblur-Upscale, Object Remover, Object Adder, Anime, Ultra/Hyper-Realistic Portrait, Polaroid, Pixar-Inspired 3D | — | [prithivMLmods](https://huggingface.co/prithivMLmods) and others |
| Upscale 2K | — | — | [starsfriday/Qwen-Image-Edit-2511-Upscale2K](https://huggingface.co/starsfriday/Qwen-Image-Edit-2511-Upscale2K), [joyfox/Qwen-Image-Edit-2511-Upscale2K](https://huggingface.co/joyfox/Qwen-Image-Edit-2511-Upscale2K) |

## Official ComfyUI workflow templates

In ComfyUI, go to **Templates** and search for "Qwen Image Edit 2511". The same templates are in [Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates/tree/main/templates):

- `image_qwen_image_edit_2511.json`: fp8mixed, with a toggle for the 4-step Lightning LoRA
- `image_qwen_image_edit_2511_int8.json`
- `image-qwen_image_edit_2511_lora_inflation.json`: a LoRA example
- `template_qwen_image_edit_2511_systms_action.json`: a LoRA example

### Node chain and settings (from `image_qwen_image_edit_2511.json`)

- `UNETLoader` (`qwen_image_edit_2511_fp8mixed`) → optional `LoraLoaderModelOnly` (Lightning 4-step) → `ModelSamplingAuraFlow` (shift **3.1**) → `CFGNorm` (1.0)
- `CLIPLoader` (`qwen_2.5_vl_7b_fp8_scaled`, type `qwen_image`) → `TextEncodeQwenImageEditPlus` (positive and negative). It accepts up to 3 reference images.
- `LoadImage` → `FluxKontextImageScale` → `VAEEncode`, plus `FluxKontextMultiReferenceLatentMethod` (`index_timestep_zero`)
- `KSampler` → `VAEDecode` → `SaveImage`

| Mode | Steps | CFG | Sampler / scheduler |
|---|---|---|---|
| Standard | 40 | 4 | euler / simple |
| Lightning LoRA | 4 (or 8 with the 8-step LoRA) | 1 | euler / simple |

## Which one to pick

- **24 GB+ VRAM (NVIDIA):** fp8mixed with the Lightning 4-step LoRA, or the merged lightx2v fp8 Lightning checkpoint.
- **12–16 GB VRAM:** GGUF Q4_K_M or Q5_K_M, or Nunchaku int4/fp4.
- **RTX 50-series:** NVFP4 or Nunchaku fp4.
- **Apple Silicon Mac:** GGUF through ComfyUI-GGUF. fp8, NVFP4 and Nunchaku need NVIDIA. The `mflux-community/qwen-image-edit-2511-mflux-*` repos are for mflux, not ComfyUI.

---

## Related: Qwen Image 2.0 / 2.1 (kie.ai)

- [kie.ai/qwen-image-2](https://kie.ai/qwen-image-2) serves Alibaba **Qwen Image 2.0**, which does both text-to-image and editing at up to 2K. Its API endpoints are `qwen2/text-to-image` and `qwen2/image-edit`. As far as I could find, the 2.0 weights have not been released, but the newest source I found is from June 2026.
- The open-weights successor is **Qwen-Image-2.1** ([Qwen/Qwen-Image-2.1](https://huggingface.co/Qwen/Qwen-Image-2.1), with ComfyUI files at [Comfy-Org/Qwen-Image-2.1](https://huggingface.co/Comfy-Org/Qwen-Image-2.1)). ComfyUI has supported it since 2026-09-20. Its license is the Qwen Research License, which does not allow commercial use without a separate agreement.
- Files:
  - `diffusion_models/`: `qwen_image_2.1_int8_convrot` (7.3 GB). The other versions are bf16 (14.2 GB) and turbo.
  - `text_encoders/`: `qwen3vl_8b_int8_convrot` (9.35 GB). The other option is w4a8 (6.3 GB).
  - `vae/`: `qwen_image_2.1_vae_bf16` (676 MB).
- Templates:
  - `image_qwen_image_2_1_t2i`: 25 steps, cfg 1, euler/simple, 1024×1024
  - `image_qwen_image_2_1_turbo_t2i`: 8 manual sigmas, cfg 1, euler
  - `image_qwen_image_2_1_image_edit` and `…_turbo_image_edit`
