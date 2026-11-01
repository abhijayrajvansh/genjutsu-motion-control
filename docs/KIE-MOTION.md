# Real Kie Motion Control

## Configure

Open http://127.0.0.1:3107/generations and select **Motion Control**.

Paste your key from https://kie.ai/api-key into the header’s API key field, then click **Connect**. The connection check reads your credit balance and does not start a render. After a successful connection, the user-entered key is saved in this browser’s local storage under `clone.kie.api-key`. Later visits restore it and validate the balance before reconnecting. Editing or clearing the field removes the saved value until the new key connects successfully. The key is never written into local job files, source control, or logs.

For persistent configuration, copy `.env.example` to `.env.local`, set `KIE_API_KEY`, and restart `npm start` or `npm run dev`. Never prefix it with `NEXT_PUBLIC_`. Do not send the key in chat. The server key is never returned to the browser.

## Small trial

The trial button is below the image/video uploaders. Mode uses a custom dropdown; First frame + reference is currently disabled as under construction.

Click **Load 2-second trial**. This selects Wan 3, 480p, a two-second output, audio off, and public example media from Kie's own documentation. No generation starts when loading files or checking the balance.

Click **Generate 2s video** once to upload the selected media to Kie's documented upload host and start one paid render. Track progress on the right. Download the resulting MP4 when ready. This uses the provider's current pricing, not local demo credits.

The included input video was trimmed from Kie's example to exactly 2.000 seconds, converted to H.264, 640 × 864, 25 fps. The reference image is a stylized illustrated character. Original example URLs:

- https://static.aiquickdraw.com/tools/example/1767694885407_pObJoMcy.png
- https://static.aiquickdraw.com/tools/example/1767525918769_QyvTNib2.mp4

## Input clip editor

Upload an MP4/MOV source up to 200 MB, then scrub its inline preview in the Driving video tile and set Start/End. The same tile retains Play video, Change and Remove; there is no separate preview below the uploaders. The selected length uses whole seconds within the current model's limits; Start can be positioned to hundredths of a second. Output duration matches that selected length. Moving Start repositions the segment while retaining its length; End changes its length. The browser preview stops at the end of the selection.

Generate sends the original source and `trimStart`/`trimEnd` to the local server. FFmpeg accurately seeks and re-encodes only that interval to H.264 MP4 at 30 fps, retaining audio when present. The server validates the trimmed file and recalculates pricing from its actual duration before any provider upload or task creation. Only the trimmed file is uploaded to Kie. Temporary source/trim files are removed after processing. Older requests without selection fields keep their existing whole-clip behavior.

Verified a four-second selection from a 20-second source in the browser with live cost updates. An actual FFmpeg trim of a red/blue fixture confirmed the selected starting content and three-second duration. Invalid ranges and mismatched output durations were rejected by the local API; underquoted totals returned 409, and the correctly quoted request stopped at the free authentication check using a dummy key. No paid render was started.

## Original clip audio in downloads

**Keep original clip audio** is on by default. Before submitting a new paid task, the server saves the selected segment’s audio privately alongside its job record. When downloading, FFmpeg copies the generated video stream without re-encoding and replaces model audio with that saved soundtrack. AAC audio is used for MP4 compatibility. Audio is cut or padded with silence to the actual output video duration; a silent input produces a silent download. The combined result is cached locally for repeat downloads, including after provider result URLs expire.

For older jobs, Download video requests original audio recovery from Kie’s saved input parameters. Recovery uses the existing uploaded clip, never another generation. If that input has expired, the app reports the problem instead of claiming the original soundtrack was restored. Direct legacy API downloads without the original-audio query retain their prior behavior. In-page provider playback remains the provider’s original result; soundtrack replacement happens in the downloaded MP4.

Verified source-selection timing with distinct audio tones, replacement of a different generated soundtrack, unchanged video bitstream hashes, silent-input behavior, cached downloads, owner-scoped API access, legacy compatibility and recovery for an existing completed Kie job. No paid generation was started by these checks.

## Supported mappings

| Interface | Kie model | Output duration | Reference video |
|---|---|---|---|
| Wan 3 | `wan/3-0-video` | 2–15 s in this app | 1–15 s |
| MiniMax Official H3 | `minimax-h3/reference-to-video` | 4–15 s | 2–15 s |
| Seedance 2.0 | `bytedance/seedance-2` | 4–15 s | 2–15 s |
| Seedance 2.5 | `bytedance/seedance-2-5` | 4–30 s | 2–30 s |
| Kling 2.6 Motion Control | `kling-2.6/motion-control` | follows usable input, minimum 3 s | 3–30 s; 10 s max for image orientation |

The first four models use reference-to-video generation guided by the editable prompt. Exact motion transfer quality is model-dependent; Kling is the dedicated motion-control endpoint. The original Aiorbust GPU model is not mapped to a different provider model under the same name. The Mode dropdown exposes both labels, but First frame + reference is currently disabled. **Reference image + video** uses identity images with the driving video. **First frame + reference** additionally requires a corrected opening image and sends references in the fixed order: identity, corrected opening, additional identity references. The server adds opening-frame instructions while retaining the driving video. This is prompt-guided reference generation, not a pixel-exact locked first-frame parameter. No `first_frame_url` is combined with `reference_video_urls`. Kling accepts only one image, so the two-image mode is disabled for Kling and rejected server-side. No Gemini/xAI prompt-writing integration is claimed.

FFmpeg/ffprobe must be installed and on the server's PATH. Files are decoded locally before upload; MIME types, sizes, dimensions, aspect ratios, durations, codecs and relevant frame-rate limits are checked. Output settings are restricted per model. H3 always generates audio and bills reference-video duration in addition to output duration. Seedance's audio switch controls newly generated audio, not copying the original soundtrack.

## Persistence and failure handling

Pending cards show an animated, blurred first-frame preview. New submissions save a small JPEG extracted from the selected clip in the local job record. Older pending tasks attempt a one-time recovery from Kie's task parameters, limited to provider media hosts; if the input is unavailable, they use an ambient animated background. Queued/rendering cards display the reviewed estimate until actual credits are reported for a finished task. Motion effects stop when the browser requests reduced motion.

Real task metadata is saved atomically in the ignored `.data/motion/` directory on this computer. Original-audio tracks and combined download caches also live privately in that directory. It includes the provider task ID, prompt, settings, status and result URLs, never the API key. Files are private to the OS user, and API access is scoped by a SHA-256 fingerprint of the configured key. This is local development persistence, not a production database or multi-user account service.

Kie keeps rendering when the tab closes. Reconnect using the same key to recover history and resume status polling. Result media remains on the provider until downloaded; its URL can expire. Back up `.data` if you need to retain task records; do not publish it.

Each submission uses a persisted unique local request ID. Repeating that ID returns the existing record instead of creating another render. Automatic retries of paid creation requests are deliberately absent. If a create request times out, check Kie logs. **Link existing task** lets you attach a task ID and resume polling without another paid request. A failed task shows the provider's error. Refresh-status and download failures never create a new render.

No callback URL is needed for this local preview: task status is polled every six seconds while connected. The provider API is called through Next.js route handlers, avoiding browser CORS/key exposure. Cross-origin mutations are rejected. Downloads are fetched from stored provider results, with private-network destinations blocked.

## Official API references

- https://docs.kie.ai/file-upload-api/upload-file-stream
- https://docs.kie.ai/common-api/get-account-credits
- https://docs.kie.ai/market/common/get-task-detail
- https://docs.kie.ai/market/wan/3-0-video
- https://docs.kie.ai/market/minimax-h3/reference-to-video
- https://docs.kie.ai/market/bytedance/seedance-2
- https://docs.kie.ai/market/bytedance/seedance-2-5
- https://docs.kie.ai/market/kling/motion-control

## Verification boundary

TypeScript, ESLint, production build, model payload/parameter checks, local API guards, metadata recovery and browser trial preparation can be verified without a valid key. A real paid render, provider acceptance of uploaded media, and the generated video's quality must still be verified after the user configures their funded Kie key. Mocked responses are never treated as proof of a live successful generation.


## Two-mode workflow verification

The selected mode persists in localStorage and is shown on new history records. Existing records without a mode remain compatible and display as Reference image + video. Prompt drafts are kept separately per model and mode during the page session. The First frame slot uses the same upload library and preview dialog as other images. Missing frames, unsupported modes, invalid dimensions and excess image counts are rejected before any paid request. Trial loading always resets to Reference image + video.

Validated model request shapes for both modes, correct reference ordering, mandatory opening-frame prompt instructions, Kling rejection, and omission of incompatible strict-first-frame API fields. Exercised the live local multipart API with missing/invalid opening images and valid public sample media; only the free authentication check was reached with a dummy key. Browser checks confirmed mode switching, draft restoration, persistence after reload, first-frame library selection and Kling's disabled mode. Production build, TypeScript and ESLint passed. A funded generation and actual first-frame adherence remain unverified until the user configures Kie.

## Resolution rates and total-credit estimate

Each resolution dropdown option shows its live USD-per-second rate parsed directly from the same model’s published Kie price card. Seedance uses the with-video rate; no fixed conversion is substituted if a dollar rate is unavailable.

The Motion Control form now displays the total estimated Kie credits on the Generate button and in a breakdown above it. It recalculates immediately when duration, resolution, model or selected clip changes; video metadata is read locally before any upload. Both modes include all selected images in the calculation.

Rates are read from the exact model's published Kie price card (embedded page data), cached server-side for five minutes and refreshed by the UI every minute. Seedance uses the **with-video** price column, not the Fast model or without-video rate. Wan, H3 and Seedance include reference-video duration plus output duration. Kling estimates output duration from the driving video and does not bill the input a second time. H3's first five images are free; subsequent images have the published surcharge (the current UI allows at most four total images).

Fractional video seconds are conservatively rounded up for the estimate. The estimate is not a binding quote from Kie: actual usable output duration, provider rounding or changed prices can affect the final charge. History retains the preflight estimate and displays actual `creditsConsumed` when Kie supplies it. Account top-up bonuses affect the effective dollar cost, not the displayed number of credits.

No zero or fabricated price is substituted when pricing or video metadata cannot be read. Generation is disabled until the estimate is available. The server re-reads the actual file duration with ffprobe and checks current prices and account balance before upload/task creation. If its estimate exceeds the total reviewed in the browser, it returns HTTP 409 to request a refreshed estimate. This guard is not a provider-enforced maximum-charge guarantee.

Verification: all five public price cards fetched and parsed successfully. Browser checks showed Wan 480p at 2s input + 2s output = 32 credits; increasing output to 3s = 40; changing that request to 720p = 80. H3 at 768P, 2s input + 4s output = 48; Seedance 2.0 at 480p for the same durations = 69; Kling 720p with an actual three-second clip = 33. Replacing the clip updates its measured duration. Invalid Kling clip length shows an unavailable estimate. Unit calculations also checked image surcharges and fractional-second rounding. The local API rejected missing and underquoted totals with HTTP 409; a correct 32-credit request reached only the free authentication check and was stopped by the dummy key. No paid generation was started. Production build, typecheck and lint passed.

## Old-tab compatibility fix

A browser tab opened before total-credit estimates were introduced still used the old Generate form. Its requests omitted `maxEstimatedCredits`, so the updated backend correctly stopped them before upload/task creation, but the original error did not explain that the page needed reloading.

Missing estimates now return `CLIENT_UPDATE_REQUIRED` with an explicit reload instruction and `generationStarted: false`, immediately after idempotency lookup and before media inspection or external calls. Changed estimates return `PRICE_CHANGED` separately. The current client refreshes changed prices, displays a reload action for old-client errors, and avoids showing a phantom job ID or ambiguous check-logs warning for a confirmed preflight rejection. It never automatically retries a paid request or reloads a page containing a session key.

Verified old-format requests, underquoted requests, and the current 32-credit trial format through the live local API using a dummy key. The correct format passed pricing validation and stopped at the free authentication check. Build, typecheck and lint passed. A new browser tab loaded the credit-enabled form and displayed `Generate 2s video — ~32 Kie credits`. The screenshot request ID had no job record, consistent with rejection before creation. No paid render was started by these checks.

## USD display

The header balance and Generate button show Kie credit counts. Job estimates, the cost breakdown and actual Kie job costs display USD at the published base conversion of 1 credit = $0.005 (8 credits = $0.04). Top-up bonuses may change your effective purchase cost. Internal estimates, balance comparisons, stored job values and the submission quote remain in Kie credits, preserving billing validation and existing jobs. For example, the 224-credit estimate displays as $1.12.

The clip editor labels the selected media length as input duration. A breakdown below Resolution shows selected input length, requested whole-second output duration, billable input/output seconds, rate and total. A 13.77-second input with a 14-second output estimates (14 + 14) × $0.04 = $1.12 at Wan 3 480p. Fractional input seconds are conservatively rounded up for the estimate; actual provider cost is displayed after completion.
