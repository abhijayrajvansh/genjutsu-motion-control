import { comfyJson, comfyServer } from "@/lib/server/comfy";
import { refreshH3Job } from "@/lib/server/h3-status";
import { deleteH3Job, readH3Job, updateH3Job } from "@/lib/server/h3-store";
import { ApiError, errorResponse, json, sameOrigin } from "@/lib/server/kie";
export const runtime = "nodejs";
export const maxDuration = 600;
type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const job = await readH3Job(id);
    if (job.state === "success" || job.state === "fail") return json({ job });
    try {
      const server = comfyServer(req);
      if (job.promptId && job.server !== server.origin)
        return json({ job, warning: `This video is running on another ComfyUI (${job.server}). Reconnect that link to see its result.` });
      return json({ job: await refreshH3Job(job, server) });
    } catch (error) {
      // Keep the card; report why its status could not be refreshed.
      return json({ job, warning: error instanceof ApiError ? error.message : "Could not reach ComfyUI." });
    }
  } catch (error) {
    return errorResponse(error);
  }
}

// Cancel a queued or running render in ComfyUI.
export async function POST(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    const { id } = await params;
    const job = await readH3Job(id);
    if (job.state === "success" || job.state === "fail") return json({ job });
    const server = comfyServer(req);
    if (job.server !== server.origin) throw new ApiError("Connect the ComfyUI link this video was sent to, then cancel it.", 409);
    if (job.promptId) await comfyJson(server, `/api/jobs/${encodeURIComponent(job.promptId)}/cancel`, { method: "POST" });
    const now = Date.now();
    const next = { ...job, state: "fail" as const, error: "Cancelled.", updated: now, completedAt: now };
    await updateH3Job(next);
    return json({ job: next });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    const { id } = await params;
    await readH3Job(id);
    await deleteH3Job(id);
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
