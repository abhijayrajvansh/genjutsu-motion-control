import "server-only";
import { MotionModelId } from "@/lib/motion-models";
import {
  MotionPriceCard,
  parsePriceCard,
  PRICE_SOURCES,
} from "@/lib/motion-pricing";
import { ApiError } from "./kie";
const cache = new Map<
  string,
  { expires: number; promise: Promise<MotionPriceCard> }
>();
export async function currentMotionPricing(
  model: MotionModelId,
): Promise<MotionPriceCard> {
  const cached = cache.get(model);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    try {
      const response = await fetch(PRICE_SOURCES[model].url, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Pricing unavailable.");
      return parsePriceCard(
        await response.text(),
        model,
        new Date().toISOString(),
      );
    } catch {
      cache.delete(model);
      throw new ApiError(
        "Current Kie pricing is unavailable. Refresh the estimate before generating.",
        503,
      );
    }
  })();
  cache.set(model, { expires: Date.now() + 300000, promise });
  return promise;
}
