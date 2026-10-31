# Reconstruction evidence

Reference inspected on 31 October 2026: https://aiorbust.ai/generations.

## Observed

The live browser session exposed a free-plan workspace with zero credits, four tabs, five motion models, two video models, eight image tasks, and nine tools. The default Motion Control form, retention banner, account callout, upload picker, typography, navigation, and empty history were inspected in Chrome. Public CSS, logo, font, and shipped client chunks were downloaded for reference.

## REA analysis

Used `rea-agents@6.8.0 analyze-javascript-application` on the downloaded artifact directory, selecting `2l9ulebqddpci.js` and `3tlo-_46ilprn.js`. Complete Evidence was retained at `/tmp/aiorbust-rea-evidence.json` during reconstruction. Its compact summary is included in `rea-summary.json`.

Parent Evidence ID: `ev_18c965e42ebf5305f1a5ec98d245803f5a663fabe2d36429aba96b2de3a8c8b7`.

The selected sources parsed without failures. REA's application and semantic graph coverage is partial; 15 inventoried files were outside analysis scope, and dynamic/minified relationships remain unknown. Static observations do not establish runtime reachability or backend behavior. No target bundle bootstrap was executed by REA. The reconstruction uses new readable React/TypeScript components rather than executing the original application bundles.

## Implementation decisions

The replica runs entirely locally. IndexedDB stores uploads and preview jobs. Model/tab preferences and demo credit settings use localStorage. Keys are held in component memory. No remote database or original service API was used. Demo jobs are explicitly distinguished from real AI rendering. Only the generations workspace was reconstructed; other navigation destinations provide local access/limitation screens.

## Browser verification

- Compared desktop layout and typography with the live reference.
- Switched all four generation tabs and checked the relevant forms.
- Verified empty-prompt validation.
- Uploaded a local PNG through the picker and created a demo image job.
- Verified completion, credit deduction, saved selected tab, and history/media after reload.
- Downloaded the demo media to the local Downloads folder.
- Checked the 390 px mobile layout: document width matched viewport width; mobile menu exposed navigation.
- Trimmed a disposable two-second generated MP4 to a verified one-second, 320 × 180 WebM.
- Reused the saved clip from the library and extracted a downloadable JPEG frame.
- Production build, TypeScript, and ESLint all passed. Production preview reloaded successfully.
- Runtime dependency audit reported zero vulnerabilities; the development lint dependency tree has moderate advisories.

Build, TypeScript, lint, and media check outcomes are recorded in the task completion message. Provider-backed operations were not tested because no provider is connected.

## Kie Motion Control integration update

The Motion Control tab now implements live Kie uploads, task creation, status polling, provider errors, real output playback and MP4 downloads. Job records persist privately under `.data/motion/`; this is local development storage. See `KIE-MOTION.md` for model mappings and configuration.

Verification completed without a funded key:

- Production build, TypeScript and ESLint passed.
- All five model payloads and output-duration bounds checked; Wan resolution casing and Kling reference parameter names verified.
- Real Kie credit endpoint rejected a dummy key, with the error displayed in the browser and no paid render created.
- Unauthorized, cross-origin, unsupported model, invalid duration, invalid dimensions and malformed upload requests rejected.
- Disposable on-disk job metadata read back through the real API; fingerprint isolation checked.
- A repeated local request ID returned the existing job without calling the provider again.
- Download handler streamed a real public sample MP4 with attachment headers; a private-network result URL was blocked.
- Browser loaded the trial image and a verified 2.000-second H.264 clip, switched H3 to its correct four-second minimum/768P resolution, then returned to Wan 3 at 2s/480p with audio off.

The real paid render and generated output quality remain pending the user's funded Kie key. No live-generation success is claimed from the disposable metadata fixture. That fixture was removed after verification. The user-facing page is left ready for key entry.
