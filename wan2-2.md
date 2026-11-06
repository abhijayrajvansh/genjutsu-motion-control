# Wan 2.2 video for ComfyUI

Saved 2026-11-07. This is the video step after Qwen-Image 2.1 stills. Qwen 2.1 stays the image editor. Wan 2.2 makes the clip.

The quality workflow is the official ComfyUI template **Wan2.2 14B Image to Video** (`video_wan2_2_14B_i2v`). It turns one still into a video and keeps that picture. License is Apache 2.0, so commercial use is allowed.

Workflow: [video_wan2_2_14B_i2v.json](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_wan2_2_14B_i2v.json)

Docs: [Wan2.2 ComfyUI native workflow](https://docs.comfy.org/tutorials/video/wan/wan2_2)

Weights: [Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged). The text encoder is in [Comfy-Org/Wan_2.1_ComfyUI_repackaged](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged).

## Use this set

FP8 scaled 14B image-to-video. ComfyUI loads one expert at a time. About **35.6 GB** on disk. File sizes are the Hugging Face byte counts.

| Folder | File | Bytes | Size |
|---|---|---|---|
| `models/diffusion_models/` | `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors` | 14294742832 | 14.3 GB |
| `models/diffusion_models/` | `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors` | 14294742832 | 14.3 GB |
| `models/text_encoders/` | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 6735906897 | 6.7 GB |
| `models/vae/` | `wan_2.1_vae.safetensors` | 253815318 | 0.25 GB |

## GPU and disk

- **GPU:** 24 GB NVIDIA. RTX 3090 or RTX 4090. A 3090 runs it. FP8 weights are computed as BF16 on Ampere, so a 3090 is slower than a 4090.
- **Resolution:** aim for 720p. Use 480p if the card runs out of memory.
- **System RAM:** 32 GB minimum, 64 GB is safer because ComfyUI offloads weights.
- **Disk:** about 36 GB for these four files. Rent about 100 GB when the same machine also keeps the Qwen-Image 2.1 files.

## Do not download for this workflow

- `wan2.2_i2v_high_noise_14B_fp16.safetensors` and `wan2.2_i2v_low_noise_14B_fp16.safetensors` are 28577914792 bytes each (28.6 GB). The pair does not fit a 24 GB card. The ComfyUI doc lists these FP16 files, then tells the steps to load the text-to-video FP8 names. Use the two I2V FP8 files above.
- Wan's own Python script asks for 80 GB VRAM for the 14B models. That number is not the ComfyUI path.
- The 5B hybrid model is the smaller, lower-quality option, not this quality set.

## Smaller option

Wan2.2 5B text-and-image-to-video (`video_wan2_2_5B_ti2v`). ComfyUI says it fits 8 GB with native offloading. About **18.1 GB** on disk.

| Folder | File | Bytes | Size |
|---|---|---|---|
| `models/diffusion_models/` | `wan2.2_ti2v_5B_fp16.safetensors` | 9999658848 | 10.0 GB |
| `models/text_encoders/` | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 6735906897 | 6.7 GB |
| `models/vae/` | `wan2.2_vae.safetensors` | 1409400960 | 1.4 GB |

The 14B text-to-video FP8 pair uses the same text encoder and `wan_2.1_vae.safetensors`, and the two files `wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors` and `wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors` (14293923632 bytes each). That set is for a prompt with no source image.
