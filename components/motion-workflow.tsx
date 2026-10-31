"use client";
import { useRef, useState } from "react";
import { Asset, saveRecord } from "@/lib/storage";
import {
  defaultMotionPrompt,
  motionModel,
  MOTION_MODELS,
  MotionJob,
  MotionMode,
} from "@/lib/motion-models";
import {
  Button,
  Choices,
  FilePicker,
  IMAGE_TYPES,
  Prompt,
  Select,
  useSaved,
} from "./controls";
import { estimateMotionCost, formatCredits } from "@/lib/motion-pricing";
import { useMotionPricing, useVideoLength } from "./motion-cost";
import { KieConnection, useKie } from "./kie-connection";
export function MotionWorkflow({
  initialVideo,
}: {
  initialVideo?: Asset | null;
}) {
  const [saved, setSaved] = useSaved("clone.motion.kie-model", "wan"),
    model = motionModel(
      MOTION_MODELS.some((m) => m.id === saved) ? saved : "wan",
    );
  const [savedMode, setSavedMode] = useSaved(
    "clone.motion.kie-mode",
    "reference",
  );
  const mode: MotionMode =
    savedMode === "first-frame" && model.maxImages > 1
      ? "first-frame"
      : "reference";
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const promptKey = `${model.id}:${mode}`;
  const prompt = promptDrafts[promptKey] ?? defaultMotionPrompt(model.id, mode);
  function setPrompt(value: string) {
    setPromptDrafts((drafts) => ({ ...drafts, [promptKey]: value }));
  }
  function changeMode(value: string) {
    setSavedMode(value);
    setError("");
    setStage("");
    setExtras([]);
  }
  const [firstFrame, setFirstFrame] = useState<Asset | null>(null);
  const [resolution, setResolution] = useState("480p"),
    [seconds, setSeconds] = useState(2),
    [orientation, setOrientation] = useState("video"),
    [audio, setAudio] = useState(false),
    [image, setImage] = useState<Asset | null>(null),
    [video, setVideo] = useState<Asset | null>(initialVideo ?? null),
    [extras, setExtras] = useState<(Asset | null)[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [lastId, setLastId] = useState<string | null>(null);
  const submitting = useRef(false),
    kie = useKie();
  const selectedResolution = (model.resolutions as readonly string[]).includes(
    resolution,
  )
    ? resolution
    : model.resolutions[0];
  const duration = Math.max(
    model.minSeconds,
    Math.min(model.maxSeconds, seconds),
  );
  const pricing = useMotionPricing(model.id);
  const videoLength = useVideoLength(video);
  const imageCount =
    Number(!!image) +
    extras.filter(Boolean).length +
    Number(mode === "first-frame" && !!firstFrame);
  const referenceSeconds = videoLength?.seconds;
  const videoLimit =
    model.id === "kling" && orientation === "image" ? 10 : model.maxReference;
  const inputError =
    referenceSeconds &&
    (referenceSeconds < model.minReference - 0.04 ||
      referenceSeconds > videoLimit + 0.04)
      ? `Driving video must be ${model.minReference}–${videoLimit} seconds for ${model.label}.`
      : referenceSeconds &&
          model.id === "wan" &&
          referenceSeconds + duration > 30.04
        ? "Driving video plus output duration must not exceed 30 seconds."
        : null;
  const cost =
    pricing.card && referenceSeconds && !inputError
      ? estimateMotionCost(
          pricing.card,
          selectedResolution,
          duration,
          referenceSeconds,
          imageCount,
        )
      : null;
  const costProblem = pricing.error || inputError || videoLength?.error;
  const insufficient =
    cost !== null && kie.balance !== null && kie.balance < cost.total;
  function changeModel(id: string) {
    const next = motionModel(id);
    setSaved(id);
    setResolution(next.resolutions[0]);
    setSeconds(next.minSeconds);
    if (id === "kling") setSavedMode("reference");
    setExtras([]);
    setError("");
  }
  async function trial() {
    setBusy(true);
    setError("");
    try {
      const files = await Promise.all([
        fetch("/trial/reference.png").then((r) => {
          if (!r.ok) throw new Error("Trial image is unavailable.");
          return r.blob();
        }),
        fetch("/trial/motion-2s.mp4").then((r) => {
          if (!r.ok) throw new Error("Trial video is unavailable.");
          return r.blob();
        }),
      ]);
      const assets: Asset[] = files.map((blob, i) => ({
        id: crypto.randomUUID(),
        name: i ? "motion-2s.mp4" : "reference.png",
        type: i ? "video/mp4" : "image/png",
        blob,
        created: Date.now(),
      }));
      for (const a of assets) await saveRecord("assets", a);
      changeModel("wan");
      setSavedMode("reference");
      setFirstFrame(null);
      setImage(assets[0]);
      setVideo(assets[1]);
      setStage(
        "Trial ready: Wan 3 · 2 seconds · 480p · audio off. Connect Kie, then generate once.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the trial.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!kie.connected) {
      setError("Connect your Kie API key first.");
      return;
    }
    if (!image || !video) {
      setError("Add a reference image and a driving video.");
      return;
    }
    if (mode === "first-frame" && !firstFrame) {
      setError("Add the corrected first frame for this mode.");
      return;
    }
    if (extras.some((x) => !x)) {
      setError("Fill or remove every extra reference image.");
      return;
    }
    if (!cost) {
      setError("Wait for the total-credit estimate before generating.");
      return;
    }
    if (insufficient) {
      setError("Your Kie balance is below this generation’s estimated total.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setStage(
      "Validating files, uploading to Kie, and submitting one generation…",
    );
    const id = crypto.randomUUID();
    setLastId(id);
    const body = new FormData();
    body.set("id", id);
    body.set("model", model.id);
    body.set("mode", mode);
    if (mode === "first-frame" && firstFrame)
      body.set("firstFrame", firstFrame.blob, firstFrame.name);
    body.set("prompt", prompt);
    body.set("seconds", String(duration));
    body.set("resolution", selectedResolution);
    body.set("audio", String(audio));
    body.set("orientation", orientation);
    body.set("maxEstimatedCredits", String(cost.total));
    for (const a of [image, ...extras])
      if (a) body.append("images", a.blob, a.name);
    body.set("video", video.blob, video.name);
    try {
      const data = await kie.request<{ job: MotionJob }>("/api/kie/motion", {
        method: "POST",
        body,
      });
      setStage(
        `Submitted to Kie. Task ${data.job.taskId ?? data.job.id}. Track it under Your generations.`,
      );
      kie.changed();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not submit this generation.",
      );
      setStage(
        "No automatic retry was made. Check Your generations and Kie logs before resubmitting.",
      );
      kie.changed();
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <form className="generation-form" onSubmit={submit}>
      <Select
        label="Model"
        options={MOTION_MODELS.map((m) => ({ value: m.id, label: m.label }))}
        value={model.id}
        onChange={changeModel}
        hint="Real generation on your Kie key and balance. No Aiorbust credits required."
      />
      <small>
        The original “MiniMax H3 Aiorbust 3.0” needs its own GPU workflow and is
        not a Kie model. Official H3 is available here.
      </small>
      <KieConnection />
      <div className="trial-panel">
        <strong>Small trial</strong>
        <small>
          Load a public Kie example image and a two-second motion clip. Nothing
          is submitted until you press Generate.
        </small>
        <Button type="button" secondary disabled={busy} onClick={trial}>
          Load 2-second trial
        </Button>
      </div>
      <Select
        label="Resolution"
        options={[...model.resolutions]}
        value={selectedResolution}
        onChange={setResolution}
      />
      {model.id === "kling" ? (
        <Choices
          label="Character orientation"
          options={[
            {
              value: "video",
              label: "Follow the video",
              hint: "Up to 30 seconds.",
            },
            {
              value: "image",
              label: "Follow the image",
              hint: "Driving video up to 10 seconds.",
            },
          ]}
          value={orientation}
          onChange={setOrientation}
        />
      ) : (
        <label className="field">
          <span className="between">
            Output duration <small>{duration} s</small>
          </span>
          <input
            aria-label="Output duration"
            type="range"
            min={model.minSeconds}
            max={model.maxSeconds}
            value={duration}
            onChange={(e) => setSeconds(+e.target.value)}
          />
          <small>
            {model.id === "wan"
              ? "Two seconds is the shortest trial."
              : "This model starts at four seconds."}
          </small>
        </label>
      )}
      <Choices
        label="Mode"
        value={mode}
        onChange={changeMode}
        options={[
          {
            value: "reference",
            label: "Reference image + video",
            hint: "The person comes from your image. Garments, camera, scene and timing come from the video.",
          },
          {
            value: "first-frame",
            label: "First frame + reference",
            hint:
              model.id === "kling"
                ? "Needs two images. Choose Wan, Official H3 or Seedance to use this mode."
                : "Supply an already-corrected opening frame and a separate identity image. The clip is guided to continue from the opening.",
            disabled: model.id === "kling",
          },
        ]}
      />
      {mode === "first-frame" && (
        <div className="trial-panel">
          <small>
            The opening frame is a visual guide. These Kie reference-video
            endpoints do not guarantee a pixel-exact first frame.
          </small>
        </div>
      )}
      <FilePicker
        label={
          mode === "first-frame"
            ? "Reference image (identity)"
            : "Reference image"
        }
        hint={`${model.id === "kling" ? "PNG or JPEG" : "PNG, JPEG or WebP"} · up to ${model.imageMB} MB`}
        accept={model.id === "kling" ? "image/png,image/jpeg" : IMAGE_TYPES}
        asset={image}
        onPick={setImage}
      />
      {mode === "first-frame" && (
        <FilePicker
          label="First frame"
          hint={`Already corrected · required · up to ${model.imageMB} MB`}
          accept={IMAGE_TYPES}
          asset={firstFrame}
          onPick={setFirstFrame}
        />
      )}
      {extras.map((a, i) => (
        <div key={i}>
          <FilePicker
            label={`Reference image ${i + (mode === "first-frame" ? 3 : 2)}`}
            asset={a}
            onPick={(v) =>
              setExtras((xs) => xs.map((x, k) => (i === k ? v : x)))
            }
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setExtras((xs) => xs.filter((_, k) => k !== i))}
          >
            Remove reference
          </button>
        </div>
      ))}
      {extras.length < model.maxImages - (mode === "first-frame" ? 2 : 1) && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => setExtras((xs) => [...xs, null])}
        >
          + Add another reference image
        </button>
      )}
      <FilePicker
        label="Driving video"
        hint={`MP4 or MOV · ${model.minReference}–${model.maxReference} seconds · up to ${model.videoMB} MB`}
        accept="video/mp4,video/quicktime"
        asset={video}
        onPick={setVideo}
      />
      <Prompt
        value={prompt}
        onChange={setPrompt}
        maxLength={2000}
        hint={
          mode === "first-frame"
            ? "Image 1 = identity; image 2 = corrected opening; video = movement. Opening-frame instructions are added automatically."
            : model.id === "wan"
              ? "Image1 is your character; Video1 is the movement reference. Adjust the prompt before rendering."
              : "Use the prompt to describe identity, motion, clothing and scene. Motion reproduction depends on the model and your inputs."
        }
      />
      {!["h3", "kling"].includes(model.id) && (
        <label className="check">
          <input
            type="checkbox"
            checked={audio}
            onChange={(e) => setAudio(e.target.checked)}
          />
          <span>
            Generate audio
            <small>
              Leave off for the small trial. This does not copy the original
              soundtrack.
            </small>
          </span>
        </label>
      )}
      {model.id === "h3" && (
        <small>
          H3 always generates an audio track. Reference video duration is billed
          in addition to output duration.
        </small>
      )}
      {model.id === "kling" && (
        <small>
          Output follows the usable driving-video length, with a three-second
          minimum. The provider may retain its original audio.
        </small>
      )}
      <div className="trial-panel">
        <small>
          Generate uploads the selected files to Kie and starts one paid render.
          Review{" "}
          <a href="https://kie.ai/pricing" target="_blank" rel="noreferrer">
            Kie pricing
          </a>{" "}
          for this model. Results can take several minutes.
        </small>
      </div>
      <section
        className="generation-cost"
        aria-live="polite"
        aria-label="Generation cost"
      >
        <div className="between">
          <span>Estimated total</span>
          <strong>
            {cost
              ? `${formatCredits(cost.total)} Kie credits`
              : costProblem
                ? "Unavailable"
                : video
                  ? "Calculating…"
                  : "Add a driving video"}
          </strong>
        </div>
        {cost && (
          <>
            <small>
              Output: {formatCredits(cost.outputCredits)} credits
              {pricing.card?.billsReferenceVideo
                ? ` · Driving video: ${formatCredits(cost.referenceCredits)} credits`
                : ""}
              {cost.imageCredits
                ? ` · Images: ${formatCredits(cost.imageCredits)} credits`
                : ""}
            </small>
            <small>
              {cost.outputSeconds}s output
              {pricing.card?.billsReferenceVideo
                ? ` + ${cost.referenceSeconds}s driving video`
                : ""}
              . Fractional seconds are rounded up for this estimate. Final Kie
              billing can differ.
            </small>
          </>
        )}
        {pricing.card && (
          <small>
            <a href={pricing.card.sourceUrl} target="_blank" rel="noreferrer">
              Kie pricing
            </a>{" "}
            checked {new Date(pricing.card.checkedAt).toLocaleTimeString()}.
          </small>
        )}
        {pricing.error && (
          <div className="error" role="alert">
            {pricing.error}
            <button
              type="button"
              className="text-button"
              onClick={pricing.refresh}
            >
              Refresh pricing
            </button>
          </div>
        )}
        {inputError && (
          <small className="error" role="alert">
            {inputError}
          </small>
        )}
        {videoLength?.error && (
          <small className="error">{videoLength.error}</small>
        )}
        {insufficient && (
          <small className="error">
            Not enough Kie credits. Balance: {formatCredits(kie.balance!)} ·
            Estimated total: {formatCredits(cost!.total)}.
          </small>
        )}
      </section>
      <Button
        disabled={
          busy ||
          !cost ||
          insufficient ||
          !kie.connected ||
          !image ||
          !video ||
          (mode === "first-frame" && !firstFrame)
        }
      >
        {busy
          ? "Uploading / submitting…"
          : cost
            ? `Generate${model.id === "kling" ? "" : ` ${duration}s video`} — ~${formatCredits(cost.total)} Kie credits`
            : costProblem
              ? "Generate — estimate unavailable"
              : video
                ? "Calculating total credits…"
                : "Generate — add a driving video"}
      </Button>
      {stage && (
        <p className="motion-stage" role="status">
          {stage}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {lastId && <small>Local job ID: {lastId}</small>}
      <small>
        Jobs are saved on this computer and continue on Kie after you close this
        page. Download completed results before the provider’s links expire.
      </small>
    </form>
  );
}
