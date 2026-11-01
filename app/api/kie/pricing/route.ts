import { MOTION_MODELS } from "@/lib/motion-models";
import { ApiError, errorResponse, json, requestProvider } from "@/lib/server/kie";
import { currentMotionPricing } from "@/lib/server/motion-pricing";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("model");
    const model = MOTION_MODELS.find((m) => m.id === id);
    if (!model) throw new ApiError("Choose a supported model.");
    return json({ pricing: await currentMotionPricing(model.id, requestProvider(req)) });
  } catch (e) {
    return errorResponse(e);
  }
}
