# Qwen Image Edit snapshot

Snapshot of the Edit Image workflow Genjutsu sends to ComfyUI. Taken from `lib/server/qwen-edit-workflow.ts` (`qwen21Prompt`) and `setup-qwen-edit-vast.sh`. The app builds this graph in code. These JSON files are the same API prompt, with placeholder image names, an empty prompt, and seed 0.

The product path is **Qwen-Image 2.1** only. Resolution is locked at **1K** (pixel budget 1024). The default quality is **Turbo · 8 steps**. Both LoRAs are optional and off unless the checkbox is on.

Needs **ComfyUI >= v0.44** (`QwenImage21Cache`, `TextEncodeQwenImage21`).

## Files in this folder

| File | What it is |
| --- | --- |
| `workflow-turbo-api.json` | Default button path. Turbo UNET, no LoRAs, two images, output matches image 1. |
| `workflow-turbo-loras-api.json` | Same Turbo graph with both LoRAs chained. The app only adds a LoRA node when that box is checked. |
| `workflow-balanced-api.json` | Balanced quality. Base (non-Turbo) UNET, `KSampler`, 25 steps, no LoRAs. Best is the same graph with `steps` 40. |

Load any of these with ComfyUI's API (`POST /prompt`, the `prompt` object). They are not the canvas workflow format.

## Restore on a new GPU

From the repo, with the SSH command the rental printed:

```bash
ssh -p PORT root@HOST 'bash -s -- --model 2.1' < setup-qwen-edit-vast.sh
```

`--model 2.1` is required. The script's default is still the older 2511 stack, which this UI does not use. The script finds ComfyUI (usually `/workspace/ComfyUI`), resumes a partial download, and checks sha256.

Disk for the 2.1 set is about **25 GB**. A 24 GB NVIDIA card (3090 or 4090) is the rental this editor was run on. Qwen-Image 2.1 is under the Qwen Research License: no commercial use.

## Models

All paths are under `ComfyUI/models/`. Bytes and sha256 are what `setup-qwen-edit-vast.sh` verifies.

| Role | Folder | Filename | Bytes | sha256 |
| --- | --- | --- | --- | --- |
| Diffusion, Balanced and Best | `diffusion_models/` | `qwen_image_2.1_int8_convrot.safetensors` | 7256783064 | `cb74113cb03faecd79611b01fd7fd642f0aa60d6f0b95086abee214d75eaa57d` |
| Diffusion, Turbo | `diffusion_models/` | `qwen_image_2.1_turbo_int8_convrot.safetensors` | 7256787829 | `8144a0182964aa8403ad6dbc011db837304167d235161b9aabaa8532e967314c` |
| Text encoder | `text_encoders/` | `qwen3vl_8b_int8_convrot.safetensors` | 9350798360 | `8bfd0f6e12abf2d2d697ecc888e5e90b0d6741d6708f05799f53afa560452e8f` |
| VAE | `vae/` | `qwen_image_2.1_vae_bf16.safetensors` | 675509688 | `bb21f7473051e1ac368515dd3f2e15cd44d7a11748ee8823e1ddca3e4876b7c9` |
| Consistency LoRA | `loras/` | `qwen-image-2.1-consistency.safetensors` | 159436496 | `4f44ada1be2189cc23b3d010f9603543403f48454e2f76842a3d30109b20bd63` |
| BFS LoRA | `loras/` | `bfs_head_v1.1_qwen_2.1.safetensors` | 260096144 | `d1d748d5601077f3b6d05766f6823510e901970d916afa404a97e85dc92fa88e` |

Hugging Face:

- Diffusion, text encoder, VAE: `Comfy-Org/Qwen-Image-2.1` at `resolve/main/diffusion_models/`, `text_encoders/`, and `vae/`.
- Consistency: `ausboss/Qwen-Image-2.1-Consistency-LoRA` (step 1500).
- BFS: `Alissonerdx/BFS-Best-Face-Swap`, file `bfs_head_v1.1_qwen_2.1.safetensors`.

Do not download the 2511 fp8 stack, the 2509/2511 BFS files, or a BF16 2.1 diffusion file for this editor. There is no official FP8 file for 2.1. Outfit Swap was not installed.

## LoRAs

Both use `LoraLoaderModelOnly` at **strength 1**. An unchecked box means that node is absent. Order when both are on: UNET, then consistency (`lora`), then BFS (`bfs`), then `QwenImage21Cache`.

| Checkbox | File | When to use it |
| --- | --- | --- |
| Use consistency LoRA | `qwen-image-2.1-consistency.safetensors` | Hold the face, pose, and frame. It fights a face swap and fights a new pose. |
| Use BFS LoRA | `bfs_head_v1.1_qwen_2.1.safetensors` | Replace the head in image 1 with the head from image 2. Leave consistency off. |

BFS file in use is the improved **v1.1**, not V1 (smoother, more plastic skin) and not the v1.1 alternative (copies expression from image 2 more, worse head angle). Same prompt and strength for all three. This is not a guaranteed swap. A small or distant face in image 1 swaps poorly.

Head-swap prompt, image 1 = target photo, image 2 = face:

```
head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k
```

## Graph

Node order for Turbo with both LoRAs:

1. `UNETLoader` — Turbo file when quality is fast, base int8 file otherwise. `weight_dtype` `default`.
2. `CLIPLoader` — `type` `qwen_image`, `device` `default`.
3. `VAELoader`.
4. Optional `LoraLoaderModelOnly` id `lora` (consistency).
5. Optional `LoraLoaderModelOnly` id `bfs`. Its model input is `lora` if consistency is on, otherwise `unet`.
6. `QwenImage21Cache` — `device` `auto`, `dtype` `default`. Model input is the last of `bfs`, `lora`, or `unet`.
7. `LoadImage` — up to three. Ids `image1`, `image2`, `image3`. Image 1 is the photo to edit. Image 2 is the face or a reference. Image 3 is an extra reference. The Turbo JSON shows two.
8. `TextEncodeQwenImage21` — prompt, `negative_prompt` `""`, `resolution` 1024. Images link as `images.image_1`, `images.image_2`, `images.image_3`. Output 0 is positive, output 1 is negative, output 2 is the latent that matches image 1.
9. Sampler. See quality below.
10. `VAEDecode`.
11. `SaveImage` — prefix `genjutsu/qwen-edit-` plus the first 8 characters of the job id.

The official prompt-enhancer node is left off.

`fillDefaults` in `qwen-edit-workflow.ts` copies any new required input from ComfyUI's `object_info` defaults before submit. If a newer Comfy adds a required widget, the live submit still fills it. These JSON files match the nodes as written today.

### Quality

| UI | UNET | Sampler | Settings |
| --- | --- | --- | --- |
| Turbo · 8 steps (default) | turbo int8 | `SamplerCustomAdvanced` | `RandomNoise` seed, `KSamplerSelect` euler, `ManualSigmas` (string below), `CFGGuider` CFG 1 |
| Balanced · 25 steps | base int8 | `KSampler` | CFG 1, euler, scheduler `simple`, denoise 1, seed on the sampler |
| Best · 40 steps | base int8 | `KSampler` | Same as Balanced with `steps` 40 |

Turbo sigmas, exactly:

```
1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0
```

### Output size

`resolution` on the encoder is a pixel budget, locked at 1024. It is not a free 2K control.

**Match input image** (the usual case) uses the encoder's latent, slot 2. No `EmptyLatentImage` node.

Any other size adds:

```json
"latent": {
  "class_type": "EmptyLatentImage",
  "inputs": { "width": 1024, "height": 1024, "batch_size": 1 }
}
```

and the sampler's `latent_image` becomes `["latent", 0]`. That can reframe. Width and height at 1K, rounded to a multiple of 32:

| Size | Width | Height |
| --- | --- | --- |
| 1:1 | 1024 | 1024 |
| 2:3 | 832 | 1248 |
| 3:2 | 1248 | 832 |
| 3:4 | 864 | 1152 |
| 4:3 | 1152 | 864 |
| 9:16 | 768 | 1360 |
| 16:9 | 1360 | 768 |
| 21:9 | 1568 | 672 |

The server forces resolution 1024 for `qwen-image-2.1` even if a request asks for 2048.

## Nodes that must exist

`UNETLoader`, `CLIPLoader`, `VAELoader`, `LoraLoaderModelOnly`, `QwenImage21Cache`, `LoadImage`, `TextEncodeQwenImage21`, `EmptyLatentImage`, `KSampler`, `RandomNoise`, `KSamplerSelect`, `ManualSigmas`, `CFGGuider`, `SamplerCustomAdvanced`, `VAEDecode`, `SaveImage`.

## What the editor sends

- Model string `qwen-image-2.1`. If the form omits it, the API defaults to 2.1.
- Quality `fast`, `balanced`, or `best`. The UI default is `fast`. A value already saved in the browser under `clone.edit.quality` still wins.
- LoRA flags only when checked: `consistency=true`, `bfs=true`. Saved as `clone.edit.consistency` and `clone.edit.bfs`, both default off.
- Submit returns 409 if a checked LoRA file is missing from `models/loras`.
- Up to 3 images, 30 MB each. Prompt may name them as `<image1>`, `<image2>`, `<image3>`.
- Seed is an integer up to 2147483647.

Qwen-Image-Edit 2511 is still implemented in `qwenEditPrompt` for old jobs. The Edit Image screen does not offer it. Do not install that stack to reproduce the current editor.
