import { apiKey, errorResponse, json, kie, sameOrigin } from "@/lib/server/kie";
export const runtime = "nodejs";
export async function GET() {
  return json({ configured: !!process.env.KIE_API_KEY?.trim() });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const key = apiKey(req);
    const credits = await kie<number>("/api/v1/chat/credit", key);
    return json({ connected: true, credits });
  } catch (e) {
    return errorResponse(e);
  }
}
