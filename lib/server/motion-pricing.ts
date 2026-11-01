import "server-only";
import { MotionModelId } from "@/lib/motion-models";
import {
  APIMART_PRICE_PAGES,
  parseApimartPriceCard,
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
  provider: "kie" | "apimart" = "kie",
): Promise<MotionPriceCard> {
  const apimartPage = APIMART_PRICE_PAGES[model];
  if (provider === "apimart" && !apimartPage) throw new ApiError("APIMart supports Wan 3, Wan 2.7 R2V and Wan 2.7 Video Edit.");
  if (provider !== "apimart" && (model === "wan27r2v" || model === "wan27edit"))
    throw new ApiError("Wan 2.7 R2V and Video Edit are available on APIMart.");
  const cacheKey = `${provider}:${model}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async (): Promise<MotionPriceCard> => {
    try {
      const response = await fetch(provider === "apimart" ? apimartPage!.url : PRICE_SOURCES[model].url, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Pricing unavailable.");
      if (provider === "apimart") return parseApimartPriceCard(await response.text(), new Date().toISOString(), model);
      return parsePriceCard(
        await response.text(),
        model,
        new Date().toISOString(),
      );
    } catch {
      cache.delete(cacheKey);
      throw new ApiError(
        `Current ${provider === "apimart" ? "APIMart" : "Kie"} pricing is unavailable. Refresh the estimate before generating.`,
        503,
      );
    }
  })();
  cache.set(cacheKey, { expires: Date.now() + 300000, promise });
  return promise;
}
