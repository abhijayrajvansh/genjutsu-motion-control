import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { apiKey, ApiError, errorResponse, keyId, kie } from "@/lib/server/kie";
import { readJob, updateJob } from "@/lib/server/motion-store";
import { refreshJob } from "@/lib/server/motion-status";
import { attachInputAudio, saveInputAudio, savedAudioResult } from "@/lib/server/original-audio";
import { providerInputVideo } from "@/lib/server/video-trim";
import { motionModel } from "@/lib/motion-models";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
export const runtime = "nodejs";
export const maxDuration = 300;
function privateAddress(ip: string) {
  return (
    ip === "::1" ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80") ||
    ip.includes("::ffff:") ||
    /^0\.|^10\.|^127\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(
      ip,
    )
  );
}
async function publicUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new ApiError("Invalid result URL.", 502);
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => privateAddress(a.address)))
    throw new ApiError("Invalid result host.", 502);
  return url;
}
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const key = apiKey(req),
      { id } = await params;
    let job = await refreshJob(await readJob(id, keyId(key)), key);
    if (job.state !== "success" || !job.resultUrls?.[0])
      throw new ApiError("The video is not ready to download.", 409);
    const resultUrl = job.resultUrls[0];
    if (job.preserveInputAudio === undefined && new URL(req.url).searchParams.get("originalAudio") === "true") {
      if (!job.taskId) throw new ApiError("The original input clip is unavailable for this generation.", 409);
      const task = await kie<{ model?: string; param?: string }>(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(job.taskId)}`, key);
      if (task.model && task.model !== motionModel(job.model).kieModel)
        throw new ApiError("The Kie task model does not match this job.", 409);
      const input = typeof task.param === "string" ? await providerInputVideo(task.param) : undefined;
      if (!input) throw new ApiError("The original input clip is no longer available from Kie, so its audio cannot be recovered.", 409);
      job = { ...job, preserveInputAudio: true, inputHasAudio: await saveInputAudio(id, input), updated: Date.now() };
      await updateJob(job);
    }
    const headers = {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="motion-${id}.mp4"`,
      "Cache-Control": "no-store",
    };
    const cached = job.preserveInputAudio ? await savedAudioResult(id) : undefined;
    if (cached) return new Response(Readable.toWeb(createReadStream(cached)) as ReadableStream<Uint8Array>, { headers });
    let value = resultUrl,
      response: Response | undefined;
    for (let i = 0; i < 5; i++) {
      const url = await publicUrl(value);
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(120000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = response.headers.get("location");
        await response.body?.cancel();
        if (!next) throw new ApiError("Invalid download redirect.", 502);
        value = new URL(next, url).href;
        continue;
      }
      break;
    }
    if (!response?.ok || !response.body)
      throw new ApiError(
        "The provider video could not be downloaded. Its URL may have expired.",
        502,
      );
    if (job.preserveInputAudio) {
      const output = await attachInputAudio(id, response.body, job.inputHasAudio === true);
      return new Response(Readable.toWeb(createReadStream(output)) as ReadableStream<Uint8Array>, { headers });
    }
    return new Response(response.body, { headers });
  } catch (e) {
    return errorResponse(e);
  }
}
