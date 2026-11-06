# genjutsu-motion-control

Recreated from https://aiorbust.ai/generations using the [REA skill](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md), shipped asset inspection, and live browser observations.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3107/generations. The root URL redirects there.

For a production preview: `npm run build`, then `npm start`.

## Real Motion Control with Kie

Motion Control uses **Reference image + video**. **First frame + reference** is currently disabled as under construction. Upload a driving video, scrub its preview, and choose a start/end segment. The generated duration matches that whole-second selection; only the selected segment is uploaded to Kie.

Motion Control now has a real Kie integration: file uploads, provider task creation, polling, errors, result playback and MP4 downloads. Supports Wan 3, Official H3, Seedance 2.0/2.5 and Kling 2.6 Motion Control. Local real-job metadata persists in the ignored `.data/motion/` directory. The older demo forms remain in the codebase but are hidden from the tab bar.

Enter your key in the **header’s API key field**, then click **Connect**, or configure `KIE_API_KEY` in `.env.local` and restart the server. Successfully connected keys are saved in this browser’s local storage and restored on later visits; editing or clearing the field forgets the saved key. The key is never committed or written into job records. **Load 2-second trial** prepares a small Wan 3 render; generating it uses your real Kie credits.

**Keep original clip audio** saves the selected input soundtrack and attaches it to both in-app playback and the downloaded MP4, replacing model audio without re-encoding the generated video. Playback prepares the audio-preserving video when you first press Play. Older jobs can recover their uploaded input audio while it remains available on Kie.

The Generate button shows a live **total Kie-credit estimate**, including billable input-video time. Current published prices are refreshed automatically; the backend rechecks the estimate and balance before submitting. Final provider billing may differ.

See [Kie configuration, trial and API details](docs/KIE-MOTION.md). FFmpeg/ffprobe must be on PATH for video trimming and upload validation. A live paid render still requires a funded key and is not verified until that trial completes.

## Edit Image (Qwen-Image-Edit-2511 on your own GPU)

The **Edit Image** tab edits photos with Qwen-Image-Edit-2511 running in ComfyUI on a GPU you rent (for example with `rent-gpu`). It costs GPU time, not Kie credits.

1. Rent a 24 GB+ NVIDIA GPU with the ComfyUI image and at least **60 GB** disk: `rent-gpu --disk 60`.
2. Install the models on it (~31 GB, resumable, checksum-verified), using the SSH command `rent-gpu` printed:
   `ssh -p PORT root@HOST 'bash -s' < setup-qwen-edit-vast.sh`
   Add `-- --no-lightning` after `bash -s` to skip the Fast-mode LoRA.
3. In **Edit Image**, paste the **ComfyUI link** that `rent-gpu` prints (`https://….trycloudflare.com/?token=…`) and click **Connect**. An SSH tunnel to `http://127.0.0.1:8188` also works. The link is saved in this browser; the token is only sent from the local server to ComfyUI.
4. Add the image to edit (image 1), optionally up to two references (image 2/3), describe the change and pick a quality:
   - **Fast** — 4 steps with the Lightning LoRA, CFG 1.
   - **Balanced** (default) — 20 steps, CFG 4.
   - **Best** — 40 steps, CFG 4.

It uses the fp8mixed diffusion model, the fp8 Qwen2.5-VL text encoder and the official ComfyUI template's node chain. Inputs and results are kept in the ignored `.data/image-edit/` directory, so they remain after the rental is destroyed. **Edit this result** feeds an output back in as the next input. See [qwen-image-edit-research.md](qwen-image-edit-research.md) for other precisions.

## Included

- The dark generation workspace, original logo and locally served Inter font.
- Motion Control, Video Gen, Images, and Tools tabs with model-specific controls.
- Responsive navigation, character menu, account menu, and keyboard accessible tabs.
- Uploads, drag/drop, local reusable media library, previews, and downloads.
- Generation history stored in IndexedDB, with saved tab/model choices in localStorage.
- Browser-side video trimming, frame extraction, and a basic phone-photo colour treatment.
- Optional demo mode: account menu → Enable demo mode. Adds 1,000 local credits. Demo jobs preview the **original uploaded media**, clearly labelled as such; they do not generate AI content. Jobs resume their local status on reload and disappear from history after one day.

## Boundaries

This is an independent interface recreation, not the original source code or service. No original backend, account data, GPU infrastructure, model weights, billing, authentication, or production database is included. AI rendering outside the Motion Control tab, voice extraction/change, upscaling, frame-rate interpolation, and premium pages need service implementations. Premium navigation leads to local explanatory pages rather than a fabricated working backend. Motion Control sends its key only through the local server to Kie’s API/upload service. Other tabs’ key fields remain unconnected. LoRA management currently selects a filename for the local session; no training or model loading occurs.

Video trimming uses Chrome/Edge MediaRecorder and exports WebM in real time. Frame extraction and phone-photo processing use canvas. Browser storage is local to the selected browser and origin; use the same URL consistently (`localhost` and `127.0.0.1` have separate storage).

Original styling and visible copy were used as reference; their ownership remains with their respective owners. The bundled original CSS utilities are retained in `app/reference.css`; reconstruction-specific styling is in `app/globals.css`.

## Verify

```bash
npm run lint
npm run typecheck
npm run build
```

With the local development server running, `npm run test:layout` checks generation-card dimensions through rendering and completion in desktop/mobile Grid and List views. It intercepts provider endpoints with fixtures and never submits a generation.
Rendering and ready cards share the same preview dimensions (9:16 in Grid and mobile List views), with other video shapes letterboxed rather than stretched. Download is disabled until ready, reserving its footer space so completion does not resize the card.

See [reconstruction notes](docs/RECONSTRUCTION.md) for evidence and the scope of verification.

## Generation inputs

Every Motion Control card has a **View inputs** button. Its dialog shows that generation's reference photo and submitted driving video, with playback, filenames and the selected clip's start/end times. Extra reference images and corrected opening frames are included when present. Closing the dialog stops playback and releases its preview URLs.

Refresh a card with the circular-arrow icon immediately to the left of its favorite star. The footer's full-width refresh button is removed.

New submissions retain exact copies of the uploaded reference images and the prepared driving clip in the ignored `.data/motion-inputs/` directory before a paid task is created. Input endpoints use the same API-key ownership checks as the generation itself. Files survive browser reloads and input changes.

For older Kie jobs, opening the dialog attempts to recover media from the original task parameters and caches accessible files locally. Expired links and missing input records are reported without substituting the output video or the currently selected inputs. Older APIMart jobs did not retain upload URLs, so their original files may be unavailable. Viewing inputs does not create a generation.

## Direct motion prompt

Motion Control uses one fully editable **Prompt** directly. **Final Output Sourcing** is disconnected and hidden; its saved radio choices no longer build, append to, or rewrite the prompt. Changing input files leaves your text intact.

The standalone Wan default requests the character, face, body, clothing and skin coverage from **Image1 @Image1**, movements and scene from **Video1 @Video1**, and an opening frame matching Image1. Edit the entire prompt to describe the output you want. **Use default** restores this standalone text. Manual prompts persist in browser storage per model and mode, including across reloads and video changes.

The text in the prompt field is submitted without source-generated instructions. Wan prompts written with `@image1`/`@video1` mentions are mapped to the provider's documented `Image1`/`Video1` labels; existing `Image1 @Image1` pairs are left unchanged.

**Face reference (Wan 3, optional):** add a tight close-up of the same person's face under the reference image. It is sent as **Image2** (extra references shift to Image3+), and a face-lock instruction is appended to the prompt: Image2 is the only source of facial identity, Image1 still supplies hair, body and outfit, and Video1 supplies only head pose, expressions and lip movement. Use this when the driving video's face survives the swap. The face image counts toward Wan's four-image limit and is retained with the job's inputs. APIMart still translates numbered image/video labels to its documented equivalents; Kie Replace still does not send prompts. Both providers keep their existing media payloads. Face fidelity, clothing and opening-frame matching remain model-dependent; disconnecting the source controls does not create a strict identity or first-frame lock.

## Download Instagram reels

With Google Chrome installed, use Fastvideosave's available download servers:

```bash
npm run reels -- https://www.instagram.com/p/POST_ID/
npm run reels -- --watch
```

Pass multiple URLs, or paste URLs into watch mode while earlier downloads run. Ctrl-D finishes the queue and exits. Files save to `~/Desktop/sonali/ideas`; use `--output /another/directory` to change the destination. The script opens a separate Chrome window, tries each server in order, checks MP4 headers (and the video stream when ffprobe is installed), and skips existing valid files with the same post ID. Multi-video results receive numbered filenames. A `.reel-downloads.jsonl` file in the destination records sources and successful downloads. Failed links are reported and can be submitted again.

The script depends on Fastvideosave's current page structure and public-post availability. If the site requests human verification, complete it in the browser; the script does not solve challenges.

## APIMart with Cloudflare R2

Select **APIMart** in the header and connect an APIMart API key. APIMart is available for Wan 3, Wan 2.7 R2V, and Wan 2.7 Video Edit. Switching back to Kie restores its separately saved key and existing models/history.

For media uploads, copy `.env.example` to `.env.local` and set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_URL`. The public URL is the bucket’s `r2.dev` address or a custom domain, not the S3 API endpoint. Enable public read on the bucket. Restart the app after changing server configuration. Keep secrets server-only; never prefix them with `NEXT_PUBLIC_`. You may optionally set `APIMART_API_KEY` on the server instead of entering it in the header.

See [APIMart setup, pricing and verification](docs/APIMART-MOTION.md). Live R2 uploads and a funded APIMart render require configured credentials.

## Wan-Animate-2 Base BF16 workflow

[Prepared BF16 workflow and setup notes](artifacts/comfyui/wan-animate-2-bf16/README.md) provide the selected `wan_animate_2_bf16.safetensors` base model with an FP16 text encoder. The standalone ComfyUI graph removes the template's step-distillation LoRA, uses 40 Euler steps with CFG 3, and keeps the motion cache on CPU. The four required model files total 45.67 GB; their pinned URLs and hashes are in the adjacent manifest. Structural checks are complete; GPU import, memory measurements and rendered quality remain unverified.

## MiniMax H3 on a Vast.ai RTX 5090

[setup-h3-vast.sh](setup-h3-vast.sh) installs the extracted RunComfy H3 + SAM3 character-swap workflow into a separate directory on a Linux RTX 5090 32GB rental. Choose an SSH-enabled Ubuntu 22.04/24.04 image with NVIDIA driver 580+, preferably 96–128GB RAM and 150–200GB persistent disk. The script does not rent an instance or manage billing.

Copy the script to the rental, or clone this repository there, then run:

```bash
bash setup-h3-vast.sh plan       # No downloads or changes; works on your laptop too.
bash setup-h3-vast.sh install    # Run on the rental; ~44GB of required model weights.
tmux new -s h3                  # Keeps the server running if SSH disconnects.
bash setup-h3-vast.sh start
# In another rental SSH terminal, after the server starts:
bash setup-h3-vast.sh check
```

From your laptop, forward the port using the SSH host/port provided by Vast.ai: `ssh -p SSH_PORT -L 8188:127.0.0.1:8188 root@SSH_HOST`. Open http://127.0.0.1:8188 and select **h3-5090-0.5mp.workflow.json** in the Workflows sidebar. Upload your character image and driving video, update the prompt, and inspect the SAM3 mask before rendering. The preset changes only resolution to 0.5MP, retaining the original 124-frame, 24fps, Normal-mode setup. The original workflow is also installed unchanged.

The installer pins ComfyUI/custom nodes and PyTorch CUDA 13.0, verifies model SHA-256 checksums, resumes interrupted downloads, and preserves existing workflow edits on reruns. It uses `/workspace/minimax-h3` by default; pass the same `--root /your/persistent/path` to each command to change it. Inputs, outputs and ComfyUI settings stay under that directory. `--with-turbo` adds the optional LoRA without enabling Turbo mode. No provider API key is required; this is a standalone ComfyUI deployment, separate from the web app's provider selector.

Use `--help` for all options and rental notes. The server binds to localhost by default; `--listen 0.0.0.0` exposes an unauthenticated ComfyUI server, so use SSH forwarding unless you have an authenticated proxy. Check the [official H3 license terms](https://docs.comfy.org/tutorials/video/minimax/minimax-h3) for commercial use. The exact workflow still needs its first render on the target GPU; local syntax and repository checks do not establish runtime memory/performance.
