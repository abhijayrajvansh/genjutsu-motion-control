"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ComfyStatus,
  IMAGE_EDIT_MAX_IMAGES,
  IMAGE_EDIT_MAX_MB,
  IMAGE_EDIT_MAX_SEED,
  canvasSize,
  IMAGE_EDIT_MODELS,
  IMAGE_EDIT_SIZES,
  ImageEditJob,
  ImageEditModel,
  ImageEditQuality,
  ImageEditResolution,
  ImageEditSize,
  isImageEditModel,
  isImageEditQuality,
  isImageEditSize,
  QWEN21_FILES,
  QWEN_EDIT_FILES,
} from "@/lib/image-edit";
import { Asset, records, saveRecord } from "@/lib/storage";
import savedPrompts from "@/prompts/edit-image-prompts.json";
import { Button, Choices, FilePicker, IMAGE_TYPES, Modal, Prompt, Select, useSaved } from "./controls";
import { GenerationElapsed, GenerationTime } from "./generation-time";
import { ArchiveButton, FavoriteButton } from "./favorite-button";
import { RenderPreview } from "./render-preview";

export const COMFY_LINK_KEY = "clone.comfy.url";
// Saved prompts from prompts/edit-image-prompts.json; {image1}… become the model's own image names.
const PROMPT_PRESETS = (savedPrompts as { label?: unknown; prompt?: unknown }[]).filter(
  (item): item is { label: string; prompt: string } => typeof item.label === "string" && typeof item.prompt === "string",
);
function fillPrompt(prompt: string, imageName: (n: number) => string) {
  return prompt.replace(/\{image(\d+)\}/g, (_, n: string) => imageName(Number(n)));
}
const pending: ImageEditJob["state"][] = ["submitting", "queued", "running"];
const DEFAULT_PROMPT =
  "Keep the person's face, identity, skin texture and the camera angle exactly the same. Change only: ";

// Picked images live in the browser's IndexedDB asset library; their IDs are kept here.
const EDIT_INPUTS_KEY = "clone.edit.inputs";
type SavedEditInputs = { imageId?: string | null; referenceIds?: (string | null)[] };
function readEditInputs(): SavedEditInputs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EDIT_INPUTS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as SavedEditInputs) : {};
  } catch {
    return {};
  }
}
function writeEditInputs(patch: SavedEditInputs) {
  try {
    localStorage.setItem(EDIT_INPUTS_KEY, JSON.stringify({ ...readEditInputs(), ...patch }));
  } catch {
    // Browser storage is unavailable; inputs simply won't survive a reload.
  }
}

function randomSeed() {
  return Math.floor(Math.random() * IMAGE_EDIT_MAX_SEED);
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

export function ImageEditForm({
  comfyLink,
  onComfyLink,
  initialImage,
}: {
  comfyLink: string;
  onComfyLink: (value: string) => void;
  initialImage?: Asset | null;
}) {
  const [image, setImage] = useState<Asset | null>(initialImage ?? null),
    [references, setReferences] = useState<(Asset | null)[]>([]),
    [prompt, setPrompt] = useSaved("clone.edit.prompt", DEFAULT_PROMPT),
    [savedModel, setModel] = useSaved("clone.edit.model", "qwen-edit-2511"),
    model: ImageEditModel = isImageEditModel(savedModel) ? savedModel : "qwen-edit-2511",
    settings = IMAGE_EDIT_MODELS[model],
    [savedQuality, setQuality] = useSaved("clone.edit.quality", "balanced"),
    quality: ImageEditQuality = isImageEditQuality(savedQuality) ? savedQuality : "balanced",
    [savedConsistency, setConsistency] = useSaved("clone.edit.consistency", "false"),
    consistency = model === "qwen-image-2.1" && savedConsistency === "true",
    [savedResolution, setResolution] = useSaved("clone.edit.resolution", "1024"),
    resolution: ImageEditResolution = settings.resolutions.includes(Number(savedResolution) as ImageEditResolution)
      ? (Number(savedResolution) as ImageEditResolution)
      : 1024,
    [savedSize, setSize] = useSaved("clone.edit.size", "auto"),
    size: ImageEditSize = isImageEditSize(savedSize) ? savedSize : "auto",
    [seed, setSeed] = useState(""),
    [plannedSeed, setPlannedSeed] = useState<number | null>(null),
    [status, setStatus] = useState<ComfyStatus | null>(null),
    [checking, setChecking] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stage, setStage] = useState(""),
    [draftLink, setDraftLink] = useState(comfyLink),
    linkId = useId();

  useEffect(() => {
    let live = true;
    async function restore() {
      try {
        if (initialImage) {
          // "Edit this result" passes an in-memory image; store it so it survives a reload.
          await saveRecord("assets", initialImage);
          writeEditInputs({ imageId: initialImage.id, referenceIds: [] });
          return;
        }
        const saved = readEditInputs();
        if (!saved.imageId && !saved.referenceIds?.length) return;
        const byId = new Map((await records<Asset>("assets")).map((asset) => [asset.id, asset]));
        if (!live) return;
        setImage(saved.imageId ? byId.get(saved.imageId) ?? null : null);
        setReferences((saved.referenceIds ?? []).map((id) => (id ? byId.get(id) ?? null : null)));
      } catch {
        // Browser storage is unavailable; start with empty inputs.
      }
    }
    void restore();
    return () => {
      live = false;
    };
  }, [initialImage]);
  function chooseImage(asset: Asset | null) {
    setImage(asset);
    writeEditInputs({ imageId: asset?.id ?? null });
  }
  function changeReferences(update: (list: (Asset | null)[]) => (Asset | null)[]) {
    setReferences((list) => {
      const next = update(list);
      writeEditInputs({ referenceIds: next.map((asset) => asset?.id ?? null) });
      return next;
    });
  }
  useEffect(() => {
    // A random seed is chosen after hydration so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlannedSeed(randomSeed());
  }, []);
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
      const response = await fetch("/api/comfy/status", { headers: comfyHeaders(link), cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { status?: ComfyStatus; error?: string };
      setStatus(data.status ?? { ok: false, error: data.error || "ComfyUI could not be checked." });
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    // Check the saved ComfyUI link when the tab loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check(comfyLink);
  }, [comfyLink, check]);

  function connect(event?: React.FormEvent) {
    event?.preventDefault();
    const link = draftLink.trim();
    onComfyLink(link);
    void check(link);
  }

  const readiness = status?.ok ? status.models?.[model] : undefined;
  const fastMissing = !!readiness?.ready && !readiness.fast;
  const preset = settings.quality[quality];
  const effectiveSeed = seed.trim() === "" ? plannedSeed : Number(seed);
  const seedValid = effectiveSeed !== null && Number.isInteger(effectiveSeed) && effectiveSeed >= 0 && effectiveSeed <= IMAGE_EDIT_MAX_SEED;
  const pictures = [image, ...references].filter((asset): asset is Asset => !!asset);
  const loraMissing = model === "qwen-image-2.1" && !!readiness?.ready && !readiness.consistency;
  const consistencyMissing = consistency && loraMissing;
  const canSubmit =
    !busy && !!readiness?.ready && !!image && !!prompt.trim() && seedValid && !(quality === "fast" && fastMissing) && !consistencyMissing;
  const imageName = (n: number) => (model === "qwen-image-2.1" ? `<image${n}>` : `image ${n}`);
  const selectedPreset = PROMPT_PRESETS.findIndex((preset) => fillPrompt(preset.prompt, imageName) === prompt);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || effectiveSeed === null) return;
    setBusy(true);
    setError("");
    setStage("Uploading images to ComfyUI…");
    try {
      const form = new FormData();
      form.set("id", crypto.randomUUID());
      form.set("model", model);
      form.set("prompt", prompt.trim());
      form.set("quality", quality);
      form.set("consistency", consistency ? "true" : "false");
      form.set("resolution", String(resolution));
      form.set("size", size);
      form.set("seed", String(effectiveSeed));
      for (const asset of pictures) form.append("images", asset.blob, asset.name);
      await call<{ job: ImageEditJob }>("/api/comfy/edit", comfyLink, { method: "POST", body: form });
      setStage("Queued on your GPU. The result appears under Your generations.");
      setSeed("");
      setPlannedSeed(randomSeed());
      window.dispatchEvent(new Event("image-edit-submitted"));
    } catch (e) {
      setStage("");
      setError(e instanceof Error ? e.message : "The edit could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="generation-form" onSubmit={submit}>
      <div className="field comfy-connection">
        <label htmlFor={linkId}>ComfyUI link</label>
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
              if (event.key === "Enter") connect(event);
            }}
          />
          <Button type="button" secondary disabled={checking || !draftLink.trim()} onClick={() => connect()}>
            {checking ? "Checking…" : draftLink.trim() === comfyLink && status ? "Check" : "Connect"}
          </Button>
        </div>
        <ComfyStatusLine status={status} checking={checking} model={model} />
      </div>
      <Select
        label="Model"
        options={(Object.keys(IMAGE_EDIT_MODELS) as ImageEditModel[]).map((value) => ({
          value,
          label: IMAGE_EDIT_MODELS[value].label + (status?.ok && !status.models?.[value].ready ? " · not installed" : ""),
        }))}
        value={model}
        onChange={setModel}
        hint={settings.hint}
      />
      <div className={`motion-image-input edit-image-inputs${references.length > 0 ? " is-paired" : ""}`}>
        <FilePicker label="Image to edit" hint={`${imageName(1)} · up to ${IMAGE_EDIT_MAX_MB} MB`} accept={IMAGE_TYPES} asset={image} onPick={chooseImage} />
        {references.map((asset, index) => (
          <div key={index}>
            <FilePicker
              label={`Reference image ${index + 2}`}
              hint={`${imageName(index + 2)} · optional`}
              accept={IMAGE_TYPES}
              asset={asset}
              onPick={(value) => changeReferences((list) => list.map((item, k) => (k === index ? value : item)))}
            />
            <button type="button" className="text-button" onClick={() => changeReferences((list) => list.filter((_, k) => k !== index))}>
              Remove reference
            </button>
          </div>
        ))}
        {references.length < IMAGE_EDIT_MAX_IMAGES - 1 && (
          <button type="button" className="text-button" onClick={() => changeReferences((list) => [...list, null])}>
            + Add a reference image (outfit, product, background…)
          </button>
        )}
      </div>
      {PROMPT_PRESETS.length > 0 && (
        <Select
          label="Saved prompts"
          options={[
            { value: "", label: "Choose a saved prompt…" },
            ...PROMPT_PRESETS.map((preset, index) => ({ value: String(index), label: preset.label })),
          ]}
          value={selectedPreset < 0 ? "" : String(selectedPreset)}
          onChange={(value) => {
            const preset = PROMPT_PRESETS[Number(value)];
            if (value !== "" && preset) setPrompt(fillPrompt(preset.prompt, imageName));
          }}
          hint="Replaces the prompt below. Edit the list in prompts/edit-image-prompts.json."
        />
      )}
      <Prompt
        value={prompt}
        onChange={setPrompt}
        onUseDefault={() => setPrompt(DEFAULT_PROMPT)}
        hint={`Describe only what should change, and what must stay the same. Refer to pictures as ${imageName(1)}, ${imageName(2)}… — e.g. “Put the jacket from ${imageName(2)} on the woman in ${imageName(1)}.”`}
      />
      <div className="motion-model-row">
        <Select
          label="Output size"
          options={(Object.keys(IMAGE_EDIT_SIZES) as ImageEditSize[]).map((value) => {
            const pixels = canvasSize(value, model, resolution);
            return {
              value,
              label: value === "auto" ? "Match input image" : `${IMAGE_EDIT_SIZES[value].label} · ${pixels.width}×${pixels.height}`,
            };
          })}
          value={size}
          onChange={setSize}
        />
        {settings.resolutions.length > 1 && (
          <Select
            label="Resolution"
            options={settings.resolutions.map((value) => ({ value: String(value), label: value === 2048 ? "2K · slower" : "1K" }))}
            value={String(resolution)}
            onChange={setResolution}
          />
        )}
      </div>
      {size !== "auto" && <small>A different shape than image 1 makes the model extend or reframe the scene.</small>}
      <Choices
        label="Quality"
        options={(Object.keys(settings.quality) as ImageEditQuality[]).map((value) => ({
          value,
          label: settings.quality[value].label,
          hint:
            value === "fast" && fastMissing
              ? `${model === "qwen-image-2.1" ? "Turbo model" : "Lightning LoRA"} is not installed on this GPU.`
              : settings.quality[value].hint,
          disabled: value === "fast" && fastMissing,
        }))}
        value={quality}
        onChange={setQuality}
      />
      {model === "qwen-image-2.1" && (
        <label className="check">
          <input
            type="checkbox"
            checked={consistency}
            onChange={(event) => setConsistency(event.target.checked ? "true" : "false")}
          />
          <span>
            Use consistency LoRA
            <small>
              {loraMissing
                ? "Not installed on this GPU. Run setup-qwen-edit-vast.sh --model 2.1, then Check."
                : "Keeps the face, pose and frame still. Uncheck to skip it."}
            </small>
          </span>
        </label>
      )}
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
        <input
          type="number"
          min={0}
          max={IMAGE_EDIT_MAX_SEED}
          step={1}
          value={seed}
          placeholder={plannedSeed === null ? "" : String(plannedSeed)}
          onChange={(event) => setSeed(event.target.value)}
        />
        <small>Same image, prompt and seed give the same result. Change the seed for a different variation.</small>
      </label>
      <div className="motion-submit-bar">
        <div className="motion-submit-inner">
          <Button disabled={!canSubmit}>
            {busy
              ? "Uploading / submitting…"
              : !status?.ok
                ? "Edit image — connect ComfyUI first"
                : !readiness?.ready
                  ? `Edit image — ${settings.label} not installed`
                  : !image
                    ? "Edit image — add an image"
                    : consistencyMissing
                    ? "Edit image — consistency LoRA not installed"
                    : `Edit image — ${preset.label}`}
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

function ComfyStatusLine({ status, checking, model }: { status: ComfyStatus | null; checking: boolean; model: ImageEditModel }) {
  if (checking && !status) return <small role="status">Checking ComfyUI…</small>;
  if (!status) return <small>Not connected.</small>;
  if (status.error || !status.ok) return <small className="error" role="alert">{status.error || "ComfyUI could not be checked."}</small>;
  const queued = status.queue ? status.queue.running + status.queue.pending : 0;
  const details = [
    status.gpu && `${status.gpu.replace(/^NVIDIA\s+(GeForce\s+)?/i, "")}${status.vramGB ? ` · ${status.vramGB} GB` : ""}`,
    queued > 0 && `${queued} queued`,
  ].filter(Boolean);
  const readiness = status.models?.[model];
  if (readiness?.ready)
    return (
      <small className="comfy-status-ok" role="status" title={status.comfyVersion ? `ComfyUI ${status.comfyVersion}` : undefined}>
        ✓ Ready{details.length ? ` · ${details.join(" · ")}` : ""}
        {!readiness.fast && " · no Fast mode"}
      </small>
    );
  return (
    <div className="error comfy-status-missing" role="alert">
      <span>Connected{details.length ? ` (${details.join(" · ")})` : ""}, but {IMAGE_EDIT_MODELS[model].label} is not set up.</span>
      {!!readiness?.missingNodes.length && <span>Update ComfyUI — missing nodes: {readiness.missingNodes.join(", ")}</span>}
      {!!readiness?.missingModels.length && (
        <span>
          Models missing — run <code>setup-qwen-edit-vast.sh --model {model === "qwen-image-2.1" ? "2.1" : "2511"}</code> on the GPU.
        </span>
      )}
    </div>
  );
}

export function ImageEditHistory({
  comfyLink,
  favorites,
  archived,
  view,
  onToggleFavorite,
  onArchive,
  onJobFinished,
  onEditAgain,
}: {
  comfyLink: string;
  favorites: string[];
  archived: string[];
  view: "all" | "favorites" | "archives";
  onToggleFavorite: (id: string) => void;
  onArchive: (id: string) => void;
  onJobFinished?: (job: ImageEditJob) => void;
  onEditAgain: (asset: Asset) => void;
}) {
  const [jobs, setJobs] = useState<ImageEditJob[] | null>(null),
    [error, setError] = useState(""),
    [warning, setWarning] = useState(""),
    [refresh, setRefresh] = useState(0),
    seen = useRef(new Map<string, ImageEditJob["state"]>()),
    finished = useRef(onJobFinished);
  useEffect(() => {
    finished.current = onJobFinished;
  }, [onJobFinished]);
  useEffect(() => {
    const again = () => setRefresh((value) => value + 1);
    window.addEventListener("image-edit-submitted", again);
    return () => window.removeEventListener("image-edit-submitted", again);
  }, []);
  useEffect(() => {
    let active = true,
      busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const data = await call<{ jobs: ImageEditJob[] }>("/api/comfy/edit", comfyLink);
        let note = "";
        const updated: ImageEditJob[] = [];
        for (const job of data.jobs) {
          if (pending.includes(job.state) && comfyLink) {
            try {
              const result = await call<{ job: ImageEditJob; warning?: string }>(`/api/comfy/edit/${job.id}`, comfyLink);
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
        if (active) setError(e instanceof Error ? e.message : "Could not load edits.");
      } finally {
        busy = false;
      }
    }
    void load();
    const timer = setInterval(load, 3000);
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
            ? "No favorite edits yet. Use the star on an edit to save it here."
            : view === "archives"
              ? "No archived edits yet."
              : "No image edits yet. Connect your ComfyUI GPU, add an image and describe the change."}
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      {warning && visible.some((job) => pending.includes(job.state)) && <div className="error" role="alert">{warning}</div>}
      <div className="job-list">
        {visible.map((job) => (
          <ImageEditCard
            key={job.id}
            job={job}
            favorite={favorites.includes(job.id)}
            showArchive={view === "all"}
            showRestore={view === "archives"}
            onToggleFavorite={() => onToggleFavorite(job.id)}
            onArchive={() => onArchive(job.id)}
            onChange={() => setRefresh((value) => value + 1)}
            onEditAgain={onEditAgain}
          />
        ))}
      </div>
    </div>
  );
}

function ImageEditCard({
  job,
  favorite,
  showArchive,
  showRestore,
  onToggleFavorite,
  onArchive,
  onChange,
  onEditAgain,
}: {
  job: ImageEditJob;
  favorite: boolean;
  showArchive: boolean;
  showRestore: boolean;
  onToggleFavorite: () => void;
  onArchive: () => void;
  onChange: () => void;
  onEditAgain: (asset: Asset) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [viewing, setViewing] = useState<string | null>(null),
    [showDetails, setShowDetails] = useState(false);
  const image = (which: string) => `/api/comfy/edit/${job.id}/image?which=${which}`;
  const labels: Record<ImageEditJob["state"], string> = {
    submitting: "Submitting",
    queued: "Queued",
    running: "Rendering",
    success: "Ready",
    fail: "Failed",
  };
  async function editAgain() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(image("output"), { cache: "no-store" });
      if (!response.ok) throw new Error("The result image is not available.");
      const blob = await response.blob();
      const extension = blob.type.split("/")[1] || "png";
      onEditAgain({ id: crypto.randomUUID(), name: `qwen-edit-${job.id.slice(0, 8)}.${extension}`, type: blob.type, blob, created: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the result.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="job-card">
      <div className="between">
        <div className="generation-title">
          <span className={`job-status ${job.state === "success" ? "completed" : job.state === "fail" ? "failed" : "processing"}`}>
            {labels[job.state]}
          </span>
          <strong>{(job.promptId || job.id).slice(0, 10)}</strong>
        </div>
        <GenerationTime created={job.created} />
        <small className="job-model-line">
          <GenerationElapsed created={job.created} completedAt={pending.includes(job.state) ? undefined : job.completedAt ?? job.updated} />
        </small>
        <div className="job-mode-row">
          <div className="job-card-tools">
            <button type="button" className="job-refresh-button" aria-label="Refresh status" title="Refresh status" onClick={onChange} disabled={busy}>
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
      {pending.includes(job.state) && <RenderPreview kind="image" image={image("input1")} state={job.state === "running" ? "generating" : job.state === "queued" ? "queuing" : "submitting"} />}
      {job.state === "success" && job.hasOutput && (
        <button type="button" className="job-media image-edit-result" onClick={() => setViewing("output")} aria-label="View the edited image larger">
          <img src={image("output")} alt="Edited result" />
        </button>
      )}
      <div className="job-meta-row">
        <button type="button" className="text-button edit-details-button" onClick={() => setShowDetails(true)}>
          Show details
        </button>
        <small className="real-label">Cost: GPU time</small>
      </div>
      {job.error && <p className="error">{job.error}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(pending.includes(job.state) || (job.state === "success" && job.hasOutput)) && (
        <div className="job-actions">
          {job.state === "success" && job.hasOutput ? (
            <a className="button" href={`${image("output")}&download=1`} download>
              Download image
            </a>
          ) : (
            <button type="button" className="button" disabled>
              Download image
            </button>
          )}
          <Button secondary disabled={busy || pending.includes(job.state)} onClick={() => void editAgain()}>
            Edit this result
          </Button>
        </div>
      )}
      {showDetails && (
        <EditDetails
          job={job}
          status={labels[job.state]}
          image={image}
          onView={(which) => {
            setShowDetails(false);
            setViewing(which);
          }}
          onClose={() => setShowDetails(false)}
        />
      )}
      {viewing && (
        <Modal
          title={viewing === "output" ? "Edited image" : `Input ${viewing.replace("input", "image ")}`}
          closeLabel="Close"
          className="image-viewer-modal"
          onClose={() => setViewing(null)}
        >
          <div className="image-viewer">
            <img src={image(viewing)} alt={viewing === "output" ? "Edited result" : `Input ${viewing}`} />
          </div>
          <div className="image-viewer-actions">
            {job.state === "success" && job.hasOutput && job.inputCount > 0 && (
              <Button type="button" secondary onClick={() => setViewing(viewing === "output" ? "input1" : "output")}>
                {viewing === "output" ? "Show original" : "Show edited"}
              </Button>
            )}
            <a className="button" href={`${image(viewing)}&download=1`} download>
              Download
            </a>
          </div>
        </Modal>
      )}
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

// A report of everything that went into one edit: inputs, result, model, settings and timing.
function EditDetails({
  job,
  status,
  image,
  onView,
  onClose,
}: {
  job: ImageEditJob;
  status: string;
  image: (which: string) => string;
  onView: (which: string) => void;
  onClose: () => void;
}) {
  const [output, setOutput] = useState<{ width: number; height: number } | null>(null);
  const model = job.model ?? "qwen-edit-2511";
  const settings = IMAGE_EDIT_MODELS[model];
  const preset = settings.quality[job.quality];
  const resolution = job.resolution ?? 1024;
  const weights =
    model === "qwen-image-2.1"
      ? [preset?.turbo ? QWEN21_FILES.turbo : QWEN21_FILES.unet, QWEN21_FILES.clip, ...(job.consistency ? [QWEN21_FILES.consistency] : [])]
      : [QWEN_EDIT_FILES.unet, QWEN_EDIT_FILES.clip, ...(preset?.lightning ? [QWEN_EDIT_FILES.lightning] : [])];
  const size = job.size ?? "auto";
  const planned = size === "auto" ? null : canvasSize(size, model, resolution);
  const finished = job.state === "success" || job.state === "fail" ? job.completedAt ?? job.updated : undefined;
  const hasResult = job.state === "success" && job.hasOutput;
  const stateClass = job.state === "success" ? "completed" : job.state === "fail" ? "failed" : "processing";
  let server = job.server;
  try {
    server = new URL(job.server).host;
  } catch {
    // Keep the stored value.
  }

  const rows: [string, React.ReactNode][] = [
    ["Model", settings.label],
    ["Quality", preset?.label ?? `${job.steps} steps`],
    ...(model === "qwen-image-2.1" ? ([["Consistency LoRA", job.consistency ? "On" : "Off"]] as [string, React.ReactNode][]) : []),
    ["Steps · CFG", `${job.steps} steps · CFG ${job.cfg}`],
    ["Seed", <span key="seed" className="edit-details-inline"><code>{job.seed}</code><CopyButton value={String(job.seed)} label="seed" /></span>],
    [
      "Output size",
      output
        ? `${output.width}×${output.height}${size === "auto" ? " · matched input" : ` · ${size}`}`
        : planned
          ? `${size} · ${planned.width}×${planned.height}`
          : "Matches image 1",
    ],
    ...(settings.resolutions.length > 1 ? ([["Resolution", resolution === 2048 ? "2K" : "1K"]] as [string, React.ReactNode][]) : []),
    ["Weights", <span key="weights" className="edit-details-files">{weights.map((file) => <code key={file}>{file}</code>)}</span>],
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
    ...(job.promptId
      ? ([["ComfyUI job", <span key="job" className="edit-details-inline"><code>{job.promptId}</code><CopyButton value={job.promptId} label="job ID" /></span>]] as [string, React.ReactNode][])
      : []),
  ];

  return (
    <Modal title="Generation details" closeLabel="Close" className="edit-details-modal" onClose={onClose}>
      <div className="edit-details">
        <div className="edit-details-summary">
          <span className={`job-status ${stateClass}`}>{status}</span>
          <strong>{settings.short}</strong>
          <span>{preset?.label ?? `${job.steps} steps`}</span>
          {size !== "auto" && <span>{size}</span>}
          {resolution === 2048 && <span>2K</span>}
        </div>

        <div className="edit-details-media">
          {Array.from({ length: job.inputCount }, (_, index) => (
            <button type="button" key={index} onClick={() => onView(`input${index + 1}`)} title={`View image ${index + 1} larger`}>
              <img src={image(`input${index + 1}`)} alt={`Input image ${index + 1}`} />
              <span>{index === 0 ? "Image 1 · edited" : `Image ${index + 1} · reference`}</span>
            </button>
          ))}
          {hasResult && (
            <button type="button" className="edit-details-result" onClick={() => onView("output")} title="View the result larger">
              <img
                src={image("output")}
                alt="Edited result"
                onLoad={(event) => setOutput({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              />
              <span>Result</span>
            </button>
          )}
        </div>

        <section className="edit-details-section">
          <div className="between">
            <h3>Prompt</h3>
            <CopyButton value={job.prompt} label="prompt" />
          </div>
          <p className="edit-details-prompt">{job.prompt}</p>
        </section>

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
      </div>
    </Modal>
  );
}
