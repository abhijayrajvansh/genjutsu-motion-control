import { apiKey, errorResponse, json, requestOwner } from "@/lib/server/kie";
import { readJob } from "@/lib/server/motion-store";
import { loadMotionInputs, readMotionInput } from "@/lib/server/motion-inputs";

export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const key = apiKey(req);
    const { id } = await params;
    const job = await readJob(id, requestOwner(req, key));
    const file = new URL(req.url).searchParams.get("file");
    if (!file) return json({ inputs: await loadMotionInputs(job, key) });
    const { data, type } = await readMotionInput(id, file);
    return new Response(new Uint8Array(data), { headers: {
      "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error); }
}
