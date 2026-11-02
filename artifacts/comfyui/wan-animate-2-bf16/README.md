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

The steps and guidance follow the [upstream base inference command's defaults](https://github.com/Wan-Video/Wan-Animate-2/blob/main/infer/wan_animate_2_demo.py); the Euler solver and shift follow its [base configuration](https://github.com/Wan-Video/Wan-Animate-2/blob/main/infer/wan_animate_2.yaml). They are starting settings, not a claim of optimal output quality. The step-distillation LoRA and six-step LCM path from the downloaded ComfyUI template have been removed. Video creation explicitly selects automatic chroma subsampling for the pinned current ComfyUI schema. Non-executable annotation nodes have been removed; setup instructions are kept here.

## Run a first comparison

1. Upload your character photo and an already-trimmed, approximately 2–3-second driving clip. This graph loops over the supplied video; fragment length is **not** a total-duration cap.
2. Match the framing of the photo and driving video. Set output width/height for their aspect ratio; 480 × 832 is only the initial portrait setting.
3. Replace the sample appearance/background text with a description of your actual character and desired scene. The included description matches the official pink-haired sample character. Describe appearance and background in the main prompt, and the video's action in the pose prompt.
4. Confirm the selected diffusion file is `wan_animate_2_bf16.safetensors`, the text encoder is `umt5_xxl_fp16.safetensors`, and the cache device is CPU.
5. Start ComfyUI with `--bf16-unet` to keep UNet execution in BF16; automatic precision selection can otherwise choose FP16. Render a short clip and record peak VRAM, system RAM, elapsed time, facial identity and motion accuracy before increasing resolution or duration. Keep normal ComfyUI offloading available.

The model generates the background from conditioning and the prompt. This workflow does not guarantee exact preservation of the source video's background, face, clothing or frame-by-frame motion. Longer clips use continuation fragments and can drift between segments.

Verified on 3 November 2026 with a single RTX 6000 Ada 48GB: a two-second, 24 fps driving clip produced a playable H.264 video with 48 frames at 480 × 832. The 40-step BF16 run completed in 807.6 seconds (13 minutes 27 seconds), including model loading and decoding. Observed peak VRAM was 45,252 MiB (44.2 GiB), sampled once per second. The output was downloaded through the authenticated gateway and decoded without errors.

The installed preset was opened from the browser’s Workflows sidebar and serialized to 63 executable nodes. Token login, secure session cookies, WebSocket messages, image/video uploads and protected output downloads were verified. All four model checksums matched.

This measurement applies to the short clip and resolution above. Longer videos and larger frames need their own memory and speed measurements. CPU caching consumes system RAM. The verification manifest records the ComfyUI revision and installed library versions.

## Private Vast deployment

From a copy of this repository on a fresh Ubuntu 24.04 / CUDA 13 rental, run:

```bash
bash setup-wan-animate-2-vast.sh
```

The installer uses `/workspace/wan-animate-2` (override with `WAN_ROOT`). It installs a pinned ComfyUI revision, CUDA 13 PyTorch wheels, the checksum-verified models, and Cloudflared 2026.10.7. It also installs this workflow in the Workflows sidebar and supplies the official reference image with a two-second driving sample. It does not submit paid generations automatically.

ComfyUI listens on `127.0.0.1:8188` with `--bf16-unet` to preserve BF16 execution rather than letting ComfyUI select FP16 automatically. JSON response compression is enabled. An authenticated HTTP/WebSocket gateway listens on `127.0.0.1:8190`. The Cloudflare Quick Tunnel exposes only the gateway. Open its HTTPS URL, then enter the token from `private/access.json`. Browser sessions use a secure, HttpOnly cookie; API clients can send `Authorization: Bearer <access_token>`. Keep the token out of URLs and source control.

On first opening, close the Templates chooser, then open **Workflows → wan-animate-2-base-bf16.workflow**. Close the sidebar to see both input nodes; use the canvas zoom controls as needed.

The three tmux sessions are `wan-bf16-comfy`, `wan-bf16-access` and `wan-bf16-cloudflare`. Logs are under `logs/`; the public URL appears in `logs/cloudflared.log`. Run `bash /workspace/wan-animate-2/start-services.sh` to start any missing sessions. Configure the rental's startup command to call that script after `.installed` exists. A Quick Tunnel URL changes when Cloudflared restarts; the access token persists on disk.

Rentals continue billing while running, and stopping an instance can still incur storage charges. Export wanted outputs before destroying a rental. Deployment IDs, credentials and render receipts belong in the ignored `.data/deployments/wan-animate-2/` directory, never in this artifact.
