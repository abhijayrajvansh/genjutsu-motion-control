"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  H3_CLIP_SECONDS,
  H3_CUSTOM_SIZE,
  H3_DEFAULT_MODEL,
  H3_DEFAULT_TARGET,
  H3_MARGINS,
  H3_MAX_LORAS,
  H3_MAX_SEED,
  H3_MIN_SECTION,
  H3_MOTION_SIZES,
  H3_PENDING,
  H3_RESOLUTIONS,
  H3_STEPS,
  H3_STRENGTH,
  H3Acceleration,
  H3Job,
  H3Lora,
  H3Margin,
  H3MotionSize,
  H3Resolution,
  H3Status,
  h3CanvasSize,
  h3ClipCount,
  hasSpeedLora,
  isSpeedLora,
  resolutionLabel,
} from "@/lib/h3-swap";
import { Asset, records } from "@/lib/storage";
import { VideoSelection, videoSelection } from "@/lib/video-selection";
import { Button, Choices, FilePicker, IMAGE_TYPES, Modal, Select, TextField, VIDEO_TYPES } from "./controls";
import { ArchiveButton, FavoriteButton } from "./favorite-button";
import { GenerationElapsed, GenerationTime } from "./generation-time";
import { RenderPreview } from "./render-preview";
import { VideoClipEditor } from "./video-clip-editor";

// MiniMax H3 Simple motion transfer (Openjutsu's workflow) on the rented ComfyUI GPU.
// Settings and picked inputs are kept in this browser; jobs and results live in the local server's .data folder.

const SETTINGS_KEY = "clone.h3.settings";
const INPUTS_KEY = "clone.h3.inputs";

type Settings = {
  resolution: string; // a preset or "custom"
  customWidth: number;
  customHeight: number;
  role: string;
  target: string;
  hatFix: boolean;
  noLipSync: boolean;
  margin: H3Margin;
  motion: H3MotionSize;
  clipSeconds: number;
  steps: number;
  model: string;
  describer: string;
  textEncoder: string;
  videoVae: string;
  audioVae: string;
  useLoras: boolean;
  loras: H3Lora[];
  acceleration: H3Acceleration;
};
const DEFAULTS: Settings = {
  resolution: "480p",
  customWidth: 576,
  customHeight: 1024,
  role: "",
  target: H3_DEFAULT_TARGET,
  hatFix: false,
  noLipSync: false,
  margin: "normal",
  motion: 512,
  clipSeconds: H3_CLIP_SECONDS.default,
  steps: H3_DEFAULT_MODEL.steps,
  model: H3_DEFAULT_MODEL.model,
  describer: H3_DEFAULT_MODEL.describer,
  textEncoder: H3_DEFAULT_MODEL.textEncoder,
  videoVae: H3_DEFAULT_MODEL.videoVae,
  audioVae: H3_DEFAULT_MODEL.audioVae,
  useLoras: true,
  loras: H3_DEFAULT_MODEL.loras,
  acceleration: "none",
};

function readSettings(): Settings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const saved = { ...DEFAULTS, ...(parsed as Partial<Settings>) };
    if (!Object.hasOwn(H3_MARGINS, saved.margin)) saved.margin = DEFAULTS.margin;
    if (!H3_MOTION_SIZES.includes(saved.motion)) saved.motion = DEFAULTS.motion;
    if (!Array.isArray(saved.loras)) saved.loras = DEFAULTS.loras;
    return saved;
  } catch {
    return DEFAULTS;
  }
}

type SavedInputs = { pictureId?: string | null; videoId?: string | null; clip?: { assetId: string; selection: VideoSelection; mode: "full" | "trim" } | null };
function readInputs(): SavedInputs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INPUTS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as SavedInputs) : {};
  } catch {
    return {};
  }
}
function writeInputs(patch: SavedInputs) {
  try {
    localStorage.setItem(INPUTS_KEY, JSON.stringify({ ...readInputs(), ...patch }));
  } catch {
    // Browser storage is unavailable; inputs simply won't survive a reload.
  }
}

function randomSeed() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % (H3_MAX_SEED + 1);
}

function comfyHeaders(link: string): Record<string, string> {
  return link.trim() ? { "x-comfy-url": link.trim() } : {};
}

async function call<T>(url: string, link: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...comfyHeaders(link), ...(init.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

// Duration and frame size of a picked video.
function useVideoInfo(asset: Asset | null) {
  const [info, setInfo] = useState<{ id: string; seconds: number; width: number; height: number; error?: string } | null>(null);
  useEffect(() => {
    if (!asset) return;
    let live = true;
    const url = URL.createObjectURL(asset.blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (!live) return;
      if (Number.isFinite(video.duration) && video.duration > 0)
        setInfo({ id: asset.id, seconds: video.duration, width: video.videoWidth, height: video.videoHeight });
      else setInfo({ id: asset.id, seconds: 0, width: 0, height: 0, error: "This clip has no readable duration." });
    };
    video.onerror = () => {
      if (live) setInfo({ id: asset.id, seconds: 0, width: 0, height: 0, error: "Could not read this video. Choose an MP4, MOV or WebM file." });
    };
    video.src = url;
    return () => {
      live = false;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
  }, [asset]);
  return asset && info?.id === asset.id ? info : null;
}

function fileOptions(files: string[] | undefined, current: string) {
  const list = files?.length ? files : [];
  const options = list.map((name) => ({ value: name, label: name }));
  if (current && !list.includes(current)) options.unshift({ value: current, label: files ? `${current} (not on this GPU)` : current });
  return options.length ? options : [{ value: "", label: "Connect ComfyUI to list models" }];
}

export function H3SwapForm({
  comfyLink,
  onComfyLink,
  modelPicker,
}: {
  comfyLink: string;
  onComfyLink: (value: string) => void;
  modelPicker: React.ReactNode;
}) {
  const [settings, setSettingsState] = useState<Settings>(DEFAULTS),
    [picture, setPicture] = useState<Asset | null>(null),
    [video, setVideo] = useState<Asset | null>(null),
    [clipDraft, setClipDraft] = useState<SavedInputs["clip"]>(null),
    [previewHost, setPreviewHost] = useState<HTMLDivElement | null>(null),
    [seed, setSeed] = useState(""),
    [plannedSeed, setPlannedSeed] = useState<number | null>(null),
    [status, setStatus] = useState<H3Status | null>(null),
    [checking, setChecking] = useState(false),
    [draftLink, setDraftLink] = useState(comfyLink),
    [busy, setBusy] = useState<"" | "swap" | "mask">(""),
    [error, setError] = useState(""),
    [stage, setStage] = useState(""),
    linkId = useId();

  useEffect(() => {
    // Hydrate saved settings, the seed preview and picked inputs after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettingsState(readSettings());
    setPlannedSeed(randomSeed());
    let live = true;
    records<Asset>("assets")
      .then((assets) => {
        if (!live) return;
        const saved = readInputs();
        const byId = new Map(assets.map((asset) => [asset.id, asset]));
        setPicture(saved.pictureId ? byId.get(saved.pictureId) ?? null : null);
        setVideo(saved.videoId ? byId.get(saved.videoId) ?? null : null);
        if (saved.clip) setClipDraft(saved.clip);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  function update(patch: Partial<Settings>) {
    setSettingsState((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Settings stay for this visit only.
      }
      return next;
    });
  }
  function choosePicture(asset: Asset | null) {
    setPicture(asset);
    writeInputs({ pictureId: asset?.id ?? null });
  }
  function chooseVideo(asset: Asset | null) {
    setVideo(asset);
    writeInputs({ videoId: asset?.id ?? null, clip: null });
    setClipDraft(null);
  }

  useEffect(() => {
    // Follow the saved link once it hydrates from browser storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftLink(comfyLink);
  }, [comfyLink]);
  const check = useCallback(async (link: string) => {
    if (!link.trim()) {
      setStatus(null);
      return;
    }
    setChecking(true);
    try {
      const response = await fetch("/api/comfy/h3/status", { headers: comfyHeaders(link), cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { status?: H3Status; error?: string };
      setStatus(data.status ?? { ok: false, error: data.error || "ComfyUI could not be checked." });
    } catch {
      setStatus({ ok: false, error: "ComfyUI could not be checked." });
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    // Check the saved ComfyUI link when the form loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check(comfyLink);
  }, [comfyLink, check]);
  function connect() {
    const link = draftLink.trim();
    onComfyLink(link);
    void check(link);
  }

  const info = useVideoInfo(video);
  const sourceSeconds = info?.seconds ?? 0;
  const canTrim = sourceSeconds > H3_MIN_SECTION;
  const fullClip = canTrim ? videoSelection(sourceSeconds, H3_MIN_SECTION, sourceSeconds) : null;
  const savedClip = clipDraft && video && clipDraft.assetId === video.id ? clipDraft : null;
  const clipMode: "full" | "trim" = savedClip?.mode ?? "full";
  const clip = fullClip ? videoSelection(sourceSeconds, H3_MIN_SECTION, sourceSeconds, clipMode === "trim" ? savedClip?.selection : undefined) : null;
  const partSeconds = clip && clipMode === "trim" ? clip.end - clip.start : sourceSeconds;

  const resolution: H3Resolution =
    settings.resolution === "custom"
      ? { width: settings.customWidth, height: settings.customHeight }
      : ((H3_RESOLUTIONS as readonly string[]).includes(settings.resolution) ? settings.resolution : "480p") as H3Resolution;
  const canvas = info?.width && info.height ? h3CanvasSize(info.width, info.height, resolution) : typeof resolution === "object" ? [resolution.width, resolution.height] : null;
  const clips = partSeconds ? h3ClipCount(partSeconds, settings.clipSeconds) : 0;
  const activeLoras = settings.useLoras ? settings.loras.filter((lora) => lora.enabled !== false) : [];
  const speedLora = hasSpeedLora(activeLoras);
  const acceleration = speedLora ? "none" : settings.acceleration;
  const effectiveSeed = seed.trim() === "" ? plannedSeed : Number(seed);
  const seedValid = effectiveSeed !== null && Number.isInteger(effectiveSeed) && effectiveSeed >= 0 && effectiveSeed <= H3_MAX_SEED;
  const readiness = status?.ok ? status.readiness : undefined;
  const nodesReady = !!readiness && !readiness.missingNodes.length;
  const files = status?.ok ? status.files : undefined;
  const lorasValid = activeLoras.every((lora) => !!lora.name);
  const canMask = !busy && !!status?.ok && nodesReady && !!video && !info?.error;
  const canGenerate = canMask && !!picture && seedValid && lorasValid && !!settings.model;

  async function submit(kind: "swap" | "mask") {
    if (!video || (kind === "swap" && (!picture || effectiveSeed === null))) return;
    setBusy(kind);
    setError("");
    setStage(kind === "mask" ? "Uploading the video for a mask check…" : "Uploading the video and photo to ComfyUI…");
    try {
      const form = new FormData();
      form.set("id", crypto.randomUUID());
      form.set("kind", kind);
      form.set("video", video.blob, video.name);
      form.set("start", String(clip && clipMode === "trim" ? clip.start : 0));
      form.set("length", String(clip && clipMode === "trim" ? clip.end - clip.start : 0));
      if (sourceSeconds) form.set("source_seconds", String(sourceSeconds));
      if (info?.width) form.set("source_width", String(info.width));
      if (info?.height) form.set("source_height", String(info.height));
      form.set("hat_fix", String(settings.hatFix));
      form.set("margin", settings.margin);
      form.set("target", settings.target.trim() || H3_DEFAULT_TARGET);
      if (kind === "swap" && picture) {
        form.set("picture", picture.blob, picture.name);
        form.set("role", settings.role);
        form.set("resolution", typeof resolution === "object" ? `${resolution.width}x${resolution.height}` : resolution);
        form.set("motion", String(settings.motion));
        form.set("no_lip_sync", String(settings.noLipSync));
        form.set("seed", String(effectiveSeed));
        form.set("clip_seconds", String(settings.clipSeconds));
        form.set("steps", String(settings.steps));
        form.set("model", settings.model);
        form.set("describer", settings.describer);
        form.set("text_encoder", settings.textEncoder);
        form.set("video_vae", settings.videoVae);
        form.set("audio_vae", settings.audioVae);
        form.set("acceleration", acceleration);
        for (const lora of activeLoras) {
          form.append("lora", lora.name);
          form.append("lora_strength", String(lora.strength));
          form.append("lora_speed", String(lora.speed === true));
        }
      }
      await call<{ job: H3Job }>("/api/comfy/h3", comfyLink, { method: "POST", body: form });
      setStage(kind === "mask" ? "Mask check queued. It appears under Your generations." : "Queued on your GPU. The video appears under Your generations.");
      if (kind === "swap") {
        setSeed("");
        setPlannedSeed(randomSeed());
      }
      window.dispatchEvent(new Event("h3-submitted"));
    } catch (e) {
      setStage("");
      setError(e instanceof Error ? e.message : "The generation could not be submitted.");
    } finally {
      setBusy("");
    }
  }

  const statusDetails = status?.ok
    ? [
        status.gpu && `${status.gpu.replace(/^NVIDIA\s+(GeForce\s+)?/i, "")}${status.vramGB ? ` · ${status.vramGB} GB` : ""}`,
        status.queue && status.queue.running + status.queue.pending > 0 && `${status.queue.running + status.queue.pending} queued`,
      ].filter(Boolean)
    : [];

  return (
    <form className="generation-form" onSubmit={(event) => { event.preventDefault(); void submit("swap"); }}>
      <div className="h3-model-row">{modelPicker}</div>

      <div className="field comfy-connection">
        <div className="comfy-link-heading">
          <label htmlFor={linkId}>ComfyUI link</label>
          {readiness?.ready && (
            <small className="comfy-status-ok" role="status" title={status?.comfyVersion ? `ComfyUI ${status.comfyVersion}` : undefined}>
              ✓ H3 ready{statusDetails.length ? ` · ${statusDetails.join(" · ")}` : ""}
            </small>
          )}
        </div>
        <div className="comfy-connection-row">
          <input
            id={linkId}
            type="url"
            placeholder="Paste the link from rent-gpu"
            title="rent-gpu's ComfyUI link, or http://127.0.0.1:8188 through an SSH tunnel"
            autoComplete="off"
            spellCheck={false}
            value={draftLink}
            onChange={(event) => setDraftLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                connect();
              }
            }}
          />
          <Button type="button" secondary disabled={checking || !draftLink.trim()} onClick={connect}>
            {checking ? "Checking…" : draftLink.trim() === comfyLink && status ? "Check" : "Connect"}
          </Button>
        </div>
        {!readiness?.ready &&
          (checking && !status ? (
            <small role="status">Checking ComfyUI…</small>
          ) : !status ? (
            <small>Not connected.</small>
          ) : !status.ok ? (
            <small className="error" role="alert">{status.error || "ComfyUI could not be checked."}</small>
          ) : (
            <div className="error comfy-status-missing" role="alert">
              <span>Connected{statusDetails.length ? ` (${statusDetails.join(" · ")})` : ""}, but the H3 swap is not fully set up.</span>
              {!!readiness?.missingNodes.length && <span>Missing nodes — install the Openjutsu custom nodes and restart ComfyUI: {readiness.missingNodes.join(", ")}</span>}
              {!!readiness?.missingModels.length && <span>Default models missing (pick others under Advanced, or download them): {readiness.missingModels.join(", ")}</span>}
            </div>
          ))}
      </div>

      <div className="motion-input-grid">
        <div className="motion-image-input">
          <FilePicker label="Character photo" hint="Replaces the main person · PNG, JPEG or WebP" accept={IMAGE_TYPES} asset={picture} onPick={choosePicture} hideActions />
        </div>
        <div>
          <FilePicker
            label="Driving video"
            accept={VIDEO_TYPES}
            asset={video}
            onPick={chooseVideo}
            loadedContent={video && clip && canTrim ? <div ref={setPreviewHost} className="driving-preview-host" /> : undefined}
            hideActions
          />
        </div>
        {video && clip && canTrim && previewHost && (
          <VideoClipEditor
            key={video.id}
            asset={video}
            sourceSeconds={sourceSeconds}
            selection={clip}
            minimum={H3_MIN_SECTION}
            maximum={sourceSeconds}
            disabled={!!busy}
            compact
            previewContainer={previewHost}
            clipMode={clipMode}
            onClipModeChange={(mode) => {
              const selection = mode === "full" || !fullClip ? videoSelection(sourceSeconds, H3_MIN_SECTION, sourceSeconds) : clip;
              const next = { assetId: video.id, selection, mode };
              setClipDraft(next);
              writeInputs({ clip: next });
            }}
            onChange={(selection) => {
              if (clipMode === "full") return;
              const next = { assetId: video.id, selection, mode: "trim" as const };
              setClipDraft(next);
              writeInputs({ clip: next });
            }}
          />
        )}
      </div>
      {info?.error && <small className="error">{info.error}</small>}
      <TextField
        label="Who do they replace? (optional)"
        value={settings.role}
        maxLength={200}
        placeholder="e.g. the singer - red dress"
        onChange={(event) => update({ role: event.target.value })}
        hint="The character replaces the main person — the one who fills most of the frame. Everyone else stays. Name a role (“the singer”), not clothes; their look can go after “ - ”. Mirrors and reflections do not work yet."
      />

      <Choices
        className="h3-resolution-choices"
        label="Resolution"
        options={[...H3_RESOLUTIONS.map((value) => ({ value, label: value })), { value: "custom", label: "Custom" }]}
        value={settings.resolution === "custom" || (H3_RESOLUTIONS as readonly string[]).includes(settings.resolution) ? settings.resolution : "480p"}
        onChange={(value) => update({ resolution: value })}
      />
      {settings.resolution === "custom" ? (
        <div className="motion-model-row">
          {(["customWidth", "customHeight"] as const).map((side) => (
            <TextField
              key={side}
              label={side === "customWidth" ? "Width (px)" : "Height (px)"}
              type="number"
              min={H3_CUSTOM_SIZE.min}
              max={H3_CUSTOM_SIZE.max}
              step={H3_CUSTOM_SIZE.step}
              value={settings[side]}
              onChange={(event) => update({ [side]: Number(event.target.value) })}
              onBlur={(event) => {
                const value = Math.round(Number(event.target.value) / H3_CUSTOM_SIZE.step) * H3_CUSTOM_SIZE.step;
                update({ [side]: Math.min(H3_CUSTOM_SIZE.max, Math.max(H3_CUSTOM_SIZE.min, value || H3_CUSTOM_SIZE.min)) });
              }}
            />
          ))}
        </div>
      ) : null}
      <small>
        {settings.resolution === "custom"
          ? "The video is scaled and centre-cropped to this exact size."
          : canvas
            ? `${canvas[0]}×${canvas[1]} for this video. The shape follows the source; 1080p is about 2.5× slower than 736p and needs much more memory.`
            : "Short edge of the video. The shape follows the source."}
      </small>

      <TextField
        label="What to replace"
        value={settings.target}
        maxLength={100}
        placeholder={H3_DEFAULT_TARGET}
        onChange={(event) => update({ target: event.target.value })}
        hint="What SAM tracks, in English: person, cat, dog, or a short description such as “black and white cat”. The biggest match is replaced."
      />
      <div className="lora-checks">
        <label className="check">
          <input type="checkbox" checked={settings.hatFix} onChange={(event) => update({ hatFix: event.target.checked })} />
          <span>
            Hat fix
            <small>Also replaces hats (about 45 s more per clip).</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.noLipSync} onChange={(event) => update({ noLipSync: event.target.checked })} />
          <span>
            No lip-sync
            <small>For songs the person does not sing or talk along to, so the new person does not lip-sync them (about 30 s more per clip).</small>
          </span>
        </label>
      </div>
      <Choices
        className="resolution-choices"
        label="Mask margin"
        options={[
          { value: "tight", label: "Tight" },
          { value: "normal", label: "Normal" },
          { value: "loose", label: "Loose" },
        ]}
        value={settings.margin}
        onChange={(value) => update({ margin: value as H3Margin })}
      />
      <small>Room around the person for a differently built character. Check mask shows it.</small>

      <details className="prompt-override h3-advanced">
        <summary>Advanced</summary>
        <div className="generation-form">
          <label className="field">
            <span className="seed-row">
              Seed
              <button
                type="button"
                className="text-button"
                onClick={(event) => {
                  event.preventDefault();
                  setSeed("");
                  setPlannedSeed(randomSeed());
                }}
              >
                Randomize
              </button>
            </span>
            <input type="number" min={0} max={H3_MAX_SEED} step={1} value={seed} placeholder={plannedSeed === null ? "" : String(plannedSeed)} onChange={(event) => setSeed(event.target.value)} />
            <small>Change it for a new take. Leave empty to use the preview seed.</small>
          </label>
          <label className="field">
            <span className="seed-row">
              Clip length
              <small>{settings.clipSeconds.toFixed(1)} s per H3 generation</small>
            </span>
            <input
              type="range"
              min={H3_CLIP_SECONDS.min}
              max={H3_CLIP_SECONDS.max}
              step={0.5}
              value={settings.clipSeconds}
              onChange={(event) => update({ clipSeconds: Number(event.target.value) })}
            />
          </label>
          <Choices
            className="resolution-choices"
            label="Motion reference"
            options={H3_MOTION_SIZES.map((value) => ({ value: String(value), label: `${value} px` }))}
            value={String(settings.motion)}
            onChange={(value) => update({ motion: Number(value) as H3MotionSize })}
          />
          <small>Size of the grey figures H3 copies the motion from. Bigger follows the poses a bit more closely; sampling takes about a third longer at 768 px and about 2.4× as long at 1376 px.</small>
          <TextField
            label="Steps"
            type="number"
            min={H3_STEPS.min}
            max={H3_STEPS.max}
            value={settings.steps}
            onChange={(event) => update({ steps: Math.min(H3_STEPS.max, Math.max(H3_STEPS.min, Math.floor(Number(event.target.value) || H3_STEPS.min))) })}
            hint="6 with the DMAD speed LoRA; without a speed LoRA, 20 or more."
          />
          <Select label="Base model" searchable options={fileOptions(files?.models, settings.model)} value={settings.model} onChange={(value) => update({ model: value })} hint="The H3 diffusion model in models/diffusion_models." />
          <Select label="Visual describer" searchable options={fileOptions(files?.textEncoders, settings.describer)} value={settings.describer} onChange={(value) => update({ describer: value })} hint="Reads pictures and video frames to write prompts. A vision-language model in models/text_encoders." />
          <Select label="H3 text encoder" searchable options={fileOptions(files?.textEncoders, settings.textEncoder)} value={settings.textEncoder} onChange={(value) => update({ textEncoder: value })} hint="Your MiniMax H3 Qwen3-VL 32B quantization." />
          <div className="motion-model-row">
            <Select label="Video VAE" options={fileOptions(files?.vaes, settings.videoVae)} value={settings.videoVae} onChange={(value) => update({ videoVae: value })} />
            <Select label="Audio VAE" options={fileOptions(files?.vaes, settings.audioVae)} value={settings.audioVae} onChange={(value) => update({ audioVae: value })} />
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.useLoras} onChange={(event) => update({ useLoras: event.target.checked })} />
            <span>
              Use LoRAs
              <small>Turn off to use the base model alone. Without a speed LoRA, use 20 or more steps.</small>
            </span>
          </label>
          {settings.useLoras && (
            <div className="h3-loras">
              {settings.loras.map((lora, index) => {
                const change = (patch: Partial<H3Lora>) => update({ loras: settings.loras.map((item, k) => (k === index ? { ...item, ...patch } : item)) });
                return (
                  <div className="h3-lora" key={index}>
                    <div className="h3-lora-row">
                      <Select label={`LoRA ${index + 1}`} searchable options={fileOptions(files?.loras, lora.name)} value={lora.name} onChange={(name) => change({ name })} />
                      <TextField
                        label="Strength"
                        type="number"
                        min={H3_STRENGTH.min}
                        max={H3_STRENGTH.max}
                        step={0.05}
                        value={lora.strength}
                        onChange={(event) => change({ strength: Math.min(H3_STRENGTH.max, Math.max(H3_STRENGTH.min, Number(event.target.value) || 0)) })}
                      />
                      <button type="button" className="text-button" aria-label={`Remove LoRA ${index + 1}`} onClick={() => update({ loras: settings.loras.filter((_, k) => k !== index) })}>
                        Remove
                      </button>
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={lora.enabled !== false} onChange={(event) => change({ enabled: event.target.checked })} />
                      <span>{isSpeedLora(lora) ? "Use speed LoRA" : "Use this LoRA"}</span>
                    </label>
                    {!isSpeedLora({ ...lora, speed: false }) && (
                      <label className="check">
                        <input type="checkbox" checked={lora.speed === true} onChange={(event) => change({ speed: event.target.checked })} />
                        <span>
                          Speed LoRA
                          <small>Mark renamed or other few-step LoRAs here.</small>
                        </span>
                      </label>
                    )}
                  </div>
                );
              })}
              {settings.loras.length < H3_MAX_LORAS && (
                <button type="button" className="text-button" onClick={() => update({ loras: [...settings.loras, { name: files?.loras[0] ?? "", strength: 1 }] })}>
                  + Add LoRA
                </button>
              )}
            </div>
          )}
          <Select
            label="Acceleration"
            disabled={speedLora}
            options={[
              { value: "none", label: "Off" },
              { value: "spectrum", label: "Spectrum" },
            ]}
            value={acceleration}
            onChange={(value) => update({ acceleration: value as H3Acceleration })}
            hint={speedLora ? "Turn off the speed LoRA to use Spectrum." : "Spectrum skips some H3 evaluations and can change the result. Needs ComfyUI-Spectrum-MiniMax-H3; use 20 or more steps."}
          />
          <Button type="button" secondary onClick={() => update({ ...DEFAULTS, role: settings.role, target: settings.target })}>
            Restore default settings
          </Button>
        </div>
      </details>

      <div className="motion-submit-bar">
        <div className="motion-submit-inner h3-submit-row">
          <Button type="button" secondary disabled={!canMask} onClick={() => void submit("mask")}>
            {busy === "mask" ? "Uploading…" : "Check mask"}
          </Button>
          <Button disabled={!canGenerate}>
            {busy === "swap"
              ? "Uploading / submitting…"
              : !status?.ok
                ? "Generate — connect ComfyUI first"
                : !nodesReady
                  ? "Generate — H3 nodes not installed"
                  : !picture
                    ? "Generate — add a character photo"
                    : !video
                      ? "Generate — add a driving video"
                      : `Generate${partSeconds ? ` ${partSeconds.toFixed(1)}s` : ""}${clips ? ` · ${clips > 1 ? "about " : ""}${clips} clip${clips > 1 ? "s" : ""}` : ""}${canvas ? ` · ${canvas[0]}×${canvas[1]}` : ` · ${resolutionLabel(resolution)}`}`}
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
    </form>
  );
}

const LABELS: Record<H3Job["state"], string> = { submitting: "Submitting", queued: "Queued", running: "Rendering", success: "Ready", fail: "Failed" };

export function H3SwapHistory({
  comfyLink,
  favorites,
  archived,
  view,
  onToggleFavorite,
  onArchive,
  onJobFinished,
}: {
  comfyLink: string;
  favorites: string[];
  archived: string[];
  view: "all" | "favorites" | "archives";
  onToggleFavorite: (id: string) => void;
  onArchive: (id: string) => void;
  onJobFinished?: (job: H3Job) => void;
}) {
  const [jobs, setJobs] = useState<H3Job[] | null>(null),
    [error, setError] = useState(""),
    [warning, setWarning] = useState(""),
    [refresh, setRefresh] = useState(0),
    seen = useRef(new Map<string, H3Job["state"]>()),
    finished = useRef(onJobFinished);
  useEffect(() => {
    finished.current = onJobFinished;
  }, [onJobFinished]);
  useEffect(() => {
    const again = () => setRefresh((value) => value + 1);
    window.addEventListener("h3-submitted", again);
    return () => window.removeEventListener("h3-submitted", again);
  }, []);
  useEffect(() => {
    let active = true,
      busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const data = await call<{ jobs: H3Job[] }>("/api/comfy/h3", comfyLink);
        let note = "";
        const updated: H3Job[] = [];
        for (const job of data.jobs) {
          if (H3_PENDING.includes(job.state) && comfyLink) {
            try {
              const result = await call<{ job: H3Job; warning?: string }>(`/api/comfy/h3/${job.id}`, comfyLink);
              updated.push(result.job);
              if (result.warning) note = result.warning;
            } catch (e) {
              updated.push(job);
              note = e instanceof Error ? e.message : "Could not refresh status.";
            }
          } else updated.push(job);
        }
        if (!active) return;
        setJobs(updated);
        setError("");
        setWarning(note);
        for (const job of updated) {
          const before = seen.current.get(job.id);
          const done = job.state === "success" || job.state === "fail";
          if (done && before && !["success", "fail"].includes(before)) finished.current?.(job);
          seen.current.set(job.id, job.state);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load H3 generations.");
      } finally {
        busy = false;
      }
    }
    void load();
    const timer = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [comfyLink, refresh]);

  const visible = (jobs ?? []).filter((job) => {
    const isArchived = archived.includes(job.id);
    if (view === "archives") return isArchived;
    if (isArchived) return false;
    return view === "favorites" ? favorites.includes(job.id) : true;
  });
  return (
    <div className="motion-history">
      {jobs && !visible.length && (
        <div className="empty-history">
          {view === "favorites"
            ? "No favorite H3 videos yet. Use the star on a video to save it here."
            : view === "archives"
              ? "No archived H3 videos yet."
              : "No H3 videos yet. Connect your ComfyUI GPU, add a character photo and a driving video."}
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      {warning && visible.some((job) => H3_PENDING.includes(job.state)) && <div className="error" role="alert">{warning}</div>}
      <div className="job-list">
        {visible.map((job) => (
          <H3Card
            key={job.id}
            job={job}
            comfyLink={comfyLink}
            favorite={favorites.includes(job.id)}
            showArchive={view === "all"}
            showRestore={view === "archives"}
            onToggleFavorite={() => onToggleFavorite(job.id)}
            onArchive={() => onArchive(job.id)}
            onChange={() => setRefresh((value) => value + 1)}
          />
        ))}
      </div>
    </div>
  );
}

function H3Card({
  job,
  comfyLink,
  favorite,
  showArchive,
  showRestore,
  onToggleFavorite,
  onArchive,
  onChange,
}: {
  job: H3Job;
  comfyLink: string;
  favorite: boolean;
  showArchive: boolean;
  showRestore: boolean;
  onToggleFavorite: () => void;
  onArchive: () => void;
  onChange: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false),
    [cancelling, setCancelling] = useState(false),
    [cardError, setCardError] = useState("");
  const media = (which: string) => `/api/comfy/h3/${job.id}/media?which=${which}`;
  const pending = H3_PENDING.includes(job.state);
  const title = job.kind === "mask" ? "Mask check" : "H3 swap";
  async function cancel() {
    setCancelling(true);
    setCardError("");
    try {
      await call(`/api/comfy/h3/${job.id}`, comfyLink, { method: "POST" });
      onChange();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setCancelling(false);
    }
  }
  return (
    <article className="job-card">
      <div className="between">
        <div className="generation-title">
          <span className={`job-status ${job.state === "success" ? "completed" : job.state === "fail" ? "failed" : "processing"}`}>{LABELS[job.state]}</span>
          <strong>{(job.promptId || job.id).slice(0, 10)}</strong>
        </div>
        <GenerationTime created={job.created} />
        <div className="edit-card-meta">
          <div className="edit-card-lines">
            <small className="job-model-line">
              {title}
              {job.settings ? ` · ${resolutionLabel(job.settings.resolution)}` : ""}
              {job.clips ? ` · ${job.clips} clip${job.clips > 1 ? "s" : ""}` : ""} · <GenerationElapsed created={job.created} completedAt={pending ? undefined : job.completedAt ?? job.updated} />
            </small>
            <small className="real-label">Cost: GPU time</small>
          </div>
          <div className="job-card-tools">
            <button type="button" className="job-refresh-button" aria-label="Refresh status" title="Refresh status" onClick={onChange}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                <path d="M20 4v7h-7" />
              </svg>
            </button>
            <FavoriteButton active={favorite} onClick={onToggleFavorite} />
            {showArchive && <ArchiveButton onClick={onArchive} />}
            {showRestore && (
              <button type="button" className="text-button" onClick={onArchive}>
                Restore
              </button>
            )}
          </div>
        </div>
      </div>
      {pending && (
        <RenderPreview
          kind="video"
          image={job.pictureName ? media("picture") : undefined}
          state={job.state === "running" ? "generating" : job.state === "queued" ? "queuing" : "submitting"}
        />
      )}
      {job.state === "success" && job.hasOutput && (
        <div className="job-media h3-result">
          <video src={media("output")} controls playsInline preload="metadata" loop={job.kind === "mask"} />
        </div>
      )}
      <div className="job-meta-row">
        <button type="button" className="button secondary" onClick={() => setShowDetails(true)}>
          Show details
        </button>
      </div>
      {job.error && <p className="error">{job.error}</p>}
      {cardError && <p className="error" role="alert">{cardError}</p>}
      <div className="job-actions">
        {job.state === "success" && job.hasOutput ? (
          <a className="button" href={`${media("output")}&download=1`} download>
            Download video
          </a>
        ) : pending ? (
          <>
            <button type="button" className="button" disabled>
              Download video
            </button>
            <button type="button" className="text-button" disabled={cancelling || !job.promptId} onClick={() => void cancel()}>
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </>
        ) : null}
      </div>
      {showDetails && <H3Details job={job} media={media} onClose={() => setShowDetails(false)} />}
    </article>
  );
}

function formatTime(ms: number) {
  const date = new Date(ms);
  const day = date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  return `${day}, ${time} IST`;
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-button edit-details-copy"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// Everything that went into one H3 run: inputs, result, settings, model components and timing.
function H3Details({ job, media, onClose }: { job: H3Job; media: (which: string) => string; onClose: () => void }) {
  const finished = job.state === "success" || job.state === "fail" ? job.completedAt ?? job.updated : undefined;
  const stateClass = job.state === "success" ? "completed" : job.state === "fail" ? "failed" : "processing";
  const s = job.settings;
  const m = job.model;
  const part = job.section.length ? `${job.section.start.toFixed(1)}–${(job.section.start + job.section.length).toFixed(1)} s (${job.section.length.toFixed(1)} s)` : `Whole video${job.sourceSeconds ? ` (${job.sourceSeconds.toFixed(1)} s)` : ""}`;
  const canvas = s && job.sourceWidth && job.sourceHeight ? h3CanvasSize(job.sourceWidth, job.sourceHeight, s.resolution) : null;
  let server = job.server;
  try {
    server = new URL(job.server).host;
  } catch {
    // Keep the stored value.
  }
  const rows: [string, React.ReactNode][] = s
    ? [
        ["Resolution", `${resolutionLabel(s.resolution)}${canvas ? ` · ${canvas[0]}×${canvas[1]}` : ""}`],
        ["Part of video", part],
        ["Role", s.role || "Main person (described automatically)"],
        ["What to replace", s.target],
        ["Hat fix", s.hatFix ? "On" : "Off"],
        ["No lip-sync", s.noLipSync ? "On" : "Off"],
        ["Mask margin", s.margin],
        ["Seed", <span key="seed" className="edit-details-inline"><code>{s.seed}</code><CopyButton value={String(s.seed)} label="seed" /></span>],
        ["Clip length", `${s.clipSeconds.toFixed(1)} s${job.clips ? ` · ${job.clips} clip${job.clips > 1 ? "s" : ""} planned` : ""}`],
        ["Motion reference", `${s.motion} px`],
        ...(m
          ? ([
              ["Steps", String(m.steps)],
              ["Acceleration", m.acceleration === "spectrum" ? "Spectrum" : "Off"],
              [
                "Weights",
                <span key="weights" className="edit-details-files">
                  {[m.model, m.textEncoder, m.describer, m.videoVae, m.audioVae].filter(Boolean).map((file) => <code key={file}>{file}</code>)}
                </span>,
              ],
              [
                "LoRAs",
                m.loras.length ? (
                  <span key="loras" className="edit-details-files">
                    {m.loras.map((lora) => <code key={lora.name}>{`${lora.name} · ${lora.strength}`}</code>)}
                  </span>
                ) : (
                  "None"
                ),
              ],
            ] as [string, React.ReactNode][])
          : []),
      ]
    : [
        ["Part of video", part],
        ["What is tracked", job.mask?.target ?? "person"],
        ["Hat fix", job.mask?.hatFix ? "On" : "Off"],
        ["Mask margin", job.mask?.margin ?? "normal"],
      ];
  const timing: [string, React.ReactNode][] = [
    ["Started", formatTime(job.created)],
    ...(finished !== undefined
      ? ([
          [job.state === "fail" ? "Failed" : "Finished", formatTime(finished)],
          ["Duration", formatDuration(finished - job.created)],
        ] as [string, React.ReactNode][])
      : ([["Elapsed", <GenerationElapsed key="elapsed" created={job.created} />]] as [string, React.ReactNode][])),
    ["GPU server", server],
    ...(job.promptId ? ([["ComfyUI job", <span key="job" className="edit-details-inline"><code>{job.promptId}</code><CopyButton value={job.promptId} label="job ID" /></span>]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <Modal title="Generation details" closeLabel="Close" className="edit-details-modal" onClose={onClose}>
      <div className="edit-details">
        <div className="edit-details-summary">
          <span className={`job-status ${stateClass}`}>{LABELS[job.state]}</span>
          <strong>{job.kind === "mask" ? "MiniMax H3 · Mask check" : "MiniMax H3 · Simple motion transfer"}</strong>
          {s && <span>{resolutionLabel(s.resolution)}</span>}
        </div>
        <div className="edit-details-media h3-details-media">
          {job.pictureName && (
            <a href={media("picture")} target="_blank" rel="noreferrer" title="Open the character photo">
              <img src={media("picture")} alt="Character photo" />
              <span>Character photo</span>
            </a>
          )}
          <div>
            <video src={media("video")} controls muted playsInline preload="metadata" />
            <span>Driving video · {job.videoName}</span>
          </div>
          {job.state === "success" && job.hasOutput && (
            <div className="edit-details-result">
              <video src={media("output")} controls playsInline preload="metadata" />
              <span>Result</span>
            </div>
          )}
        </div>
        {job.error && (
          <section className="edit-details-section">
            <h3>Error</h3>
            <p className="error">{job.error}</p>
          </section>
        )}
        <div className="edit-details-columns">
          <section className="edit-details-section">
            <h3>Settings</h3>
            <dl className="edit-details-list">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="edit-details-section">
            <h3>Run</h3>
            <dl className="edit-details-list">
              {timing.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        {job.state === "success" && job.hasOutput && (
          <div className="image-viewer-actions">
            <a className="button" href={`${media("output")}&download=1`} download>
              Download video
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}
