import "server-only";
import { createHash } from "node:crypto";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("host") || new URL(req.url).host;
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ApiError("Invalid request origin.", 403);
    }
    if (parsed.host !== host || !["http:", "https:"].includes(parsed.protocol))
      throw new ApiError("Cross-origin requests are not allowed.", 403);
  }
}
export function apiKey(req: Request) {
  const key = (
    req.headers.get("x-kie-key") ||
    process.env.KIE_API_KEY ||
    ""
  ).trim();
  if (!key) throw new ApiError("Configure your Kie API key first.", 401);
  if (key.length > 500 || /[\r\n]/.test(key))
    throw new ApiError("Invalid API key.", 401);
  return key;
}
export function keyId(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
export function redact(message: string, key?: string) {
  let text = message.slice(0, 600);
  if (key) text = text.split(key).join("[redacted]");
  return text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}
export async function kie<T>(
  path: string,
  key: string,
  init: RequestInit = {},
  upload = false,
): Promise<T> {
  const base = upload ? "https://kieai.redpandaai.co" : "https://api.kie.ai";
  let response: Response;
  try {
    response = await fetch(base + path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(upload ? 180000 : 45000),
      redirect: "error",
    });
  } catch {
    throw new ApiError(
      "Kie could not be reached or the request timed out. Check Kie logs before resubmitting a generation.",
      502,
    );
  }
  let body: { code?: number; success?: boolean; msg?: string; data?: T };
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      "Kie returned an unreadable response. Check Kie logs before resubmitting.",
      502,
    );
  }
  if (!response.ok || body.code !== 200 || body.success === false) {
    const code = body.code ?? response.status;
    const status = [400, 401, 402, 403, 404, 422, 429].includes(code)
      ? code
      : 502;
    throw new ApiError(
      redact(body.msg || "Kie rejected the request.", key),
      status,
    );
  }
  if (body.data === undefined || body.data === null)
    throw new ApiError("Kie returned no task data.", 502);
  return body.data;
}
export function errorResponse(error: unknown) {
  const e =
    error instanceof ApiError
      ? error
      : new ApiError("The request could not be completed.", 500);
  return Response.json(
    { error: e.message },
    { status: e.status, headers: { "Cache-Control": "no-store" } },
  );
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
