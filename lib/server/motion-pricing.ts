import "server-only";
import { MotionModelId } from "@/lib/motion-models";
import {
  APIMART_PRICE_URL,
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
  if (provider === "apimart" && model !== "wan") throw new ApiError("APIMart supports Wan 3 only.");
  const cacheKey = `${provider}:${model}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async (): Promise<MotionPriceCard> => {
    try {
      const response = await fetch(provider === "apimart" ? APIMART_PRICE_URL + ".md" : PRICE_SOURCES[model].url, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Pricing unavailable.");
      if (provider === "apimart") {
        const card = parseApimartPriceCard(await response.text(), new Date().toISOString());
        const fxResponse = await fetch("https://api.frankfurter.dev/v2/rate/CNY/USD", {
          cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
        });
        if (!fxResponse.ok) throw new Error("Exchange rate unavailable.");
        const fx = await fxResponse.json();
        if (fx.base !== "CNY" || fx.quote !== "USD" || typeof fx.rate !== "number" || !Number.isFinite(fx.rate) || fx.rate <= 0 || typeof fx.date !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(fx.date) || !Number.isFinite(Date.parse(fx.date)) || Math.abs(Date.now() - Date.parse(fx.date)) > 7 * 86400000)
          throw new Error("Invalid or stale exchange rate.");
        const usdRates = Object.fromEntries(Object.entries(card.rates).map(([resolution, rate]) => [resolution, rate * fx.rate]));
        return { ...card, currency: "USD", rates: usdRates, usdRates, usdExchangeRate: fx.rate, exchangeRateDate: fx.date };
      }
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
