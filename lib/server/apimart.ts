import "server-only";
import { ApiError, redact } from "./kie";
export async function apimart<T>(path: string, key: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("https://api.apimart.ai" + path, {
      ...init, headers: { ...init.headers, Authorization: `Bearer ${key}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(180000),
    });
  } catch {
    throw new ApiError("APIMart could not be reached. Check your APIMart tasks before resubmitting.", 502);
  }
  let body;
  try { body = await response.json(); }
  catch { throw new ApiError("APIMart returned an unreadable response. Check your tasks before resubmitting.", 502); }
  if (!response.ok || body.error || body.success === false || (body.code !== undefined && body.code !== 200)) {
    const code = body.error?.code ?? body.code ?? response.status;
    throw new ApiError(redact(body.error?.message || body.message || "APIMart rejected the request.", key),
      [400, 401, 402, 403, 404, 413, 422, 429].includes(code) ? code : 502);
  }
  return body as T;
}
export async function apimartBalance(key: string) {
  const balance = await apimart<{ remain_balance: number; unlimited_quota?: boolean }>("/v1/balance", key);
  if (typeof balance.remain_balance !== "number" || !Number.isFinite(balance.remain_balance))
    throw new ApiError("APIMart returned an invalid balance.", 502);
  // APIMart balance units vary by account configuration. Never compare these to CNY pricing.
  return balance.unlimited_quota ? null : balance.remain_balance;
}
