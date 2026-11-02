# Helping the user download reels

## Established workflow

The user sends Instagram links rapidly, often across several messages, and wants the assistant to keep downloading them through <https://fastvideosave.net/>. Treat new links in this context as instructions to download; append them to the queue without asking for confirmation each time. Keep replies brief and report actual results.

Save videos in **`~/Desktop/sonali/ideas`**, which resolves on this machine to `/Users/abhijayrajvansh/Desktop/sonali/ideas`. This is the existing folder confirmed during the session; do not create `~/Desktop/ideas/sonali` instead.

The reusable script is [scripts/download-reels.mjs](scripts/download-reels.mjs), exposed as `npm run reels`. It uses Playwright and a separate, visible Google Chrome window. It does not require the Next.js app or its development server to run.

## Start or resume

Run commands from this repository. Dependencies come from `npm install`; Google Chrome must be installed. `ffprobe` is installed on this machine and provides video-stream validation.

For an ongoing stream of links, launch a persistent terminal session with a PTY:

```bash
npm run reels -- --watch
```

Initial links may be passed while starting watch mode:

```bash
npm run reels -- --watch 'https://www.instagram.com/reel/POST_ID/'
```

Keep the execution session ID returned by the terminal tool. Send subsequent links with `write_stdin`, using that session ID and a newline after each URL. Several URLs can be submitted together, one per line. Input received during a download stays queued and is processed sequentially.

Reuse a live session when available. Terminal session IDs are temporary and may not survive a new chat or runtime restart; discover or start a session instead of assuming an old ID works. Leave the watch process and its Chrome window open while the user is sending links. Do not run the same queue in multiple processes.

For a finite batch:

```bash
npm run reels -- 'https://www.instagram.com/p/POST_ID/' 'https://www.instagram.com/reels/ANOTHER_ID/'
```

Only use `--output /another/directory` if the user requests a different destination. The supported URL paths are `/p/`, `/reel/`, `/reels/`, and `/tv/` on `instagram.com` or `www.instagram.com`, over HTTPS. Send just URLs to the script; ignore unrelated chat text.

## What the script does

1. Opens Fastvideosave, fills the textbox named `Media link`, and presses Enter.
2. Waits up to 90 seconds for visible `a[data-action="dl"]` download links.
3. Reads the available server links and downloads through the browser context's request client, trying Server 1 and then the next available server if needed. Each server request has a 45-second timeout.
4. Writes a temporary `.part` file, checks its MP4 `ftyp` header, and uses ffprobe when available to confirm a video stream before renaming it to the final filename.
5. Names files `POST_ID.mp4`. Additional videos returned for the same post receive `POST_ID-2.mp4`, and so on. Existing nonempty files are validated and skipped when valid.
6. Appends successful downloads to `.reel-downloads.jsonl` inside the destination folder. Records include the source Instagram URL, filename, server label, byte count, and completion timestamp.

Videos and the download log stay outside the repository. The destination's log is the durable record of completed links; avoid copying the entire download history into project documentation.

## Verify and report

Poll the terminal for results while continuing to queue new user links. A `FETCH` or `TRY` message only means work started. Report completion after a `SAVED` message, or `SKIP` for an existing validated file. `READY` means watch mode accepts more input; watch mode also accepts links while downloading.

Use the destination log and actual files to reconcile a queue if execution is interrupted. For additional inspection, run:

```bash
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of json "$HOME/Desktop/sonali/ideas/POST_ID.mp4"
```

Only claim all links are complete when every submitted URL has a successful result or an existing validated file. Mention any remaining failure explicitly. Keep routine success replies to a short confirmation and the destination link.

## Recovery and known issues

- **No download servers:** A few links timed out while Fastvideosave was processing them, then succeeded when resubmitted after the rest of the queue. Retry a failed link once after pending links finish. Retries are manual; the script only automatically falls back between servers.
- **Both servers fail:** Resubmit the source Instagram URL to obtain fresh server URLs. If it still fails, inspect the site's visible result and report the blocker. Do not treat an error page, image, or empty response as a downloaded video.
- **Chrome was closed:** The process can remain alive but requests fail with `Target page, context or browser has been closed`. End the idle watch process with Ctrl-D, start a new watch session, and requeue unsaved links. Successfully saved files remain in place.
- **Stopping:** Ctrl-D ends stdin; watch mode drains already queued input and then closes Chrome. Its final exit code can be 1 if any earlier attempt failed, even when a later retry succeeded. Check per-file results and the log.
- **Human verification:** If the site requires a challenge, ask the user to complete it in the visible browser, then retry as needed. Do not solve or bypass it automatically. Private or unavailable posts may not produce download links.
- **Video side data:** ffprobe CSV output can be `video,` rather than exactly `video` for valid videos with side data. The script was fixed to parse JSON and check `streams[].codec_type`. Preserve that behavior; `De9DfdGzKKQ` and `DfBr-k2ovSq` both downloaded successfully after this fix.
- **Browser access:** The app's Chrome control connection was unavailable during setup. The script's separate headed Chrome session worked. Headless Chrome timed out during investigation; keep the working headed configuration.

After changing the script, run the existing lint and typecheck commands and verify the affected behavior with a real requested download. Do not create extra test scripts unless requested. Commit and push in-scope repository changes under the project's usual instructions; routine downloads do not require commits.
