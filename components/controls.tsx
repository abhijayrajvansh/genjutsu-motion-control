"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Asset, records, saveRecord } from "@/lib/storage";
export const IMAGE_TYPES = "image/png,image/jpeg,image/webp";
export const VIDEO_TYPES = "video/mp4,video/quicktime,video/webm";
export type Option =
  | string
  | { value: string; label: string; hint?: string; disabled?: boolean };
export function useSaved(
  key: string,
  initial: string,
): [string, (v: string) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const v = localStorage.getItem(key);
    // Hydrate the saved browser preference after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v) setValue(v);
  }, [key]);
  return [
    value,
    (v: string) => {
      setValue(v);
      localStorage.setItem(key, v);
    },
  ];
}
export function Button({
  children,
  secondary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      {...props}
      className={`button ${secondary ? "secondary" : ""} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
export function Select({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const items = options.map((option) => typeof option === "string" ? { value: option, label: option, disabled: false } : option);
  const selected = items.findIndex((option) => option.value === value);
  const enabled = items.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function show() {
    setActive(enabled.includes(selected) ? selected : (enabled[0] ?? 0));
    setOpen(true);
  }
  function choose(index: number) {
    if (!items[index] || items[index].disabled) return;
    onChange(items[index].value);
    setOpen(false);
    trigger.current?.focus();
  }
  function keyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (open) choose(active); else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      const position = enabled.indexOf(active);
      const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1) : enabled[(position + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length];
      if (next !== undefined) setActive(next);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: now - search.current.time < 700 ? search.current.text + event.key : event.key, time: now };
      const match = enabled.find((index) => items[index].label.toLowerCase().startsWith(search.current.text.toLowerCase()));
      if (!open) show();
      if (match !== undefined) setActive(match);
    }
  }
  return (
    <div className="field" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <span id={`${id}-label`}>{label}</span>
      <div className="select-control">
        <button type="button" className="select-trigger" role="combobox" ref={trigger}
          aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={open}
          aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-option-${active}` : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onClick={() => open ? setOpen(false) : show()} onKeyDown={keyDown}>
          <span>{items[selected]?.label ?? value}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {open && (
          <div className="select-menu" id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} ref={list}>
            {items.map((option, index) => (
              <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined} data-highlighted={index === active}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}>
                <span>{option.label}</span><span aria-hidden="true">{option.value === value ? "✓" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function Choices({
  className = "",
  label,
  options,
  value,
  onChange,
}: {
  className?: string;
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <fieldset className={`choices ${className}`}>
      <legend>{label}</legend>
      <div>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          return (
            <label
              key={v}
              className={`${value === v ? "selected" : ""} ${typeof o !== "string" && o.disabled ? "choice-disabled" : ""}`}
            >
              <span>
                <input
                  type="radio"
                  name={id}
                  checked={value === v}
                  disabled={typeof o !== "string" && o.disabled}
                  onChange={() => onChange(v)}
                />
                {typeof o === "string" ? o : o.label}
              </span>
              {typeof o !== "string" && o.hint && <small>{o.hint}</small>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
export function TextField({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Prompt({
  value,
  onChange,
  maxLength = 4000,
  hintClassName,
  onUseDefault,
  hint = "Sent as you wrote it. Refer to your pictures in order — the first is @image1, the second @image2.",
}: {
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  maxLength?: number;
  hintClassName?: string;
  onUseDefault?: () => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <span className="between">
        <label htmlFor={id}>Prompt</label>
        {onUseDefault && (
          <button type="button" className="text-button" onClick={onUseDefault}>
            Use default
          </button>
        )}
      </span>
      <textarea
        id={id}
        aria-describedby={`${id}-hint`}
        rows={5}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <small id={`${id}-hint`} className={hintClassName}>{hint}</small>
    </div>
  );
}
export function Duration({
  value,
  onChange,
  max = 15,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <label className="field">
      <span className="between">
        Duration <small>{value} s</small>
      </span>
      <input
        type="range"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
  closeLabel = "Cancel",
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="between modal-heading">
        <h2 id={titleId}>{title}</h2>
        <Button type="button" secondary onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function AssetPreview({
  asset,
  controls = false,
  autoPlay = false,
}: {
  asset: Asset;
  controls?: boolean;
  autoPlay?: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(asset.blob);
    // Each blob gets an owned URL, released by this effect’s cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [asset]);
  if (!url) return null;
  return asset.type.startsWith("video/") ? (
    <video
      src={url}
      aria-label={asset.name}
      controls={controls}
      autoPlay={autoPlay}
      muted={!controls}
      playsInline
      preload="metadata"
    />
  ) : asset.type.startsWith("audio/") ? (
    controls ? (
      <audio src={url} aria-label={asset.name} controls autoPlay={autoPlay} />
    ) : (
      <span>Audio file</span>
    )
  ) : (
    <img src={url} alt={asset.name} />
  );
}
export function FilePicker({
  label,
  hint,
  accept = IMAGE_TYPES,
  asset,
  onPick,
  simple = false,
  onError,
  loadedContent,
  onPreview,
  previewLabel,
  previewDisabled = false,
  hideActions = false,
  headerAction,
}: {
  label: string;
  hint?: string;
  headerAction?: React.ReactNode;
  accept?: string;
  asset: Asset | null;
  onPick: (a: Asset | null) => void;
  simple?: boolean;
  onError?: (s: string) => void;
  loadedContent?: React.ReactNode;
  onPreview?: () => void;
  previewLabel?: string;
  previewDisabled?: boolean;
  hideActions?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [previewing, setPreviewing] = useState(false),
    [saved, setSaved] = useState<Asset[]>([]),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const video = accept.startsWith("video"),
    audio = accept.startsWith("audio");
  const valid = (f: Blob) =>
    accept
      .split(",")
      .some((t) =>
        t.endsWith("/*")
          ? f.type.startsWith(t.split("/")[0] + "/")
          : t === f.type,
      );
  async function pick(file?: File) {
    if (!file) return;
    setError("");
    if (!valid(file)) {
      setError("Choose a supported file type.");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setError("Choose a file smaller than 200 MB.");
      return;
    }
    try {
      const a = {
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        blob: file,
        created: Date.now(),
      };
      await saveRecord("assets", a);
      onPick(a);
      setOpen(false);
    } catch {
      setError("Could not save this file. Your browser storage may be full.");
    }
  }
  async function browse() {
    setOpen(true);
    setError("");
    try {
      setSaved(
        (await records<Asset>("assets"))
          .filter((a) => valid(a.blob))
          .sort((a, b) => b.created - a.created),
      );
    } catch {
      setError("Saved files are unavailable in this browser.");
    }
  }
  return (
    <div className="file-picker">
      <div className="file-heading">
        <div className="file-label">
          {label} {hint && <small>{hint}</small>}
        </div>
        {headerAction}
        {asset && (
          <button type="button" className="text-button" aria-label={`Remove ${label}`} onClick={() => onPick(null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" />
            </svg>
            Remove
          </button>
        )}
      </div>
      {asset && loadedContent ? loadedContent : <button
        type="button"
        className={`drop-zone ${drag ? "dragging" : ""} ${asset ? "has-file" : ""} ${simple ? "simple" : ""}`}
        aria-label={asset ? `Preview ${label}: ${asset.name}` : undefined}
        onClick={() => (asset ? setPreviewing(true) : void browse())}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void pick(e.dataTransfer.files[0]).catch(() =>
            onError?.("Could not load that file."),
          );
        }}
      >
        {asset ? (
          <>
            <AssetPreview asset={asset} />
            <span>{asset.name}</span>
          </>
        ) : simple ? (
          "Choose a clip"
        ) : (
          "Drop a file here, or click to choose"
        )}
      </button>}
      {asset && !hideActions && (
        <div className="file-actions">
          <Button type="button" secondary disabled={previewDisabled} onClick={() => onPreview ? onPreview() : setPreviewing(true)}>
            {previewLabel ?? (asset.type.startsWith("video/")
              ? "Play video"
              : asset.type.startsWith("audio/")
                ? "Play audio"
                : "Preview image")}
          </Button>
          <Button type="button" secondary className="replace-file" onClick={browse}>
            Change
          </Button>
        </div>
      )}
      {asset && previewing && (
        <Modal
          title={asset.name}
          closeLabel="Close"
          onClose={() => setPreviewing(false)}
        >
          <div className="full-preview input-preview">
            <AssetPreview
              asset={asset}
              controls
              autoPlay={
                asset.type.startsWith("video/") ||
                asset.type.startsWith("audio/")
              }
            />
          </div>
        </Modal>
      )}
      {error && !open && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {open && (
        <Modal
          title={`Choose ${video ? "a video" : audio ? "an audio file" : "an image"}`}
          onClose={() => setOpen(false)}
        >
          <button
            type="button"
            className="library-drop"
            onClick={() => ref.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files[0]);
            }}
          >
            <strong>Drop a file here</strong>
            <small>or click to browse your computer</small>
          </button>
          <input
            ref={ref}
            type="file"
            accept={accept}
            hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="between library-title">
            Already here{" "}
            <small>
              {saved.length} {video ? "clips" : "pictures"}
            </small>
          </div>
          {saved.length ? (
            <div className="asset-grid">
              {saved.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => {
                    onPick(a);
                    setOpen(false);
                  }}
                >
                  <AssetPreview asset={a} />
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-library">
              No files yet. Upload one to get started.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
export function ApiKey({
  host,
  onHostChange,
}: {
  host: string;
  onHostChange: (s: string) => void;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({
    kie: "",
    wavespeed: "",
  });
  return (
    <>
      <div className="segmented">
        {["kie", "wavespeed"].map((v) => (
          <Button
            key={v}
            type="button"
            secondary={host !== v}
            onClick={() => onHostChange(v)}
          >
            {v === "kie" ? "kie.ai" : "WaveSpeed"}
          </Button>
        ))}
      </div>
      <TextField
        label={`${host === "kie" ? "kie.ai" : "WaveSpeed"} API key`}
        type="password"
        autoComplete="off"
        placeholder="Paste your key"
        value={keys[host]}
        onChange={(e) => setKeys({ ...keys, [host]: e.target.value })}
        hint={
          <>
            From{" "}
            <a
              href={
                host === "kie"
                  ? "https://kie.ai/api-key"
                  : "https://wavespeed.ai/accesskey"
              }
              target="_blank"
              rel="noreferrer"
            >
              {host === "kie" ? "kie.ai/api-key" : "wavespeed.ai/accesskey"}
            </a>
            . Used once to start the render and never stored on our side. This
            tab remembers it until you close it.
          </>
        }
      />
    </>
  );
}
