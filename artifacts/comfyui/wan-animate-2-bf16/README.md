# Wan-Animate-2 Base BF16

Import [wan-animate-2-base-bf16.workflow.json](wan-animate-2-base-bf16.workflow.json) into a current ComfyUI installation with Wan-Animate-2, subgraph and loop-node support. This is a standalone ComfyUI workflow, separate from the Genjutsu web app and the H3 installer.

The selected diffusion model is **wan_animate_2_bf16.safetensors**, the non-distilled BF16 base model. The workflow is adapted from the [Comfy-Org motion-transfer template](https://github.com/Comfy-Org/workflow_templates/blob/cdccb2ee7a7cd0baee4630cf7186283a98ab408f/templates/video_wan_animate2.json).

## Models

Download the four files listed in [download-manifest.json](download-manifest.json). It includes pinned URLs, exact byte sizes, SHA-256 checksums and ComfyUI destinations.

| File | Place under ComfyUI | Size |
| --- | --- | ---: |
| `wan_animate_2_bf16.safetensors` | `models/diffusion_models/` | 32.79 GB |
| `umt5_xxl_fp16.safetensors` | `models/text_encoders/` | 11.37 GB |
| `clip_vision_h.safetensors` | `models/clip_vision/` | 1.26 GB |
| `Wan2_1_VAE_bf16.safetensors` | `models/vae/` | 0.25 GB |

Total model download is **45.67 GB**. These are disk sizes, not measured GPU memory requirements. The main model is BF16; the text encoder is FP16. No INT8 checkpoint, FP8 text encoder or acceleration LoRA is selected in this preset.

## Initial configuration

| Setting | Value |
| --- | --- |
| Sampler | Euler |
| Steps | 40 |
| CFG | 3 |
| Shift | 5 |
| Motion-cache device | CPU |
| Motion-cache precision | Default, without explicit cache quantization |
| Initial output size | 480 × 832, portrait |
| Fragment length | 81 frames |

The steps and guidance follow the [upstream base inference command's defaults](https://github.com/Wan-Video/Wan-Animate-2/blob/main/infer/wan_animate_2_demo.py); the Euler solver and shift follow its [base configuration](https://github.com/Wan-Video/Wan-Animate-2/blob/main/infer/wan_animate_2.yaml). They are starting settings, not a claim of optimal output quality. The step-distillation LoRA and six-step LCM path from the downloaded ComfyUI template have been removed.

## Run a first comparison

1. Upload your character photo and an already-trimmed, approximately 2–3-second driving clip. This graph loops over the supplied video; fragment length is **not** a total-duration cap.
2. Match the framing of the photo and driving video. Set output width/height for their aspect ratio; 480 × 832 is only the initial portrait setting.
3. Replace the upstream sample appearance/background text with a description of your actual character and desired scene. Describe appearance and background in the main prompt, and the video's action in the pose prompt.
4. Confirm the selected diffusion file is `wan_animate_2_bf16.safetensors`, the text encoder is `umt5_xxl_fp16.safetensors`, and the cache device is CPU.
5. Render a short clip and record peak VRAM, system RAM, elapsed time, facial identity and motion accuracy before increasing resolution or duration. Keep normal ComfyUI offloading available.

The model generates the background from conditioning and the prompt. This workflow does not guarantee exact preservation of the source video's background, face, clothing or frame-by-frame motion. Longer clips use continuation fragments and can drift between segments.

The JSON has been structurally checked, but has not been imported into a running GPU ComfyUI instance or rendered. CPU caching reduces GPU cache pressure while consuming system RAM; no measured minimum GPU or RAM requirement is established by this artifact. No rental or model-weight download was performed.
