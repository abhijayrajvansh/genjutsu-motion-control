"use client";
import { useEffect, useState } from "react";
import {
  H3_CHUNK_SECONDS,
  H3_DEFAULT_MODEL,
  H3_DEFAULT_PRESET,
  H3_DEFAULT_TONE,
  H3_DETAIL,
  H3_FACE_STYLES,
  H3_MAX_SEED,
  H3_MIN_SECTION,
  H3_TONE_MODES,
  H3_TONE_RANGES,
  H3FaceStyle,
  H3Job,
  H3ToneMode,
  H3TonePreset,
  H3ToneSettings,
  H3ToneValue,
  h3FaceChunkCount,
  hasSpeedLora,
  toneFromPreset,
} from "@/lib/h3-swap";
import { Asset, records } from "@/lib/storage";
import { VideoSelection, videoSelection } from "@/lib/video-selection";
import { Button, Choices, FilePicker, IMAGE_TYPES, Select, VIDEO_TYPES } from "./controls";
import { H3LinkField, H3ModelFieldSettings, H3ModelFields, call, randomSeed, useH3Status, useVideoInfo } from "./h3-swap";
import { VideoClipEditor } from "./video-clip-editor";

// Post-processing for a finished video, from Openjutsu: Fix faces (H3 redraws one person's face in chunks and pastes it
// back) and Fix colours (detail contrast and Orion4D's tone mapper; no H3 run).

const MODE_KEY = "clone.post.mode";
const SETTINGS_KEY = "clone.post.settings";
const INPUTS_KEY = "clone.post.inputs";

type PostMode = "face" | "color";
type Settings = H3ModelFieldSettings & {
  style: H3FaceStyle;
  chunkSeconds: number;
  detailOn: boolean;
  detail: number;
  toneOn: boolean;
  tone: H3ToneSettings;
  tonePreset: string; // "" once the values are changed by hand
};
const DEFAULTS: Settings = {
  style: "photo",
  chunkSeconds: H3_CHUNK_SECONDS.default,
  steps: H3_DEFAULT_MODEL.steps,
  model: H3_DEFAULT_MODEL.model,
  describer: H3_DEFAULT_MODEL.describer,
  textEncoder: H3_DEFAULT_MODEL.textEncoder,
  videoVae: H3_DEFAULT_MODEL.videoVae,
  audioVae: H3_DEFAULT_MODEL.audioVae,
  useLoras: true,
  loras: H3_DEFAULT_MODEL.loras,
  acceleration: "none",
  detailOn: true,
  detail: H3_DETAIL.default,
  toneOn: true,
  tone: H3_DEFAULT_TONE,
  tonePreset: H3_DEFAULT_PRESET,
};

const FACE_STYLE_TEXT: Record<H3FaceStyle, { label: string; hint: string }> = {
  photo: { label: "Match the photo", hint: "The face is redrawn from the photo: the closest likeness, but H3 makes up its own expressions and mouth movements." },
  mouth: { label: "Follow the mouth", hint: "The face follows the video's expressions and mouth movements; a little less like the photo." },
};

function readJson<T extends object>(key: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" ? { ...fallback, ...(parsed as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage is unavailable; values stay for this visit only.
  }
}

type SavedInputs = { videoId?: string | null; pictureId?: string | null; clip?: { assetId: string; selection: VideoSelection; mode: "full" | "trim" } | null };

export function H3PostForm({ comfyLink, onComfyLink }: { comfyLink: string; onComfyLink: (value: string) => void }) {
  const [mode, setModeState] = useState<PostMode>("face"),
    [settings, setSettings] = useState<Settings>(DEFAULTS),
    [inputs, setInputs] = useState<SavedInputs>({}),
    [video, setVideo] = useState<Asset | null>(null),
    [picture, setPicture] = useState<Asset | null>(null),
    [previewHost, setPreviewHost] = useState<HTMLDivElement | null>(null),
    [seed, setSeed] = useState(""),
    [plannedSeed, setPlannedSeed] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stage, setStage] = useState(""),
    [presetsApplied, setPresetsApplied] = useState(false),
    { status, checking, check } = useH3Status(comfyLink, true);

  useEffect(() => {
    // Hydrate saved choices, the seed preview and picked files after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(localStorage.getItem(MODE_KEY) === "color" ? "color" : "face");
    const saved = readJson(SETTINGS_KEY, DEFAULTS);
    if (!H3_FACE_STYLES.includes(saved.style)) saved.style = DEFAULTS.style;
    if (!saved.tone || !H3_TONE_MODES.includes(saved.tone.mode)) saved.tone = DEFAULTS.tone;
    setSettings(saved);
    setPlannedSeed(randomSeed());
    const savedInputs = readJson<SavedInputs>(INPUTS_KEY, {});
    setInputs(savedInputs);
    let live = true;
    records<Asset>("assets")
      .then((assets) => {
        if (!live) return;
        const byId = new Map(assets.map((asset) => [asset.id, asset]));
        setVideo(savedInputs.videoId ? byId.get(savedInputs.videoId) ?? null : null);
        setPicture(savedInputs.pictureId ? byId.get(savedInputs.pictureId) ?? null : null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  function setMode(value: PostMode) {
    setModeState(value);
    try {
      localStorage.setItem(MODE_KEY, value);
    } catch {
      // Keep the choice for this visit only.
    }
    setError("");
    setStage("");
  }
  function update(patch: Partial<Settings>) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      writeJson(SETTINGS_KEY, next);
      return next;
    });
  }
  function patchInputs(patch: SavedInputs) {
    setInputs((current) => {
      const next = { ...current, ...patch };
      writeJson(INPUTS_KEY, next);
      return next;
    });
  }
  function chooseVideo(asset: Asset | null) {
    setVideo(asset);
    patchInputs({ videoId: asset?.id ?? null, clip: null });
  }
  function choosePicture(asset: Asset | null) {
    setPicture(asset);
    patchInputs({ pictureId: asset?.id ?? null });
  }

  // Orion's saved presets, with the built-in H3 soft first when Orion does not have it.
  const presets: H3TonePreset[] = status?.presets ?? [];
  const presetOptions: H3TonePreset[] = presets.some((p) => p.name === H3_DEFAULT_PRESET)
    ? presets
    : [{ name: H3_DEFAULT_PRESET, settings: H3_DEFAULT_TONE as unknown as Record<string, unknown> }, ...presets];
  const loadedPresets = status?.presets;
  useEffect(() => {
    // Orion's own copy of the chosen preset wins over the saved values once it has loaded.
    if (presetsApplied || !loadedPresets?.length) return;
    const saved = loadedPresets.find((p) => p.name === settings.tonePreset);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresetsApplied(true);
    if (saved)
      setSettings((current) => {
        const next = { ...current, tone: toneFromPreset(saved.settings) };
        writeJson(SETTINGS_KEY, next);
        return next;
      });
  }, [loadedPresets, presetsApplied, settings.tonePreset]);
  function choosePreset(name: string) {
    const preset = presetOptions.find((p) => p.name === name);
    if (preset) update({ tonePreset: name, tone: toneFromPreset(preset.settings) });
  }
  function changeTone(patch: Partial<H3ToneSettings>) {
    update({ tone: { ...settings.tone, ...patch }, tonePreset: "" });
  }

  const info = useVideoInfo(video);
  const sourceSeconds = info?.seconds ?? 0;
  const canTrim = sourceSeconds > H3_MIN_SECTION;
  const fullClip = canTrim ? videoSelection(sourceSeconds, H3_MIN_SECTION, sourceSeconds) : null;
  const savedClip = inputs.clip && video && inputs.clip.assetId === video.id ? inputs.clip : null;
  const clipMode: "full" | "trim" = savedClip?.mode ?? "full";
  const clip = fullClip ? videoSelection(sourceSeconds, H3_MIN_SECTION, sourceSeconds, clipMode === "trim" ? savedClip?.selection : undefined) : null;
  const partSeconds = clip && clipMode === "trim" ? clip.end - clip.start : sourceSeconds;

  const readiness = status?.ok ? (mode === "face" ? status.face : status.color) : undefined;
  const effectiveSeed = seed.trim() === "" ? plannedSeed : Number(seed);
  const seedValid = effectiveSeed !== null && Number.isInteger(effectiveSeed) && effectiveSeed >= 0 && effectiveSeed <= H3_MAX_SEED;
  const activeLoras = settings.useLoras ? settings.loras.filter((lora) => lora.enabled !== false) : [];
  const acceleration = hasSpeedLora(activeLoras) ? "none" : settings.acceleration;
  const chunks = partSeconds ? h3FaceChunkCount(partSeconds, settings.chunkSeconds) : 0;
  const colorOn = settings.detailOn || settings.toneOn;
  const canSubmit =
    !busy &&
    !!readiness?.ready &&
    !!video &&
    !info?.error &&
    (mode === "face" ? !!picture && seedValid && activeLoras.every((lora) => !!lora.name) && !!settings.model : colorOn);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !video) return;
    setBusy(true);
    setError("");
    setStage("Uploading the video to ComfyUI…");
    try {
      const form = new FormData();
      form.set("id", crypto.randomUUID());
      form.set("kind", mode);
      form.set("video", video.blob, video.name);
      form.set("start", String(clip && clipMode === "trim" ? clip.start : 0));
      form.set("length", String(clip && clipMode === "trim" ? clip.end - clip.start : 0));
      if (sourceSeconds) form.set("source_seconds", String(sourceSeconds));
      if (info?.width) form.set("source_width", String(info.width));
      if (info?.height) form.set("source_height", String(info.height));
      if (mode === "face" && picture) {
        form.set("picture", picture.blob, picture.name);
        form.set("style", settings.style);
        form.set("seed", String(effectiveSeed));
        form.set("chunk_seconds", String(settings.chunkSeconds));
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
      } else {
        if (settings.detailOn) form.set("detail", String(settings.detail));
        if (settings.toneOn) {
          form.set("tone_mode", settings.tone.mode);
          for (const key of Object.keys(H3_TONE_RANGES) as H3ToneValue[]) form.set(`tone_${key}`, String(settings.tone[key]));
          if (settings.tonePreset) form.set("preset", settings.tonePreset);
        }
      }
      await call<{ job: H3Job }>("/api/comfy/h3", comfyLink, { method: "POST", body: form });
      setStage("Queued on your GPU. The video appears under Your generations.");
      if (mode === "face") {
        setSeed("");
        setPlannedSeed(randomSeed());
      }
      window.dispatchEvent(new Event("h3-submitted"));
    } catch (e) {
      setStage("");
      setError(e instanceof Error ? e.message : "The video could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="generation-form" onSubmit={submit}>
      <Choices
        label="Post-processing"
        options={[
          { value: "face", label: "Fix faces", hint: "Redraw one person's face from their photo." },
          { value: "color", label: "Fix colours", hint: "Soften detail and grade the colours. No H3 run." },
        ]}
        value={mode}
        onChange={(value) => setMode(value === "color" ? "color" : "face")}
      />
      <H3LinkField
        comfyLink={comfyLink}
        onComfyLink={onComfyLink}
        status={status}
        checking={checking}
        check={check}
        readiness={readiness}
        what={mode === "face" ? "Fix faces" : "Fix colours"}
      />

      <div className="motion-input-grid">
        <div>
          <FilePicker
            label="Video to fix"
            accept={VIDEO_TYPES}
            asset={video}
            onPick={chooseVideo}
            loadedContent={video && clip && canTrim ? <div ref={setPreviewHost} className="driving-preview-host" /> : undefined}
            hideActions
          />
        </div>
        {mode === "face" && (
          <div className="motion-image-input">
            <FilePicker label="Photo of the person" hint="Use the photo the video was made with" accept={IMAGE_TYPES} asset={picture} onPick={choosePicture} hideActions />
          </div>
        )}
        {video && clip && canTrim && previewHost && (
          <VideoClipEditor
            key={video.id}
            asset={video}
            sourceSeconds={sourceSeconds}
            selection={clip}
            minimum={H3_MIN_SECTION}
            maximum={sourceSeconds}
            disabled={busy}
            compact
            previewContainer={previewHost}
            clipMode={clipMode}
            onClipModeChange={(next) => {
              const selection = next === "full" || !fullClip ? videoSelection(sourceSeconds, H3_MIN_SECTION, sourceSeconds) : clip;
              patchInputs({ clip: { assetId: video.id, selection, mode: next } });
            }}
            onChange={(selection) => {
              if (clipMode === "full") return;
              patchInputs({ clip: { assetId: video.id, selection, mode: "trim" } });
            }}
          />
        )}
      </div>
      {info?.error && <small className="error">{info.error}</small>}

      {mode === "face" ? (
        <>
          <Choices
            label="Style"
            options={H3_FACE_STYLES.map((value) => ({ value, label: FACE_STYLE_TEXT[value].label }))}
            value={settings.style}
            onChange={(value) => update({ style: value === "mouth" ? "mouth" : "photo" })}
          />
          <small>
            {FACE_STYLE_TEXT[settings.style].hint} Use the photo the video was made with. Only that person&apos;s face changes; faces taller than a fifth of the frame are already
            sharp and are left alone.
          </small>
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
                  Chunk length
                  <small>{settings.chunkSeconds.toFixed(1)} s of face per H3 generation</small>
                </span>
                <input
                  type="range"
                  min={H3_CHUNK_SECONDS.min}
                  max={H3_CHUNK_SECONDS.max}
                  step={0.5}
                  value={settings.chunkSeconds}
                  onChange={(event) => update({ chunkSeconds: Number(event.target.value) })}
                />
                <small>Chunks overlap by 1 s and are crossfaded.</small>
              </label>
              <H3ModelFields settings={settings} update={update} files={status?.ok ? status.files : undefined} />
              <Button type="button" secondary onClick={() => update({ ...DEFAULTS, detailOn: settings.detailOn, detail: settings.detail, toneOn: settings.toneOn, tone: settings.tone, tonePreset: settings.tonePreset })}>
                Restore default settings
              </Button>
            </div>
          </details>
        </>
      ) : (
        <>
          <div className="lora-checks h3-post-checks">
            <label className="check">
              <input type="checkbox" checked={settings.detailOn} onChange={(event) => update({ detailOn: event.target.checked })} />
              <span>
                Detail contrast
                <small>Softens H3&apos;s crunchy fine detail and over-sharpened skin, without blurring edges.</small>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.toneOn} onChange={(event) => update({ toneOn: event.target.checked })} />
              <span>
                Tone mapper
                <small>Orion4D DCTL Tone Mapper, a colour grade over every frame. {H3_DEFAULT_PRESET} softens contrast and highlights and keeps the blacks deep.</small>
              </span>
            </label>
          </div>
          {settings.detailOn && (
            <label className="field">
              <span className="seed-row">
                Detail contrast amount
                <small>{settings.detail.toFixed(2)}: below 0 softens, above 0 sharpens</small>
              </span>
              <input type="range" min={H3_DETAIL.min} max={H3_DETAIL.max} step={0.01} value={settings.detail} onChange={(event) => update({ detail: Number(event.target.value) })} />
            </label>
          )}
          {settings.toneOn && (
            <>
              <Select
                label="Tone mapper preset"
                options={[...(settings.tonePreset ? [] : [{ value: "", label: "Custom" }]), ...presetOptions.map((p) => ({ value: p.name, label: p.name }))]}
                value={settings.tonePreset}
                onChange={choosePreset}
                hint="Orion's saved presets. Change the values below to make your own; pick the preset again to undo."
              />
              <Choices
                className="h3-resolution-choices"
                label="Tone mapper mode"
                options={H3_TONE_MODES.map((value) => ({ value, label: value }))}
                value={settings.tone.mode}
                onChange={(value) => changeTone({ mode: value as H3ToneMode })}
              />
              <div className="h3-tone-grid">
                {(Object.keys(H3_TONE_RANGES) as H3ToneValue[]).map((key) => (
                  <label className="field" key={key}>
                    <span className="seed-row">
                      {H3_TONE_RANGES[key].label}
                      <small>{settings.tone[key].toFixed(2)}</small>
                    </span>
                    <input
                      type="range"
                      min={H3_TONE_RANGES[key].min}
                      max={H3_TONE_RANGES[key].max}
                      step={H3_TONE_RANGES[key].step}
                      value={settings.tone[key]}
                      onChange={(event) => changeTone({ [key]: Number(event.target.value) })}
                    />
                  </label>
                ))}
              </div>
              <small>Strength mixes the grade with the original: 0.2 is 20% of it.</small>
            </>
          )}
          <small>No H3 run: the video is only filtered, so it keeps its frames and soundtrack. Detail contrast runs first, then the tone mapper.</small>
        </>
      )}

      <div className="motion-submit-bar">
        <div className="motion-submit-inner">
          <Button disabled={!canSubmit}>
            {busy
              ? "Uploading / submitting…"
              : !status?.ok
                ? `${mode === "face" ? "Fix faces" : "Fix colours"} — connect ComfyUI first`
                : !readiness?.ready
                  ? `${mode === "face" ? "Fix faces" : "Fix colours"} — not set up on this GPU`
                  : !video
                    ? `${mode === "face" ? "Fix faces" : "Fix colours"} — add a video`
                    : mode === "face"
                      ? !picture
                        ? "Fix faces — add the person's photo"
                        : `Fix faces${partSeconds ? ` · ${partSeconds.toFixed(1)}s` : ""}${chunks ? ` · up to ${chunks} chunk${chunks > 1 ? "s" : ""}` : ""}`
                      : !colorOn
                        ? "Fix colours — turn on a step"
                        : `Fix colours${partSeconds ? ` · ${partSeconds.toFixed(1)}s of video` : ""}`}
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
