# APIMart Wan 3

## Setup

1. Copy `.env.example` to `.env.local` and configure `CLOUDINARY_URL` using the API environment variable from Cloudinary Console → API Keys. Alternatively omit that URL and provide the three individual Cloudinary variables listed in the example.
2. Restart `npm run dev` or your production server.
3. Select APIMart in the header. Paste your APIMart key and click Connect, or configure `APIMART_API_KEY` on the server. Balance checks do not start a render.
4. Load the two-second trial or choose your reference image and driving video. Review the credit estimate and generate once.

Cloudinary configuration is required for APIMart; Kie keeps its existing upload service. No public app URL or Kie key is needed for APIMart. The configuration endpoint returns only whether credentials are configured, never their values. Provider selection and successfully connected keys are saved separately in this browser, following the existing Kie behavior.

## Media and motion behavior

The app validates files and trims the selected driving-video segment using the existing FFmpeg pipeline before uploading. APIMart images and videos are uploaded through signed server-side Cloudinary requests into `genjutsu/motion/<job-id>`. Cloudinary returns HTTPS delivery URLs that APIMart can fetch. API secrets never reach the browser or APIMart. Uploaded assets remain in your Cloudinary account until you delete them; this integration does not automatically delete cloud assets. Cloudinary storage/bandwidth costs are separate from APIMart generation estimates.

APIMart receives `wan3.0-video`, explicit `generation_type: reference`, `image_urls`, `video_urls`, resolution, duration, adaptive aspect ratio, audio, seed, and `nsfw_check`. The existing identity/clothing/motion instructions are preserved; ImageN and VideoN labels are mapped to APIMart's documented 图N and 视频N labels. The driving video still determines output timing. The existing conservative Wan limits remain: 1–4 images, 2–15 seconds of output, up to 15 seconds of input, combined input/output at most 30 seconds, and the existing resolution restrictions. First frame + reference remains unavailable. Other models are available through Kie.

Original clip audio is saved locally before generation and attached when downloading if requested, using the existing pipeline. Generated audio is disabled when preserving original audio. APIMart jobs persist under `.data/motion/`, namespaced by provider and key. Old records without a provider retain their Kie interpretation. Status polling and downloads use the provider recorded on each job. Switching providers hides the other provider's history and reconnects the selected key.

## Pricing and task recovery

The app fetches the exact `wan3.0-video` price table from https://apimart.ai/model/wan-3-0, caches it for five minutes, and fails closed if the table or reference-video billing rule cannot be parsed. It uses the public Gold/current USD column: $0.0329/s at 480P, $0.0658/s at 720P, and $0.1315/s at 1080P at verification. Platinum and Diamond discounts may lower actual charges. The pricing index lists starting prices only; it is not a price for all resolutions.

The model page explicitly bills reference-video duration plus generated-video duration. This conflicts with the API documentation's output-only CNY billing text, which was the earlier integration's source. Estimates now follow the model price page and include both durations. The two-second input plus two-second output trial estimates $0.1316 at 480P. USD rates come directly from APIMart; there is no external exchange-rate dependency. New jobs store USD estimates. Previously saved USD estimates retain their reviewed values; legacy CNY estimates show that a USD estimate is unavailable rather than applying an invented conversion. Cloudinary usage and optional moderation remain additional costs.

The header displays remaining account credits from `GET /v1/user/balance` (`remain_credits`), not the API key's token quota from `/v1/balance`. An unlimited token quota does not mean unlimited account funds. Missing or invalid account credits produce an error instead of an unlimited balance. Credits are not compared directly to USD generation estimates; APIMart enforces available funds when accepting the request. History labels actual provider-reported `credits_cost` as APIMart credits separately from USD estimates. Optional moderation may incur additional cost; generation estimates do not include that charge.

The Generate button, resolution rates, and form cost breakdown display APIMart credits, converting the published USD estimate at $0.10 per credit. Totals round to two decimal places; per-second rates retain up to four. For example, $0.8554 displays as approximately 8.55 APIMart credits. Published dollar prices are approximate, so this conversion remains an estimate; the provider reports the final charge. Stored estimates and submission quotes retain their original USD values for compatibility with existing jobs and pricing validation.

The server revalidates media and pricing before any upload/generation. Underquoted requests return 409. Existing job IDs are reused without submitting again. Failed uploads do not start a paid render. Ambiguous submission failures remain marked for manual task recovery; the app never automatically resubmits a generation. Use APIMart's dashboard to find an existing task ID, then link it from the job card.

## Verification

The trial was checked in the browser for provider switching, APIMart labels, loaded media/clip timing, and its converted USD estimate. An inline verification exercised the actual route handlers, real trial-file inspection and FFmpeg trimming, live published price parsing, Cloudinary signature generation, provider-specific submission/polling, ownership isolation, download bytes, duplicate submission prevention, underquoted estimates, unsupported models, and failed uploads. External upload and paid generation responses were simulated. Live Cloudinary uploads and paid APIMart output have not been verified without credentials.

## References

- https://docs.apimart.ai/en/api-reference/videos/wan3.0-video/generation
- https://docs.apimart.ai/en/api-reference/tasks/status
- https://docs.apimart.ai/en/api-reference/account/token-balance
- https://docs.apimart.ai/en/api-reference/account/user-balance
- https://cloudinary.com/documentation/upload_images
- https://cloudinary.com/documentation/authentication_signatures

- https://apimart.ai/model/wan-3-0
- https://apimart.ai/pricing
