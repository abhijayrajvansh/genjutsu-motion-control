# Image upscale workflow

Research notes for a ComfyUI image-to-image upscale that keeps photos realistic. Researched on 2026-11-07. Nothing here is wired into Genjutsu yet.

## Recommendation

Use ComfyUI's official template **Image Upscale: SeedVR2 7B Int8** (`utility_seedvr2_7b_int8_upscale_image.json`). It was added to the template library on 2026-07-13 and last changed on 2026-09-28.

Why this one:

- It uses only nodes built into ComfyUI. No custom node pack is needed.
- The model loads through `UNETLoader` as an `int8_convrot` file, the same format as the Qwen-Image 2.1 files in [`../qwen-image-edit`](../qwen-image-edit/README.md). It should fit on the same 24 GB rental.
- SeedVR2 is a one-step diffusion restorer, so it is fast. It also adds real detail instead of only sharpening.

## Models

All paths are under `ComfyUI/models/`. Source: `Comfy-Org/SeedVR2` on Hugging Face.

| Role | Folder | Filename | Size |
| --- | --- | --- | --- |
| Diffusion, 7B (recommended) | `diffusion_models/` | `seedvr2_7b_int8_convrot.safetensors` | 7.76 GB |
| VAE | `vae/` | `seedvr2_ema_vae_fp16.safetensors` | 478 MB |

The template library also has **Image Upscale: SeedVR2 3B Int8** (`utility_seedvr2_3b_int8_upscale_image.json`, about 4 GB total), which is lighter if VRAM is tight.

URLs:

- `https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/diffusion_models/seedvr2_7b_int8_convrot.safetensors`
- `https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/vae/seedvr2_ema_vae_fp16.safetensors`

## Graph

These are the nodes in the official 7B template, read from the JSON:

1. `LoadImage`
2. `ResizeImageMaskNode`: scale by multiplier **4**, `lanczos`
3. `SeedVR2Preprocess`
4. `UNETLoader`: `seedvr2_7b_int8_convrot.safetensors`, `weight_dtype` `default`
5. `VAELoader`: `seedvr2_ema_vae_fp16.safetensors`
6. `VAEEncodeTiled` / `VAEDecodeTiled`: tile 512, overlap 128, temporal 4096 / 8
7. `SeedVR2Conditioning`
8. `KSampler`: **1 step**, CFG 1, `euler`, `simple`, denoise 1
9. `SeedVR2PostProcessing`: `none`
10. `ImageCompare` (before and after) and `SaveImage`

Tips:

- ComfyUI's docs say to shrink the input to about **0.35 MP** with `ImageScaleToTotalPixels` before upscaling for better results.
- Use the latest ComfyUI. Older builds do not have the native SeedVR2 nodes.

## Older custom-node route

Before the native nodes, SeedVR2 ran through [`numz/ComfyUI-SeedVR2_VideoUpscaler`](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler). It is Apache-2.0, has about 3k stars, and its last release is v2.5.24 (2025-12-24). Its `example_workflows/` folder has `SeedVR2_4K_image_upscale.json` and `SeedVR2_simple_image_upscale.json`.

Settings from that repo:

- Color correction defaults to `wavelet`. The repo recommends `lab` for the highest fidelity.
- `input_noise_scale` softens fine detail such as skin. `latent_noise_scale` works best around 0.01 to 0.05.
- VRAM guide: 8 GB or less needs GGUF Q4_K_M with BlockSwap and VAE tiling. 12 to 16 GB can run FP8. 24 GB or more can run FP16.

The official template `utility_seedvr2_image_upscale.json` still uses these custom nodes (`SeedVR2LoadDiTModel`, `SeedVR2VideoUpscaler`, and others). Prefer the native int8 template.

## Evidence

| Claim | Source | How strong |
| --- | --- | --- |
| ComfyUI recommends SeedVR2 for realistic upscales and suggests the 0.35 MP downscale | ComfyUI docs and the Comfy blog handbook (2026-02-06) | Official, but there is no quality score |
| 1K to 4K takes about 40 s | Same | Speed only, and for the hosted WaveSpeed SeedVR2, not a local run |
| SeedVR2 was published at ICLR 2026 (ByteDance Seed and NTU) | Comfy-Org `site/knowledge/models/seedvr2.md` | Official summary |
| SeedVR2 skin looks more believable than SUPIR, which looks airbrushed | MyAIForce (2025-10-15) | One author, visual crops only. Their workflow file is behind a community sign-up |
| SUPIR is good for close-up portraits | aiofm.info (2026-04-25) | No images. The page has a RunPod referral link |

No independent, number-based quality benchmark was found. Two pages could not be read: the seedvr2.net comparison (the page body did not load) and Civitai model 2994006, a Qwen 2.1 detail-pass workflow (blocked with 403). Nothing here relies on them.

## Alternatives

| Option | Notes |
| --- | --- |
| SUPIR (`ComfyUI-SUPIR`) | Load Image → SUPIR Encoder → SUPIR Sampler → Save Image. 2 to 4×, CFG 7.5, 25 to 35 steps. Needs 16 GB+, or about 10 GB with CPU offload. Skin can come out airbrushed. Do not use it on line art. |
| Z-Image-Turbo 2K template | Official `utility_z_image_turbo_2k_upscaler.app.json`. An img2img re-detail pass at denoise 0.33. |
| Ultimate SD Upscale | Tiled img2img. Denoise 0.3 to 0.5, tile 512 to 768, padding 32. |
| ESRGAN models (4x-UltraSharp, RealESRGAN) | Fast and about 4 GB, but they only sharpen and do not add real detail. |
| Hosted (Magnific, Topaz, HitPaw, WaveSpeed SeedVR2) | Paid partner nodes. ComfyUI recommends Magnific Skin Enhancer for plastic-looking skin. |

## Video upscale

Researched on 2026-11-07. SeedVR2 was built for video restoration, so the same model can upscale video.

**There is no "SeedVR 2.5" model.** ByteDance has only released SeedVR2, in 3B and 7B sizes, under Apache-2.0. The "2.5" people mention is the version of the numz custom node pack (v2.5.24), not a new model. Seedance 2.5 is a different product: ByteDance's video generator, not an upscaler.

Official ComfyUI video templates:

| Template | Nodes | Model |
| --- | --- | --- |
| `utility_seedvr2_3b_int8_upscale_video.json` | Built into ComfyUI | SeedVR2 3B INT8 |
| `utility_seedvr2_video_upscale.json` | numz custom nodes (v2.5) | Can run 7B |

There is also a built-in subgraph blueprint, `upscale_video_seedvr2_3b_int8.json`.

Cost and limits:

- The Comfy blog reports about **312 s** to upscale a 10 s 720p clip to 1080p on an RTX 5090. FlashVSR, by comparison, took about 41 s.
- Users report it struggling on 16 GB cards, even with the smallest FP8 model. Plan on 24 GB or more.
- One reviewer says it can oversharpen video.
- Batch size must follow 4n+1: 5, 9, 13, 17, 21 and so on.
- The target `resolution` is the short edge: 720, 1080 or 2160.
- Color correction options are `wavelet`, `adain`, `hsv` or `none`.

**Use with Wan-Animate-2 output.** The Wan-Animate-2 BF16 preset renders 480 × 832 ([`artifacts/comfyui/wan-animate-2-bf16`](../../artifacts/comfyui/wan-animate-2-bf16/README.md)). The easiest starting point looks like the 3B INT8 video template, with the short edge set to 1080. That is a judgement call. No source tested it on Wan output.

Nothing for SeedVR2 is installed or wired up in this repo yet.

## Next step

Before shipping this, test it on the GPU: run the SeedVR2 7B int8 template next to SUPIR on two or three of our own photos, and check skin, eyes, and hair at 100% zoom.

## Sources

- [ComfyUI docs: Image upscaling](https://docs.comfy.org/tutorials/utility/image-upscale)
- [Comfy blog: The Complete AI Upscaling Handbook](https://blog.comfy.org/p/upscaling-in-comfyui)
- [Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates)
- [Comfy-Org/SeedVR2 on Hugging Face](https://huggingface.co/Comfy-Org/SeedVR2)
- [numz/ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler)
- [MyAIForce: SeedVR2 + SRPO upscaling](https://myaiforce.com/seedvr2-srpo-upscaling/)
- [aiofm: AI Image Upscaling in 2026](https://aiofm.info/en/guides/ai-image-upscaling)
- [ComfyUI docs: SeedVR2](https://docs.comfy.org/tutorials/utility/seedvr2)
- [RunComfy: SeedVR2 V2.5 in ComfyUI](https://www.runcomfy.com/comfyui-workflows/seedvr2-v2-5-in-comfyui-high-fidelity-video-upscaler)
- [comfy.icu: SeedVR2 Video Upscaler v2.5.24](https://comfy.icu/node/SeedVR2VideoUpscaler)
- [weirdwonderfulai: SeedVR2 for video and images](https://weirdwonderfulai.art/resources/seedvr2-upscaler-for-video-and-images/)
- [HitPaw: SeedVR2 review](https://www.hitpaw.com/ai-video-enhancer-tips/seedvr2-video-upscaler.html)
- [seedvr2.net comparison (could not be read)](https://seedvr2.net/blog/tutorials/seedvr2-upscalers-battle-comparison-2026)
- [Civitai 2994006 (could not be read)](https://civitai.com/models/2994006)
