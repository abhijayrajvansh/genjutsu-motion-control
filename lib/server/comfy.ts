import "server-only";
import { ApiError } from "./kie";

// A ComfyUI server reached either through an SSH tunnel on this computer
// (http://127.0.0.1:8188) or through the rental's HTTPS link (…/?token=…).
export type ComfyServer = { origin: string; token?: string };

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const cookies = new Map<string, string>();

export function comfyServer(req: Request): ComfyServer {
  const raw = (req.headers.get("x-comfy-url") || process.env.COMFY_URL || "").trim();
  if (!raw) throw new ApiError("Paste your ComfyUI link first.", 401);
  if (raw.length > 2000 || /[\r\n]/.test(raw)) throw new ApiError("Invalid ComfyUI link.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError("Enter the full ComfyUI link, starting with https:// or http://127.0.0.1.");
  }
  if (url.username || url.password) throw new ApiError("Remove the user name and password from the ComfyUI link.");
  const local = url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (url.protocol !== "https:" && !local)
    throw new ApiError("Use an https:// ComfyUI link, or http://127.0.0.1 through an SSH tunnel.");
  const token = url.searchParams.get("token") || process.env.COMFY_TOKEN || undefined;
  if (token && (token.length > 500 || /[\s]/.test(token))) throw new ApiError("Invalid ComfyUI token.");
  return { origin: url.origin, token };
}

export function redactComfy(message: string, server?: ComfyServer) {
  let text = message.slice(0, 600);
  if (server?.token) text = text.split(server.token).join("[redacted]");
  return text.replace(/token=[^&\s"']+/gi, "token=[redacted]");
}

async function rawFetch(server: ComfyServer, path: string, init: RequestInit, timeout: number) {
  const headers = new Headers(init.headers);
  if (server.token) headers.set("Authorization", `Bearer ${server.token}`);
  const cookie = cookies.get(server.origin);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(server.origin + path, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(timeout),
  });
}

// Vast's portal accepts ?token= once and answers with a session cookie.
async function login(server: ComfyServer) {
  if (!server.token) return false;
  const response = await fetch(`${server.origin}/?token=${encodeURIComponent(server.token)}`, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  await response.body?.cancel();
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const pairs = setCookies.map((value) => value.split(";")[0]).filter(Boolean);
  if (!pairs.length) return false;
  cookies.set(server.origin, pairs.join("; "));
  return true;
}

export async function comfyFetch(
  server: ComfyServer,
  path: string,
  init: RequestInit = {},
  timeout = 30000,
): Promise<Response> {
  let response: Response;
  // Cloudflare quick tunnels drop the odd request; read-only requests are retried once.
  const idempotent = !init.method || init.method === "GET";
  const send = async () => {
    try {
      return await rawFetch(server, path, init, timeout);
    } catch (error) {
      if (!idempotent || (error instanceof Error && error.name === "TimeoutError")) throw error;
      await new Promise((done) => setTimeout(done, 500));
      return rawFetch(server, path, init, timeout);
    }
  };
  try {
    response = await send();
    if ((response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) && server.token) {
      await response.body?.cancel();
      cookies.delete(server.origin);
      if (await login(server)) response = await send();
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ComfyUI could not be reached. Check that the rental is running and the link is current.", 502);
  }
  if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel();
    throw new ApiError("ComfyUI rejected the access token. Copy the ComfyUI link again from rent-gpu.", 401);
  }
  return response;
}

export async function comfyJson<T>(server: ComfyServer, path: string, init: RequestInit = {}, timeout = 30000): Promise<T> {
  const response = await comfyFetch(server, path, init, timeout);
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(`ComfyUI returned an unreadable response (${response.status}).`, 502);
  }
  if (!response.ok) {
    const message = comfyErrorMessage(body) || `ComfyUI answered ${response.status}.`;
    throw new ApiError(redactComfy(message, server), response.status === 400 ? 400 : 502);
  }
  return body as T;
}

type NodeError = { errors?: { message?: string; details?: string }[]; class_type?: string };

export function comfyErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const data = body as { error?: { message?: string; details?: string } | string; node_errors?: Record<string, NodeError> };
  const parts: string[] = [];
  if (typeof data.error === "string") parts.push(data.error);
  else if (data.error?.message) parts.push(data.error.message + (data.error.details ? `: ${data.error.details}` : ""));
  for (const node of Object.values(data.node_errors || {})) {
    for (const error of node.errors || [])
      parts.push(`${node.class_type || "Node"}: ${error.message || "error"}${error.details ? ` (${error.details})` : ""}`);
  }
  return parts.join(" · ");
}

export type ObjectInfo = Record<
  string,
  { input?: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> } }
>;

// One request for every node's info: dozens of parallel per-node requests lose some through Cloudflare quick tunnels.
export async function objectInfo(server: ComfyServer, nodes: string[]): Promise<ObjectInfo> {
  const all = await comfyJson<ObjectInfo>(server, "/object_info", {}, 90000);
  const result: ObjectInfo = {};
  for (const node of nodes) if (all[node]) result[node] = all[node];
  return result;
}

// Combo options (e.g. model file names) for one input of a node.
export function comboOptions(info: ObjectInfo, node: string, input: string): string[] {
  const spec = info[node]?.input?.required?.[input] ?? info[node]?.input?.optional?.[input];
  const first = spec?.[0];
  if (Array.isArray(first)) return first.map(String);
  const options = (spec?.[1] as { options?: unknown[] } | undefined)?.options;
  return Array.isArray(options) ? options.map(String) : [];
}
