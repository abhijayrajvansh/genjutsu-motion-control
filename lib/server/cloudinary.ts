import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "./kie";

function cloudinaryConfig() {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  let apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  let apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (process.env.CLOUDINARY_URL) {
    try {
      const url = new URL(process.env.CLOUDINARY_URL);
      if (url.protocol !== "cloudinary:") return null;
      cloudName = url.hostname;
      apiKey = decodeURIComponent(url.username);
      apiSecret = decodeURIComponent(url.password);
    } catch { return null; }
  }
  if (!cloudName || cloudName === "YOUR_CLOUD_NAME" || !/^[a-zA-Z0-9_-]+$/.test(cloudName) || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}
export function cloudinaryConfigured() { return cloudinaryConfig() !== null; }

export async function uploadMotionMedia(file: File, jobId: string) {
  const config = cloudinaryConfig();
  if (!config) throw new ApiError("Configure Cloudinary on the server before generating with APIMart. Set CLOUDINARY_URL in .env.local and restart the server.", 503);
  const resourceType = file.type.startsWith("video/") ? "video" : "image";
  const params = { folder: `genjutsu/motion/${jobId}`, public_id: randomUUID(), timestamp: String(Math.floor(Date.now() / 1000)) };
  const signed = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  const signature = createHash("sha256").update(signed + config.apiSecret).digest("hex");
  const body = new FormData();
  body.set("file", file, file.name);
  for (const [name, value] of Object.entries(params)) body.set(name, value);
  body.set("api_key", config.apiKey);
  body.set("signature", signature);
  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`, {
      method: "POST", body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(180000),
    });
  } catch { throw new ApiError("Cloudinary upload could not be completed. No paid generation was started.", 502); }
  // Do not return raw Cloudinary errors, which can include credential and signature details.
  if (!response.ok) throw new ApiError("Cloudinary rejected the upload. Check its server credentials, storage quota, and upload limits. No paid generation was started.", 502);
  let result: { secure_url?: string; resource_type?: string };
  try { result = await response.json(); }
  catch { throw new ApiError("Cloudinary returned an unreadable upload response.", 502); }
  let url: URL;
  try { url = new URL(result.secure_url || ""); } catch { throw new ApiError("Cloudinary returned no media URL.", 502); }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== "res.cloudinary.com" || result.resource_type !== resourceType)
    throw new ApiError("Cloudinary returned an invalid media URL.", 502);
  return url.href;
}
