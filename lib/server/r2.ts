import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { ApiError } from "./kie";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: URL;
};

function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() ?? "";
  const publicBase = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  if (accessKeyId.length > 128 || secretAccessKey.length > 256 || /[\r\n]/.test(accessKeyId + secretAccessKey)) return null;
  let publicUrl: URL;
  try { publicUrl = new URL(publicBase); } catch { return null; }
  if (
    publicUrl.protocol !== "https:" ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash ||
    publicUrl.port ||
    publicUrl.hostname.endsWith(".r2.cloudflarestorage.com")
  ) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

export function r2Configured() {
  return r2Config() !== null;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (["png", "jpg", "jpeg", "webp", "mp4", "mov"].includes(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "video/mp4") return "mp4";
  if (file.type === "video/quicktime") return "mov";
  return file.type.startsWith("video/") ? "mp4" : "jpg";
}

function contentTypeFor(extension: string) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  return "image/jpeg";
}

function r2ErrorCode(xml: string, status: number) {
  const code = xml.match(/<Code>([A-Za-z0-9]+)<\/Code>/)?.[1];
  return code ?? `HTTP ${status}`;
}

export async function uploadMotionMedia(file: File, jobId: string) {
  const config = r2Config();
  if (!config)
    throw new ApiError("Configure Cloudflare R2 on the server before generating with APIMart. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_URL in .env.local and restart the server.", 503);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId))
    throw new ApiError("Invalid job ID.");
  const extension = extensionFor(file);
  const key = `genjutsu/motion/${jobId}/${randomUUID()}.${extension}`;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const body = Buffer.from(await file.arrayBuffer());
  const contentType = contentTypeFor(extension);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${config.bucket}/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  let response: Response;
  try {
    response = await fetch(`https://${host}${canonicalUri}`, {
      method: "PUT",
      headers: {
        "content-type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        authorization,
      },
      body: new Uint8Array(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(180000),
    });
  } catch {
    throw new ApiError("Cloudflare R2 could not be reached. No paid generation was started.", 502);
  }
  if (!response.ok) {
    const xml = await response.text().catch(() => "");
    throw new ApiError(`Cloudflare R2 rejected the upload (${r2ErrorCode(xml, response.status)}). Check the bucket, token permissions, and public URL. No paid generation was started.`, 502);
  }
  await response.body?.cancel();
  const objectUrl = new URL(encodedKey, `${config.publicUrl.origin}${config.publicUrl.pathname.replace(/\/$/, "")}/`);
  if (objectUrl.protocol !== "https:" || objectUrl.host !== config.publicUrl.host || objectUrl.username || objectUrl.password)
    throw new ApiError("Cloudflare R2 public URL is invalid.", 502);
  return objectUrl.href;
}
