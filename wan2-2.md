# Wan 2.2 video for ComfyUI

Saved 2026-11-07, character-swap section added the same day. Qwen-Image 2.1 stays the image editor. Wan 2.2 makes the clip. License is Apache 2.0, so commercial use is allowed.

Two different jobs:

- **Image to video** turns one still into a clip. Template `video_wan2_2_14B_i2v`.
- **Character swap** copies the motion from a source video onto a new character. Template `video_wan2_2_14B_animate`, Mix mode. The image-to-video FP8 files cannot do this.

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

## Character swap: copy motion from a source video

Use **Wan2.2 Animate**, not the I2V pair. Official template: [video_wan2_2_14B_animate.json](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_wan2_2_14B_animate.json). Docs: [Wan2.2 Animate](https://docs.comfy.org/tutorials/video/wan/wan2-2-animate).

The workflow has two modes:

- **Mix** is the character swap. The reference image is the new person. The source video supplies the body motion, face, timing, background, and lighting. The person in the video is replaced and the scene stays.
- **Move** uses the source video only as motion. It animates the reference image and keeps that image's background. To switch, disconnect `background_video` and `character_mask` from the Video Sampling subgraph.

How to run Mix:

1. Load `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors`. Reuse the FP8 text encoder and `wan_2.1_vae.safetensors` from the image-to-video set. Also load `clip_vision_h.safetensors`.
2. Put the character photo, such as a Qwen 2.1 edit, in the reference image.
3. Put the performance in Load Video. DWPose, from `comfyui_controlnet_aux`, turns that clip into pose and face controls.
4. Custom nodes: [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) and [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux). The Points Editor needs one run, or a manual first frame, before the points can be edited.
5. Start near 480p. Width and height must be multiples of 16. A clip under about 5 seconds does not need the Video Extend group. Each extend adds about 77 frames.
6. A 24 GB 3090 or 4090 can run this FP8 file. Do not use `wan2.2_animate_14B_bf16.safetensors` on that card.

| Folder | File | Bytes | Size |
|---|---|---|---|
| `models/diffusion_models/` | `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors` | 18401760586 | 18.4 GB |
| `models/clip_vision/` | `clip_vision_h.safetensors` | 1264219396 | 1.26 GB |
| `models/text_encoders/` | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 6735906897 | 6.7 GB |
| `models/vae/` | `wan_2.1_vae.safetensors` | 253815318 | 0.25 GB |

The diffusion file is from [Kijai/WanVideo_comfy_fp8_scaled](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled/tree/main/Wan22Animate), which is the file the ComfyUI Animate doc names. The text encoder and CLIP vision are in the Wan 2.1 repack. The VAE is in the Wan 2.2 repack. If the text encoder and VAE are already downloaded, the new files are about **19.7 GB**. A fresh Animate-only download is about **26.6 GB**.

`wan2.2_animate_14B_bf16.safetensors` is 34549787368 bytes (34.5 GB) and does not fit a 24 GB card. The optional 4-step LoRA `lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors` is a speed preview, not the quality path.

This is not the Wan-Animate-2 BF16 preset in `artifacts/comfyui/wan-animate-2-bf16/`. That later model uses `wan_animate_2_bf16.safetensors`, needs about 44 GB at 480×832, and generates a new background instead of keeping the source video's scene.
