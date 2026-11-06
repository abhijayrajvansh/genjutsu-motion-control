import { comfyServer } from "@/lib/server/comfy";
import { refreshEditJob } from "@/lib/server/image-edit-status";
import { deleteEditJob, readEditJob } from "@/lib/server/image-edit-store";
import { ApiError, errorResponse, json, sameOrigin } from "@/lib/server/kie";
export const runtime = "nodejs";
export const maxDuration = 180;
type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const job = await readEditJob(id);
    if (job.state === "success" || job.state === "fail") return json({ job });
    try {
      const server = comfyServer(req);
      if (job.promptId && job.server !== server.origin)
        return json({ job, warning: `This edit is running on another ComfyUI (${job.server}). Reconnect that link to see its result.` });
      return json({ job: await refreshEditJob(job, server) });
    } catch (error) {
      // Keep the card; report why its status could not be refreshed.
      return json({ job, warning: error instanceof ApiError ? error.message : "Could not reach ComfyUI." });
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    const { id } = await params;
    await readEditJob(id);
    await deleteEditJob(id);
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
