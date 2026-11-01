# Aiorbust — local Next.js recreation

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

**Keep original clip audio** saves the selected input soundtrack and attaches it to the downloaded MP4, replacing model audio without re-encoding the generated video. Older jobs can recover their uploaded input audio while it remains available on Kie.

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

See [reconstruction notes](docs/RECONSTRUCTION.md) for evidence and the scope of verification.
