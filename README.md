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

## Final Output Sourcing

For Wan 3 motion control, **Final Output Sourcing** separates appearance and scene choices from the driving performance. Face identity is fixed to **Input image**, including for old settings that selected video identity. Choose **Input image** or **Input video** for body appearance, clothing, accessories, hair appearance, background, camera, and lighting. Body/head movement, expressions, hair motion, and timing are fixed to **Input video**. Source choices persist in this browser. Saved clip-specific action descriptions are ignored.

The live **Prompt** is always visible immediately beneath the source controls. Changing a source rebuilds it and replaces manual edits; **Use default** restores it from the current choices. The short default follows the user's working image-first structure: image facial identity, selected appearance and scene references, video movements and timing, opening-frame instruction, and consistent-face continuity. It does not invent an attire description or apply nudity/body/hair details to unrelated images. There is no separate action-description field.

**Opening frame source** adds a brief first-frame instruction to this prompt. **Input image** requests a first frame matching Image1; subsequent appearance and scene choices still apply. **Input video**, the default for existing settings, follows the selected video's opening pose and framing with Image1's face. The choice persists across reloads. Both options retain the driving video in reference mode. This is model-dependent prompt guidance, not a strict first-frame lock: APIMart does not permit a strict `first_frame` input together with a reference video.

This follows the appearance-image/motion-video separation documented for [Kling 3.0 Motion Control](https://fal.ai/models/fal-ai/kling-video/v3/pro/motion-control/api), while retaining Wan 3 and its existing provider payloads. It does not add Kling-specific API controls or turn Wan into a dedicated motion-transfer model. Actual fidelity still requires a rendered comparison; prompts cannot guarantee exact correspondence. Kie Replace retains its existing prompt-free workflow.

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
