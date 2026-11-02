"use client";
import { useEffect, useState } from "react";
import { MotionInputMedia, MotionJob } from "@/lib/motion-models";
import { Button, Modal } from "./controls";
import { useKie } from "./kie-connection";

type Preview = MotionInputMedia & { url?: string; error?: string };
export function MotionInputsDialog({ job, onClose }: { job: MotionJob; onClose: () => void }) {
  const { request, key, provider } = useKie();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ request: typeof request; attempt: number; inputs?: Preview[]; error?: string } | null>(null);
  const current = result?.request === request && result.attempt === attempt ? result : null;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const urls: string[] = [];
    async function load() {
      try {
        const data = await request<{ inputs: MotionInputMedia[] }>(`/api/kie/motion/${job.id}/inputs`, { signal: controller.signal });
        const inputs = await Promise.all(data.inputs.map(async (input): Promise<Preview> => {
          try {
            const response = await fetch(`/api/kie/motion/${job.id}/inputs?file=${encodeURIComponent(input.id)}`, {
              headers: { "x-motion-provider": provider, ...(key ? { [provider === "apimart" ? "x-apimart-key" : "x-kie-key"]: key } : {}) },
              signal: controller.signal, cache: "no-store",
            });
            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "This input is unavailable.");
            }
            const blob = await response.blob();
            if (!active) return input;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return { ...input, url };
          } catch (error) { return { ...input, error: error instanceof Error ? error.message : "This input is unavailable." }; }
        }));
        if (active) setResult({ request, attempt, inputs });
      } catch (error) {
        if (active) setResult({ request, attempt, error: error instanceof Error ? error.message : "Could not load generation inputs." });
      }
    }
    void load();
    return () => { active = false; controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [job.id, request, key, provider, attempt]);
  const inputs = [...(current?.inputs ?? [])].sort((a, b) => {
    const rank = (input: Preview) => input.id === "image-1" ? 0 : input.kind === "video" ? 1 : 2;
    return rank(a) - rank(b);
  });
  return (
    <Modal title="Generation inputs" closeLabel="Close" onClose={onClose} className="motion-inputs-modal">
      <p className="motion-inputs-info">{job.label} · {(job.taskId || job.id).slice(0, 10)}</p>
      {!current && <p role="status">Loading generation inputs…</p>}
      {current?.error && <p className="error" role="alert">{current.error}</p>}
      {current?.inputs && <>
        <div className="motion-inputs-grid">
          {inputs.map(input => (
            <figure key={input.id}>
              <h3>{input.kind === "video" ? "Driving video" : input.kind === "first-frame" ? "Opening frame" : input.id === "image-1" ? "Reference photo" : `Reference image ${input.id.split("-").pop()}`}</h3>
              {input.url && (input.kind === "video"
                ? <video src={input.url} controls playsInline preload="metadata" aria-label="Submitted driving video" />
                : <img src={input.url} alt={input.name} />)}
              {input.error && <p className="error" role="alert">{input.error}</p>}
              <figcaption>{input.name}
                {input.kind === "video" && job.selection && <small>Submitted clip: {job.selection.start.toFixed(2)}–{job.selection.end.toFixed(2)} seconds</small>}
              </figcaption>
            </figure>
          ))}
          {!inputs.some(input => input.kind === "image") && <div><h3>Reference photo</h3><p>The original photo was not recorded or is no longer available.</p></div>}
          {!inputs.some(input => input.kind === "video") && <div><h3>Driving video</h3><p>The original video was not recorded or is no longer available.</p></div>}
        </div>
      </>}
      {current && (current.error || !inputs.length || inputs.some(input => input.error)) && <Button secondary onClick={() => setAttempt(value => value + 1)}>Retry loading inputs</Button>}
    </Modal>
  );
}
