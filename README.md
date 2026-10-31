# Aiorbust — local Next.js recreation

Recreated from https://aiorbust.ai/generations using the [REA skill](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md), shipped asset inspection, and live browser observations.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3107/generations. The root URL redirects there.

For a production preview: `npm run build`, then `npm start`.

## Included

- The dark generation workspace, original logo and locally served Inter font.
- Motion Control, Video Gen, Images, and Tools tabs with model-specific controls.
- Responsive navigation, character menu, account menu, and keyboard accessible tabs.
- Uploads, drag/drop, local reusable media library, previews, and downloads.
- Generation history stored in IndexedDB, with saved tab/model choices in localStorage.
- Browser-side video trimming, frame extraction, and a basic phone-photo colour treatment.
- Optional demo mode: account menu → Enable demo mode. Adds 1,000 local credits. Demo jobs preview the **original uploaded media**, clearly labelled as such; they do not generate AI content. Jobs resume their local status on reload and disappear from history after one day.

## Boundaries

This is an independent interface recreation, not the original source code or service. No original backend, account data, GPU infrastructure, model weights, billing, authentication, or production database is included. AI rendering, voice extraction/change, upscaling, frame-rate interpolation, and premium pages need service implementations. Premium navigation leads to local explanatory pages rather than a fabricated working backend. API key inputs stay in memory and are never transmitted. LoRA management currently selects a filename for the local session; no training or model loading occurs.

Video trimming uses Chrome/Edge MediaRecorder and exports WebM in real time. Frame extraction and phone-photo processing use canvas. Browser storage is local to the selected browser and origin; use the same URL consistently (`localhost` and `127.0.0.1` have separate storage).

Original styling and visible copy were used as reference; their ownership remains with their respective owners. The bundled original CSS utilities are retained in `app/reference.css`; reconstruction-specific styling is in `app/globals.css`.

## Verify

```bash
npm run lint
npm run typecheck
npm run build
```

See [reconstruction notes](docs/RECONSTRUCTION.md) for evidence and the scope of verification.
