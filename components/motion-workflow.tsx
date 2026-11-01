"use client";
import { useEffect, useRef, useState } from "react";
import { Asset, records, saveRecord } from "@/lib/storage";
import {
  defaultMotionPrompt,
  motionModel,
  MOTION_MODELS,
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
import { VideoClipControls, VideoClipEditor } from "./video-clip-editor";
import { VideoSelection, videoSelection } from "@/lib/video-selection";
import { KieRequestError, useKie } from "./kie-connection";
function randomSeed() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % 2147483647;
}
const MOTION_INPUTS_KEY = "clone.motion.inputs";
type SavedMotionInputs = {
  imageId?: string | null;
  videoId?: string | null;
  firstFrameId?: string | null;
  extraIds?: (string | null)[];
  clip?: { assetId: string; selection: VideoSelection } | null;
};
function readMotionInputs(): SavedMotionInputs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MOTION_INPUTS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as SavedMotionInputs) : {};
  } catch {
    return {};
  }
}
function writeMotionInputs(patch: SavedMotionInputs) {
  localStorage.setItem(MOTION_INPUTS_KEY, JSON.stringify({ ...readMotionInputs(), ...patch }));
}
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
  const mode = (savedMode === "reference" ? savedMode : "reference") as MotionMode;
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
  const clipControls = useRef<VideoClipControls>(null);
  const [clipPlaying, setClipPlaying] = useState(false);
  const [resolution, setResolution] = useState("480p"),
    [orientation, setOrientation] = useState("video"),
    [audio, setAudio] = useState(false),
    [seed, setSeed] = useState(""),
    [plannedSeed, setPlannedSeed] = useState(randomSeed),
    [nsfwChecker, setNsfwChecker] = useState(false),
    [preserveInputAudio, setPreserveInputAudio] = useState(true),
    [image, setImage] = useState<Asset | null>(null),
    [video, setVideo] = useState<Asset | null>(initialVideo ?? null),
    [extras, setExtras] = useState<(Asset | null)[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [lastId, setLastId] = useState<string | null>(null),
    [reloadNeeded, setReloadNeeded] = useState(false);
  const submitting = useRef(false),
    kie = useKie();
  useEffect(() => {
    let live = true;
    records<Asset>("assets")
      .then((assets) => {
        if (!live) return;
        const hasSaved = localStorage.getItem(MOTION_INPUTS_KEY) !== null;
        const saved = readMotionInputs();
        const byId = new Map(assets.map((asset) => [asset.id, asset]));
        const newest = (kind: "image/" | "video/") =>
          assets
            .filter((asset) => asset.type.startsWith(kind))
            .sort((a, b) => b.created - a.created)[0] ?? null;
        const imageAsset = hasSaved
          ? saved.imageId ? byId.get(saved.imageId) ?? null : null
          : newest("image/");
        const videoAsset = initialVideo ?? (hasSaved
          ? saved.videoId ? byId.get(saved.videoId) ?? null : null
          : newest("video/"));
        setImage(imageAsset);
        if (!initialVideo) setVideo(videoAsset);
        if (!hasSaved) writeMotionInputs({ imageId: imageAsset?.id ?? null, videoId: videoAsset?.id ?? null });
        setFirstFrame(saved.firstFrameId ? byId.get(saved.firstFrameId) ?? null : null);
        setExtras((saved.extraIds ?? []).map((id) => (id ? byId.get(id) ?? null : null)));
        if (saved.clip) setClipDraft(saved.clip);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [initialVideo]);
  function chooseImage(asset: Asset | null) {
    setImage(asset);
    writeMotionInputs({ imageId: asset?.id ?? null });
  }
  function chooseVideo(asset: Asset | null) {
    setClipPlaying(false);
    setVideo(asset);
    writeMotionInputs({ videoId: asset?.id ?? null, ...(asset ? {} : { clip: null }) });
  }
  function chooseFirstFrame(asset: Asset | null) {
    setFirstFrame(asset);
    writeMotionInputs({ firstFrameId: asset?.id ?? null });
  }
  const has480p = (model.resolutions as readonly string[]).includes("480p");
  const selectedResolution = has480p ? "480p" : (model.resolutions as readonly string[]).includes(
    resolution,
  )
    ? resolution
    : model.resolutions[0];
  const pricing = useMotionPricing(model.id);
  const videoLength = useVideoLength(video);
  const [clipDraft, setClipDraft] = useState<{ assetId: string; selection: VideoSelection } | null>(null);
  const sourceSeconds = videoLength?.seconds ?? 0;
  const minimumClip = Math.max(model.minSeconds, model.minReference);
  const maximumClip = Math.min(model.maxSeconds, model.maxReference, model.id === "kling" && orientation === "image" ? 10 : Infinity);
  const clip = sourceSeconds > 0
    ? videoSelection(sourceSeconds, minimumClip, maximumClip, clipDraft && clipDraft.assetId === video?.id ? clipDraft.selection : undefined)
    : null;
  const referenceSeconds = clip ? Math.round((clip.end - clip.start) * 1000000) / 1000000 : null;
  const duration = referenceSeconds ? Math.round(referenceSeconds) : model.minSeconds;
  const imageCount =
    Number(!!image) +
    extras.filter(Boolean).length +
    Number(mode === "first-frame" && !!firstFrame);
  const videoLimit =
    model.id === "kling" && orientation === "image" ? 10 : model.maxReference;
  const inputError =
    referenceSeconds &&
    (referenceSeconds < minimumClip - 0.000001 ||
      referenceSeconds > videoLimit + 0.04)
      ? `Select ${minimumClip}–${videoLimit} seconds for ${model.label}.`
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
      chooseImage(assets[0]);
      chooseVideo(assets[1]);
      setClipDraft(null);
      writeMotionInputs({ clip: null });
      setAudio(false);
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
    setReloadNeeded(false);
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
    if (!clip || !cost) {
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
      "Trimming your selection, validating files, and submitting one generation…",
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
    body.set("trimStart", String(clip.start));
    body.set("trimEnd", String(clip.end));
    body.set("resolution", selectedResolution);
    body.set("audio", String(audio));
    const typedSeed = seed.trim() === "" ? plannedSeed : Number(seed);
    body.set("seed", String(typedSeed));
    body.set("nsfwChecker", String(model.id === "wan" && nsfwChecker));
    body.set("preserveInputAudio", String(preserveInputAudio));
    body.set("orientation", orientation);
    body.set("maxEstimatedCredits", String(cost.total));
    for (const a of [image, ...extras])
      if (a) body.append("images", a.blob, a.name);
    body.set("video", video.blob, video.name);
    try {
      await kie.request("/api/kie/motion", {
        method: "POST",
        body,
      });
      setStage("");
      if (seed.trim() === "") setPlannedSeed(randomSeed());
      kie.changed();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not submit this generation.",
      );
      if (e instanceof KieRequestError && e.generationStarted === false) {
        setLastId(null);
        setStage(
          "No paid generation was started. Your files and settings are still here.",
        );
        if (e.code === "CLIENT_UPDATE_REQUIRED") setReloadNeeded(true);
        if (e.code === "PRICE_CHANGED") pricing.refresh();
      } else {
        setStage(
          "No automatic retry was made. Check Your generations and Kie logs before resubmitting.",
        );
      }
      kie.changed();
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <form className="generation-form" onSubmit={submit}>
      <div className="motion-model-row">
        <Select
          label="Model"
          options={MOTION_MODELS.map((m) => ({ value: m.id, label: m.label }))}
          value={model.id}
          onChange={changeModel}
        />
        <Select
          label="Mode"
          value={mode}
          onChange={changeMode}
          options={[
            {
              value: "reference",
              label: "Reference image + video",
            },
            {
              value: "first-frame",
              label: "First frame + reference · Under construction",
              hint: "Under construction. This mode is temporarily unavailable.",
              disabled: true,
            },
          ]}
        />
      </div>
      {model.id === "kling" && (
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
      )}
      {mode === "first-frame" && (
        <div className="trial-panel">
          <small>
            The opening frame is a visual guide. These Kie reference-video
            endpoints do not guarantee a pixel-exact first frame.
          </small>
        </div>
      )}
      <div className="motion-input-grid">
        <div className="motion-image-input">
          <FilePicker
            label={
              mode === "first-frame"
                ? "Reference image (identity)"
                : "Reference image"
            }
            accept={model.id === "kling" ? "image/png,image/jpeg" : IMAGE_TYPES}
            asset={image}
            onPick={chooseImage}
          />
          {mode === "first-frame" && (
            <FilePicker
              label="First frame"
              hint={`Already corrected · required · up to ${model.imageMB} MB`}
              accept={IMAGE_TYPES}
              asset={firstFrame}
              onPick={chooseFirstFrame}
            />
          )}
          {extras.map((a, i) => (
            <div key={i}>
              <FilePicker
                label={`Reference image ${i + (mode === "first-frame" ? 3 : 2)}`}
                asset={a}
                onPick={(v) =>
                  setExtras((xs) => {
                    const next = xs.map((x, k) => (i === k ? v : x));
                    writeMotionInputs({ extraIds: next.map((asset) => asset?.id ?? null) });
                    return next;
                  })
                }
              />
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setExtras((xs) => {
                    const next = xs.filter((_, k) => k !== i);
                    writeMotionInputs({ extraIds: next.map((asset) => asset?.id ?? null) });
                    return next;
                  })
                }
              >
                Remove reference
              </button>
            </div>
          ))}
        </div>
        <div>
          <FilePicker
            label="Driving video"
            accept="video/mp4,video/quicktime"
            asset={video}
            onPick={chooseVideo}
            loadedContent={video && clip && sourceSeconds > 0 ? (
              <VideoClipEditor key={video.id} asset={video} sourceSeconds={sourceSeconds} selection={clip}
                minimum={minimumClip} maximum={maximumClip} disabled={busy} compact playbackRef={clipControls}
                onPlaybackChange={setClipPlaying}
                onChange={(selection) => {
                  const next = { assetId: video.id, selection };
                  setClipDraft(next);
                  writeMotionInputs({ clip: next });
                }} />
            ) : undefined}
            onPreview={clip ? () => clipControls.current?.togglePlayback() : undefined}
            previewLabel={clipPlaying ? "Pause video" : "Play video"}
            previewDisabled={busy || (!!clip && sourceSeconds < minimumClip)}
          />
        </div>
      </div>
      <div className="motion-input-actions">
        <div>
          {extras.length < model.maxImages - (mode === "first-frame" ? 2 : 1) && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() =>
                setExtras((xs) => {
                  const next = [...xs, null];
                  writeMotionInputs({ extraIds: next.map((asset) => asset?.id ?? null) });
                  return next;
                })
              }
            >
              + Add another reference image
            </button>
          )}
        </div>
        {(!image || !video) && (
          <button type="button" className="text-button trial-text-button" disabled={busy} onClick={trial}>
            Load 2-second trial
          </button>
        )}
      </div>
      <Select
        label="Resolution"
        options={model.resolutions.map((value) => {
          const locked = has480p && value !== "480p";
          const price = pricing.card?.usdRates?.[value] !== undefined
            ? `${pricing.card.usdRates[value].toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 })}/s`
            : pricing.card || pricing.error ? "Price unavailable" : "Loading price…";
          return { value, label: `${value} · ${price}${locked ? " · Locked" : ""}`, disabled: locked };
        })}
        value={selectedResolution}
        onChange={setResolution}
      />
      <details className="prompt-override">
        <summary>Override prompt</summary>
        <Prompt
          value={prompt}
          onChange={setPrompt}
          maxLength={2000}
          hintClassName="motion-prompt-note"
          hint={
            mode === "first-frame"
              ? "Image 1 = identity; image 2 = corrected opening; video = movement. Opening-frame instructions are added automatically."
              : model.id === "wan"
                ? "Image1 supplies the character, clothing and skin coverage, including minimal clothing. Video1 supplies motion and timing only. Adjust the prompt before rendering."
                : "Use the prompt to describe identity, motion, clothing and scene. Motion reproduction depends on the model and your inputs."
          }
        />
      </details>
      {model.id === "wan" && (
        <>
          <label className="field">
            Seed
            <input
              type="number"
              min={0}
              max={2147483647}
              step={1}
              value={seed}
              placeholder={String(plannedSeed)}
              onChange={(event) => setSeed(event.target.value)}
            />
            <small>
              This generation will use seed {seed.trim() === "" ? plannedSeed : seed.trim()}. Leave the field empty to use the preview, or type a whole number from 0 to 2147483647.
            </small>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={nsfwChecker}
              onChange={(event) => setNsfwChecker(event.target.checked)}
            />
            <span>
              NSFW checker
              <small>Off sends nsfw_checker false, so Kie does not filter clothing or skin. On asks Kie to filter the result.</small>
            </span>
          </label>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={preserveInputAudio} onChange={(event) => setPreserveInputAudio(event.target.checked)} />
        <span>Keep original clip audio<small>Use the selected input segment’s soundtrack in the downloaded video.</small></span>
      </label>
      {!preserveInputAudio && !["h3", "kling"].includes(model.id) && (
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
      {!preserveInputAudio && model.id === "h3" && (
        <small>
          H3 always generates an audio track. Reference video duration is billed
          in addition to output duration.
        </small>
      )}
      {!preserveInputAudio && model.id === "kling" && (
        <small>
          Output follows the usable driving-video length, with a three-second
          minimum. The provider may retain its original audio.
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
      <div className="motion-submit-bar">
        <div className="motion-submit-inner">
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
        </div>
      </div>
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
      {reloadNeeded && (
        <div className="trial-panel">
          <Button
            type="button"
            secondary
            onClick={() => window.location.reload()}
          >
            Reload latest version
          </Button>
          <small>
            Uploaded files remain in the library. Your saved key reconnects
            automatically after reloading.
          </small>
        </div>
      )}
    </form>
  );
}
