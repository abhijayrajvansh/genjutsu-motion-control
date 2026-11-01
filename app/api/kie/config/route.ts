import { apiKey, errorResponse, json, kie, sameOrigin, requestProvider } from "@/lib/server/kie";
import { apimartBalance } from "@/lib/server/apimart";
import { cloudinaryConfigured } from "@/lib/server/cloudinary";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const provider = requestProvider(req);
    return json({ configured: !!(provider === "apimart" ? process.env.APIMART_API_KEY : process.env.KIE_API_KEY)?.trim(),
      mediaReady: provider === "kie" || cloudinaryConfigured() });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const key = apiKey(req);
    const credits = requestProvider(req) === "apimart" ? await apimartBalance(key) : await kie<number>("/api/v1/chat/credit", key);
    return json({ connected: true, credits });
  } catch (e) { return errorResponse(e); }
}
