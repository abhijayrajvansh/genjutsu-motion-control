import {
  apiKey,
  ApiError,
  errorResponse,
  json,
  requestOwner,
  sameOrigin,
} from "@/lib/server/kie";
import { publicJob, readJob, updateJob } from "@/lib/server/motion-store";
import { refreshJob } from "@/lib/server/motion-status";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const key = apiKey(req),
      { id } = await params;
    const job = await readJob(id, requestOwner(req, key));
    return json({ job: publicJob(await refreshJob(job, key)) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    const key = apiKey(req),
      { id } = await params;
    const job = await readJob(id, requestOwner(req, key));
    if (job.taskId)
      throw new ApiError("This job already has a provider task ID.", 409);
    const { taskId } = await req.json();
    if (typeof taskId !== "string" || !taskId.trim() || taskId.length > 200)
      throw new ApiError("Enter a valid provider task ID.");
    const updated = await refreshJob(
      { ...job, taskId: taskId.trim(), state: "waiting" },
      key,
    );
    await updateJob(updated);
    return json({ job: publicJob(updated) });
  } catch (e) {
    return errorResponse(e);
  }
}
