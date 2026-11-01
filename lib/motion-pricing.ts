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

export function formatMotionCredits(value: number, currency?: "CNY" | "USD", maximumFractionDigits = 2, includeProvider = true) {
  if (currency === "CNY") return "Credit estimate unavailable for legacy job";
  // APIMart's published USD equivalents use $0.10 per credit.
  // Keep the reviewed quote in its original units; convert only for display.
  const credits = currency === "USD" ? value * 10 : value;
  const unit = includeProvider ? `${currency === "USD" ? "APIMart" : "Kie"} credits` : "credits";
  return `${credits.toLocaleString("en-US", { maximumFractionDigits })} ${unit}`;
}

export const APIMART_PRICE_URL = "https://apimart.ai/model/wan-3-0";
export function parseApimartPriceCard(html: string, checkedAt: string): MotionPriceCard {
  const plain = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  // Select this exact variant's table, then the public Gold/current USD column.
  const table = html.match(/<table\b[\s\S]*?<\/table>/g)?.find((value) =>
    /<code\b[^>]*>wan3\.0-video<\/code>/.test(value));
  if (!table || !/Variant Tier Gold Current price Platinum Diamond Official/.test(plain(table)))
    throw new Error("APIMart pricing format changed.");
  const rates: Record<string, number> = {};
  let variant = "";
  for (const row of table.match(/<tr\b[\s\S]*?<\/tr>/g) ?? []) {
    const code = row.match(/<code\b[^>]*>([^<]+)<\/code>/)?.[1];
    if (code) variant = code;
    if (variant !== "wan3.0-video") continue;
    const cells = (row.match(/<td\b[\s\S]*?<\/td>/g) ?? []).map(plain);
    const index = cells.findIndex((value) => /^(480|720|1080)P$/.test(value));
    if (index < 0) continue;
    const match = cells[index + 1]?.match(/Credits\s*\(\s*~\$([\d.]+)\s*\)\s*\/sec/);
    const rate = Number(match?.[1]);
    if (!Number.isFinite(rate) || rate <= 0 || rates[cells[index].toLowerCase()] !== undefined)
      throw new Error("APIMart resolution price is unavailable.");
    rates[cells[index].toLowerCase()] = rate;
  }
  if (["480p", "720p", "1080p"].some((resolution) => !rates[resolution]))
    throw new Error("APIMart pricing is missing a resolution.");
  if (!/Total cost = \(reference video duration \+ generated video duration\)/.test(plain(html)))
    throw new Error("APIMart billing rules changed.");
  return { model: "wan", currency: "USD", rates, usdRates: rates, billsReferenceVideo: true,
    freeImages: Number.MAX_SAFE_INTEGER, extraImageCredits: 0, sourceUrl: APIMART_PRICE_URL, checkedAt };
}
export function formatMotionAmount(value: number, currency?: "CNY" | "USD") {
  if (currency === "CNY") return "USD estimate unavailable for legacy job";
  // Kie publishes 8 credits = $0.04. Keep billing values in credits; convert only for display.
  const usd = currency === "USD" ? value : value * 0.005;
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
