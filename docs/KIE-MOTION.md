# Real Kie Motion Control

## Configure

Open http://127.0.0.1:3107/generations and select **Motion Control**.

Paste your key from https://kie.ai/api-key into **Kie API connection**, then click **Connect Kie**. The connection check reads your credit balance and does not start a render. The key stays in page memory; after a reload, reconnect to resume polling. It is not written into local job files, browser storage, source control, or logs.

For persistent configuration, copy `.env.example` to `.env.local`, set `KIE_API_KEY`, and restart `npm start` or `npm run dev`. Never prefix it with `NEXT_PUBLIC_`. Do not send the key in chat. The server key is never returned to the browser.

## Small trial

Click **Load 2-second trial**. This selects Wan 3, 480p, a two-second output, audio off, and public example media from Kie's own documentation. No generation starts when loading files or checking the balance.

Click **Generate 2s video** once to upload the selected media to Kie's documented upload host and start one paid render. Track progress on the right. Download the resulting MP4 when ready. This uses the provider's current pricing, not local demo credits.

The included input video was trimmed from Kie's example to exactly 2.000 seconds, converted to H.264, 640 × 864, 25 fps. The reference image is a stylized illustrated character. Original example URLs:

- https://static.aiquickdraw.com/tools/example/1767694885407_pObJoMcy.png
- https://static.aiquickdraw.com/tools/example/1767525918769_QyvTNib2.mp4

## Supported mappings

| Interface | Kie model | Output duration | Reference video |
|---|---|---|---|
| Wan 3 | `wan/3-0-video` | 2–15 s in this app | 1–15 s |
| MiniMax Official H3 | `minimax-h3/reference-to-video` | 4–15 s | 2–15 s |
| Seedance 2.0 | `bytedance/seedance-2` | 4–15 s | 2–15 s |
| Seedance 2.5 | `bytedance/seedance-2-5` | 4–30 s | 2–30 s |
| Kling 2.6 Motion Control | `kling-2.6/motion-control` | follows usable input, minimum 3 s | 3–30 s; 10 s max for image orientation |

The first four models use reference-to-video generation guided by the editable prompt. Exact motion transfer quality is model-dependent; Kling is the dedicated motion-control endpoint. The original Aiorbust GPU model is not mapped to a different provider model under the same name. Both original UI modes are exposed. **Reference image + video** uses identity images with the driving video. **First frame + reference** additionally requires a corrected opening image and sends references in the fixed order: identity, corrected opening, additional identity references. The server adds opening-frame instructions while retaining the driving video. This is prompt-guided reference generation, not a pixel-exact locked first-frame parameter. No `first_frame_url` is combined with `reference_video_urls`. Kling accepts only one image, so the two-image mode is disabled for Kling and rejected server-side. No Gemini/xAI prompt-writing integration is claimed.

FFmpeg/ffprobe must be installed and on the server's PATH. Files are decoded locally before upload; MIME types, sizes, dimensions, aspect ratios, durations, codecs and relevant frame-rate limits are checked. Output settings are restricted per model. H3 always generates audio and bills reference-video duration in addition to output duration. Seedance's audio switch controls newly generated audio, not copying the original soundtrack.

## Persistence and failure handling

Real task metadata is saved atomically in the ignored `.data/motion/` directory on this computer. It includes the provider task ID, prompt, settings, status and result URLs, never the API key. Files are private to the OS user, and API access is scoped by a SHA-256 fingerprint of the configured key. This is local development persistence, not a production database or multi-user account service.

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

## Live total-credit estimate

The Motion Control form now displays the total estimated Kie credits on the Generate button and in a breakdown above it. It recalculates immediately when duration, resolution, model or selected clip changes; video metadata is read locally before any upload. Both modes include all selected images in the calculation.

Rates are read from the exact model's published Kie price card (embedded page data), cached server-side for five minutes and refreshed by the UI every minute. Seedance uses the **with-video** price column, not the Fast model or without-video rate. Wan, H3 and Seedance include reference-video duration plus output duration. Kling estimates output duration from the driving video and does not bill the input a second time. H3's first five images are free; subsequent images have the published surcharge (the current UI allows at most four total images).

Fractional video seconds are conservatively rounded up for the estimate. The estimate is not a binding quote from Kie: actual usable output duration, provider rounding or changed prices can affect the final charge. History retains the preflight estimate and displays actual `creditsConsumed` when Kie supplies it. Account top-up bonuses affect the effective dollar cost, not the displayed number of credits.

No zero or fabricated price is substituted when pricing or video metadata cannot be read. Generation is disabled until the estimate is available. The server re-reads the actual file duration with ffprobe and checks current prices and account balance before upload/task creation. If its estimate exceeds the total reviewed in the browser, it returns HTTP 409 to request a refreshed estimate. This guard is not a provider-enforced maximum-charge guarantee.

Verification: all five public price cards fetched and parsed successfully. Browser checks showed Wan 480p at 2s input + 2s output = 32 credits; increasing output to 3s = 40; changing that request to 720p = 80. H3 at 768P, 2s input + 4s output = 48; Seedance 2.0 at 480p for the same durations = 69; Kling 720p with an actual three-second clip = 33. Replacing the clip updates its measured duration. Invalid Kling clip length shows an unavailable estimate. Unit calculations also checked image surcharges and fractional-second rounding. The local API rejected missing and underquoted totals with HTTP 409; a correct 32-credit request reached only the free authentication check and was stopped by the dummy key. No paid generation was started. Production build, typecheck and lint passed.

## Old-tab compatibility fix

A browser tab opened before total-credit estimates were introduced still used the old Generate form. Its requests omitted `maxEstimatedCredits`, so the updated backend correctly stopped them before upload/task creation, but the original error did not explain that the page needed reloading.

Missing estimates now return `CLIENT_UPDATE_REQUIRED` with an explicit reload instruction and `generationStarted: false`, immediately after idempotency lookup and before media inspection or external calls. Changed estimates return `PRICE_CHANGED` separately. The current client refreshes changed prices, displays a reload action for old-client errors, and avoids showing a phantom job ID or ambiguous check-logs warning for a confirmed preflight rejection. It never automatically retries a paid request or reloads a page containing a session key.

Verified old-format requests, underquoted requests, and the current 32-credit trial format through the live local API using a dummy key. The correct format passed pricing validation and stopped at the free authentication check. Build, typecheck and lint passed. A new browser tab loaded the credit-enabled form and displayed `Generate 2s video — ~32 Kie credits`. The screenshot request ID had no job record, consistent with rejection before creation. No paid render was started by these checks.
