import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { IMAGE_EDIT_MAX_MB } from "@/lib/image-edit";
import { sniffImage } from "@/lib/server/image-edit-store";
import { ApiError } from "@/lib/server/kie";

const MAX_BYTES = IMAGE_EDIT_MAX_MB * 1024 * 1024;

// A pasted CDN link is downloaded here so the browser never has to fetch it itself.
export async function fetchImageLink(raw: string) {
  const url = parseLink(raw);
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(current);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        headers: { Accept: "image/png,image/jpeg,image/webp,image/*;q=0.8" },
      });
    } catch {
      throw new ApiError("That link could not be reached.", 502);
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) throw new ApiError("That link did not return an image.", 422);
      current = new URL(next, current);
      continue;
    }
    if (!response.ok) throw new ApiError("That link did not return an image.", 422);
    const bytes = await readLimited(response);
    const type = sniffImage(bytes);
    if (!type) throw new ApiError("Use a PNG, JPEG or WebP link.", 415);
    return { bytes, type, name: imageName(current, type) };
  }
  throw new ApiError("That link redirected too many times.", 422);
}

function parseLink(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ApiError("Paste a full image link, starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new ApiError("Paste a full image link, starting with https://");
  if (url.username || url.password) throw new ApiError("That link is not allowed.");
  return url;
}

async function assertPublic(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
    throw new ApiError("That link is not allowed.");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (!addresses.length || addresses.some((address) => blocked(address)))
    throw new ApiError("That link is not allowed.");
}

function blocked(address: string) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const ip = mapped ? mapped[1] : address.toLowerCase();
  if (ip.includes(":")) {
    return ip === "::" || ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd");
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function readLimited(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError("That link did not return an image.", 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new ApiError(`That image is larger than ${IMAGE_EDIT_MAX_MB} MB.`, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function imageName(url: URL, type: string) {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = decodeURIComponent(url.pathname.split("/").pop() || "")
    .replace(/[^\w.\- ]+/g, "")
    .slice(0, 80);
  if (/\.(png|jpe?g|webp)$/i.test(base)) return base;
  return base ? `${base}.${ext}` : `image.${ext}`;
}
