import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { apiKey, ApiError, errorResponse, keyId } from "@/lib/server/kie";
import { readJob } from "@/lib/server/motion-store";
import { refreshJob } from "@/lib/server/motion-status";
export const runtime = "nodejs";
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
    const job = await refreshJob(await readJob(id, keyId(key)), key);
    if (job.state !== "success" || !job.resultUrls?.[0])
      throw new ApiError("The video is not ready to download.", 409);
    let value = job.resultUrls[0],
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
    return new Response(response.body, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="motion-${id}.mp4"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
