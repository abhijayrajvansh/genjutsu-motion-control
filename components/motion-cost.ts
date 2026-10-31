"use client";
import { useEffect, useState } from "react";
import { Asset } from "@/lib/storage";
import { MotionModelId } from "@/lib/motion-models";
import { MotionPriceCard } from "@/lib/motion-pricing";
export function useVideoLength(asset: Asset | null) {
  const [result, setResult] = useState<{
    id: string;
    seconds: number | null;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!asset) return;
    let active = true;
    const url = URL.createObjectURL(asset.blob),
      video = document.createElement("video");
    video.preload = "metadata";
    const finish = (seconds: number | null, error?: string) => {
      if (active) setResult({ id: asset.id, seconds, error });
    };
    const timeout = setTimeout(
      () => finish(null, "Could not read video duration. Choose another clip."),
      15000,
    );
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      if (Number.isFinite(video.duration) && video.duration > 0)
        finish(video.duration);
      else finish(null, "This clip has no readable duration.");
    };
    video.onerror = () => {
      clearTimeout(timeout);
      finish(null, "Could not read video duration. Choose another clip.");
    };
    video.src = url;
    return () => {
      active = false;
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
  }, [asset]);
  return asset
    ? result?.id === asset.id
      ? result
      : { id: asset.id, seconds: null }
    : null;
}
export function useMotionPricing(model: MotionModelId) {
  const [state, setState] = useState<{
      model: MotionModelId;
      card?: MotionPriceCard;
      error?: string;
    } | null>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/kie/pricing?model=${model}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Pricing unavailable.");
        if (active) setState({ model, card: data.pricing });
      } catch (e) {
        if (active)
          setState({
            model,
            error: e instanceof Error ? e.message : "Pricing unavailable.",
          });
      }
    }
    void load();
    const interval = setInterval(load, 60000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [model, revision]);
  return {
    card: state?.model === model ? state.card : undefined,
    error: state?.model === model ? state.error : undefined,
    refresh: () => setRevision((r) => r + 1),
  };
}
