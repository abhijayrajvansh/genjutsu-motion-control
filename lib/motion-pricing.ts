import type { MotionModelId } from "./motion-models";
export const PRICE_SOURCES: Record<
  MotionModelId,
  { url: string; model: string; resolutions: string[] }
> = {
  wan: {
    url: "https://kie.ai/wan3.0-video",
    model: "wan/3-0-video",
    resolutions: ["480p", "720p", "1080p"],
  },
  h3: {
    url: "https://kie.ai/minimax-h3",
    model: "minimax-h3/reference-to-video",
    resolutions: ["768P", "2K"],
  },
  seed2: {
    url: "https://kie.ai/seedance-2-0",
    model: "bytedance/seedance-2",
    resolutions: ["480p", "720p", "1080p"],
  },
  seed25: {
    url: "https://kie.ai/seedance-2-5",
    model: "bytedance/seedance-2-5",
    resolutions: ["480p", "720p", "1080p"],
  },
  kling: {
    url: "https://kie.ai/kling-2.6-motion-control",
    model: "kling-2.6/motion-control",
    resolutions: ["720p", "1080p"],
  },
};
export type MotionPriceCard = {
  model: MotionModelId;
  currency?: "CNY" | "USD";
  usdExchangeRate?: number;
  exchangeRateDate?: string;
  rates: Record<string, number>;
  usdRates?: Record<string, number>;
  billsReferenceVideo: boolean;
  freeImages: number;
  extraImageCredits: number;
  sourceUrl: string;
  checkedAt: string;
};
// Parse only the exact provider model's published price card, never another variant's rates.
export function parsePriceCard(
  html: string,
  model: MotionModelId,
  checkedAt: string,
): MotionPriceCard {
  const source = PRICE_SOURCES[model],
    match = html.match(
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/,
    );
  if (!match)
    throw new Error("Kie pricing format changed. No estimate is available.");
  const data = JSON.parse(match[1]);
  const groups = data?.props?.pageProps?.pageData?.groupData;
  if (!Array.isArray(groups))
    throw new Error("Kie pricing data is unavailable.");
  const text = groups.find(
    (g: { model?: string; pricingDesc?: string }) => g.model === source.model,
  )?.pricingDesc;
  if (typeof text !== "string")
    throw new Error("No published price card for this model.");
  const rates: Record<string, number> = {};
  const usdRates: Record<string, number> = {};
  for (const resolution of source.resolutions) {
    const pattern =
      model === "wan" || model === "kling"
        ? new RegExp(
            `([\\d.]+)\\s+credits\\/s(?:\\s*\\([^)]*\\))?\\s+for\\s+${resolution}\\b`,
            "i",
          )
        : model === "seed2" || model === "seed25"
          ? new RegExp(
              `${resolution}\\s*:\\s*([\\d.]+)\\s+credits\\/s\\s*\\([^)]*with video\\)`,
              "i",
            )
          : new RegExp(`${resolution}\\s*:\\s*([\\d.]+)\\s+credits\\/s`, "i");
    const value = Number(text.match(pattern)?.[1]);
    if (!Number.isFinite(value) || value <= 0)
      throw new Error(
        "Kie pricing could not be verified for every resolution.",
      );
    rates[resolution] = value;
    const usdPattern = model === "wan"
      ? new RegExp(`credits\\/s\\s+for\\s+${resolution}\\s*\\(\\$([\\d.]+)\\/s`, "i")
      : model === "kling"
        ? new RegExp(`credits\\/s\\s*\\(\\$([\\d.]+)(?:\\/s)?\\)\\s+for\\s+${resolution}\\b`, "i")
        : new RegExp(`${resolution}\\s*:\\s*[\\d.]+\\s+credits\\/s\\s*\\(\\$([\\d.]+)\\/s${model.startsWith("seed") ? ",\\s*with video" : ""}`, "i");
    const usd = Number(text.match(usdPattern)?.[1]);
    if (Number.isFinite(usd) && usd > 0) usdRates[resolution] = usd;
  }
  // Fail closed if published input-billing rules no longer match this workflow.
  const billsReferenceVideo = model !== "kling";
  if (
    billsReferenceVideo &&
    !/input\s*(?:video\s*)?\+\s*output|input video duration\s*\+\s*output video duration|generated video duration\s*\+\s*input video duration|both input and output durations are billed/i.test(
      text,
    )
  )
    throw new Error(
      "Kie billing rules changed. Check current pricing before rendering.",
    );
  let freeImages = Number.MAX_SAFE_INTEGER,
    extraImageCredits = 0;
  if (model === "h3") {
    freeImages = Number(text.match(/first\s+(\d+)\s+images are free/i)?.[1]);
    extraImageCredits = Number(
      text.match(/Additional image input:\s*([\d.]+)\s*credits\/image/i)?.[1],
    );
    if (!Number.isFinite(freeImages) || !Number.isFinite(extraImageCredits))
      throw new Error("Kie image pricing could not be verified.");
  }
  return {
    model,
    rates,
    usdRates,
    billsReferenceVideo,
    freeImages,
    extraImageCredits,
    sourceUrl: source.url,
    checkedAt,
  };
}
export type MotionCost = {
  total: number;
  outputCredits: number;
  referenceCredits: number;
  imageCredits: number;
  outputSeconds: number;
  referenceSeconds: number;
};
export function estimateMotionCost(
  card: MotionPriceCard,
  resolution: string,
  outputSeconds: number,
  referenceSeconds: number,
  imageCount: number,
): MotionCost {
  const rate = card.rates[resolution];
  if (
    !Number.isFinite(rate) ||
    rate <= 0 ||
    !Number.isFinite(referenceSeconds) ||
    referenceSeconds <= 0 ||
    !Number.isFinite(outputSeconds) ||
    outputSeconds <= 0 ||
    !Number.isInteger(imageCount) ||
    imageCount < 0
  )
    throw new Error(
      "Choose valid media and output settings to calculate the cost.",
    );
  // Conservative preflight estimate; provider bills the actual generated duration.
  const ref = Math.ceil(referenceSeconds - 0.000001),
    out = card.model === "kling" ? ref : Math.ceil(outputSeconds - 0.000001);
  const precision = card.currency === "USD" ? 10000 : 100;
  const round = (n: number) => Math.ceil(n * precision - 0.000001) / precision;
  const outputCredits = round(out * rate),
    referenceCredits = card.billsReferenceVideo ? round(ref * rate) : 0,
    imageCredits = round(
      Math.max(0, imageCount - card.freeImages) * card.extraImageCredits,
    );
  return {
    total: round(outputCredits + referenceCredits + imageCredits),
    outputCredits,
    referenceCredits,
    imageCredits,
    outputSeconds: out,
    referenceSeconds: ref,
  };
}
export function formatCredits(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export const APIMART_PRICE_URL = "https://docs.apimart.ai/en/api-reference/videos/wan3.0-video/generation";
export function parseApimartPriceCard(markdown: string, checkedAt: string): MotionPriceCard {
  markdown = markdown.split("## Billing")[1]?.split("## Limits")[0]?.replace(/\*\*/g, "") || "";
  const rates: Record<string, number> = {};
  for (const resolution of ["480p", "720p", "1080p"]) {
    const match = markdown.match(new RegExp(`\\|\\s*${resolution}\\s*\\|\\s*[¥￥]([\\d.]+)\\s*/\\s*s\\s*\\|`, "i"));
    const rate = Number(match?.[1]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("APIMart pricing format changed.");
    rates[resolution] = rate;
  }
  if (!/use the requested.*duration/i.test(markdown)) throw new Error("APIMart billing rules changed.");
  return { model: "wan", currency: "CNY", rates, billsReferenceVideo: false, freeImages: Number.MAX_SAFE_INTEGER,
    extraImageCredits: 0, sourceUrl: APIMART_PRICE_URL, checkedAt };
}
export function formatMotionAmount(value: number, currency?: "CNY" | "USD", usdExchangeRate?: number) {
  if (currency === "CNY") {
    if (!usdExchangeRate || !Number.isFinite(usdExchangeRate)) return "USD estimate unavailable";
    value *= usdExchangeRate;
  }
  return currency ? value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }) : `${formatCredits(value)} Kie credits`;
}
