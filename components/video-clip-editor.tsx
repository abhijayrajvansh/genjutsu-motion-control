"use client";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Asset } from "@/lib/storage";
import { VideoSelection, videoSelection } from "@/lib/video-selection";

function timecode(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function drawWave(
  canvas: HTMLCanvasElement,
  peaks: number[],
  start: number,
  end: number,
  sourceSeconds: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 2 || height < 2) return;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const samples = peaks.length > 0 ? peaks : Array.from({ length: 64 }, () => 0.08);
  const gap = 1.4;
  const barWidth = Math.max(1, (width - gap * (samples.length - 1)) / samples.length);
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#35c8ff");
  gradient.addColorStop(1, "#d4f25c");
  samples.forEach((peak, index) => {
    const x = index * (barWidth + gap);
    const barHeight = Math.max(2, Math.min(1, peak) * (height - 4));
    const at = ((index + 0.5) / samples.length) * sourceSeconds;
    const idle = getComputedStyle(canvas).getPropertyValue("--clip-wave-idle").trim() || "rgba(255,255,255,0.2)";
    context.fillStyle = at >= start && at <= end ? gradient : idle;
    context.beginPath();
    context.roundRect(x, (height - barHeight) / 2, barWidth, barHeight, 1);
    context.fill();
  });
}

type DragMode = "start" | "end" | "move" | "seek";

export type VideoClipControls = { togglePlayback: () => void };
export function VideoClipEditor({ asset, sourceSeconds, selection, minimum, maximum, disabled, onChange, compact = false, playbackRef, onPlaybackChange, previewContainer = null }: {
  asset: Asset;
  sourceSeconds: number;
  selection: VideoSelection;
  minimum: number;
  maximum: number;
  disabled: boolean;
  onChange: (selection: VideoSelection) => void;
  compact?: boolean;
  playbackRef?: React.Ref<VideoClipControls>;
  onPlaybackChange?: (playing: boolean) => void;
  previewContainer?: HTMLElement | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const wave = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clipMode, setClipMode] = useState<"full" | "trim">(() => {
    const full = videoSelection(sourceSeconds, minimum, maximum);
    return Math.abs(full.start - selection.start) < 0.001 && Math.abs(full.end - selection.end) < 0.001 ? "full" : "trim";
  });
  const [error, setError] = useState("");
  const [frames, setFrames] = useState<string[]>([]);
  const [peaks, setPeaks] = useState<number[]>([]);
  const length = selection.end - selection.start;
  const displayLength = Number(length.toFixed(2));
  const valid = length >= minimum && sourceSeconds >= minimum;
  const locked = disabled || !valid || !!error;
  const startRatio = sourceSeconds > 0 ? selection.start / sourceSeconds : 0;
  const endRatio = sourceSeconds > 0 ? selection.end / sourceSeconds : 1;

  useEffect(() => {
    const next = URL.createObjectURL(asset.blob);
    // The preview URL exists only in this browser and is released on replacement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [asset.blob]);

  useEffect(() => {
    if (!url || sourceSeconds <= 0) return;
    let cancelled = false;
    const element = document.createElement("video");
    element.muted = true;
    element.playsInline = true;
    element.preload = "auto";
    element.src = url;
    const canvas = document.createElement("canvas");
    canvas.width = 72;
    canvas.height = 128;
    const count = Math.max(8, Math.min(16, Math.round((track.current?.clientWidth || 320) / 48)));
    const shots: string[] = [];
    const grab = (index: number) => {
      if (cancelled) return;
      if (index >= count) {
        setFrames(shots);
        return;
      }
      const at = Math.min(Math.max(0, sourceSeconds - 0.05), ((index + 0.5) / count) * sourceSeconds);
      let settled = false;
      const finish = () => {
        if (settled || cancelled) return;
        settled = true;
        element.removeEventListener("seeked", finish);
        const context = canvas.getContext("2d");
        if (context && element.videoWidth > 0) {
          const sourceRatio = element.videoWidth / element.videoHeight;
          const targetRatio = canvas.width / canvas.height;
          let sx = 0, sy = 0, sw = element.videoWidth, sh = element.videoHeight;
          if (sourceRatio > targetRatio) {
            sw = element.videoHeight * targetRatio;
            sx = (element.videoWidth - sw) / 2;
          } else {
            sh = element.videoWidth / targetRatio;
            sy = (element.videoHeight - sh) / 2;
          }
          context.drawImage(element, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          shots[index] = canvas.toDataURL("image/jpeg", 0.62);
          setFrames(shots.filter(Boolean));
        }
        grab(index + 1);
      };
      element.addEventListener("seeked", finish);
      if (element.readyState >= 2 && Math.abs(element.currentTime - at) < 0.03) finish();
      else element.currentTime = at;
    };
    if (element.readyState >= 1) grab(0);
    else element.addEventListener("loadedmetadata", () => grab(0), { once: true });
    return () => {
      cancelled = true;
      element.removeAttribute("src");
      element.load();
    };
  }, [url, sourceSeconds]);

  useEffect(() => {
    let cancelled = false;
    const context = new AudioContext();
    asset.blob.arrayBuffer().then((buffer) => context.decodeAudioData(buffer.slice(0))).then((audio) => {
      if (cancelled) return;
      const channel = audio.getChannelData(0);
      const bars = 72;
      const block = Math.max(1, Math.floor(channel.length / bars));
      const next: number[] = [];
      for (let index = 0; index < bars; index += 1) {
        let peak = 0;
        const from = index * block;
        for (let sample = 0; sample < block; sample += 8) peak = Math.max(peak, Math.abs(channel[from + sample] || 0));
        next.push(peak);
      }
      const loudest = Math.max(...next, 0.001);
      setPeaks(next.map((peak) => peak / loudest));
    }).catch(() => {
      if (!cancelled) setPeaks([]);
    }).finally(() => void context.close());
    return () => { cancelled = true; };
  }, [asset.blob]);

  useEffect(() => {
    const canvas = wave.current;
    if (!canvas) return;
    const draw = () => drawWave(canvas, peaks, selection.start, selection.end, sourceSeconds);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      theme.disconnect();
    };
  }, [peaks, selection.start, selection.end, sourceSeconds]);

  function seek(seconds: number) {
    if (!video.current) return;
    video.current.pause();
    const next = Math.max(0, Math.min(sourceSeconds, seconds));
    video.current.currentTime = next;
    setCursor(next);
  }
  function moveWindow(start: number) {
    const next = videoSelection(sourceSeconds, minimum, maximum, { start, end: start + length });
    onChange(next);
    seek(next.start);
  }
  function updateStart(start: number) {
    const next = videoSelection(sourceSeconds, minimum, maximum, { start, end: selection.end });
    onChange(next);
    seek(next.start);
  }
  function updateEnd(end: number) {
    const next = videoSelection(sourceSeconds, minimum, maximum, { start: selection.start, end });
    onChange(next);
    seek(Math.max(next.start, next.end - 1 / 30));
  }
  function chooseClipMode(next: "full" | "trim") {
    setClipMode(next);
    if (next === "full") onChange(videoSelection(sourceSeconds, minimum, maximum));
  }
  function timeAt(clientX: number) {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * sourceSeconds;
  }
  function beginDrag(mode: DragMode, event: React.PointerEvent) {
    if (locked) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).focus();
    const originX = event.clientX;
    const originStart = selection.start;
    let moved = false;
    const move = (pointer: PointerEvent) => {
      if (Math.abs(pointer.clientX - originX) > 3) moved = true;
      const at = timeAt(pointer.clientX);
      if (mode === "start") updateStart(at);
      else if (mode === "end") updateEnd(at);
      else if (mode === "move" && moved) moveWindow(originStart + at - timeAt(originX));
      else if (mode === "seek") seek(at);
    };
    const stop = (pointer: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      if (mode === "move" && !moved) seek(timeAt(pointer.clientX));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    if (mode === "seek") seek(timeAt(originX));
  }
  async function playSelection() {
    if (!video.current || locked) return;
    if (!video.current.paused) { video.current.pause(); return; }
    if (video.current.currentTime < selection.start || video.current.currentTime >= selection.end - 0.04)
      video.current.currentTime = selection.start;
    try { await video.current.play(); setError(""); }
    catch { setError("This browser could not play the clip. Try an H.264 MP4."); }
  }
  useImperativeHandle(playbackRef, () => ({ togglePlayback: () => { void playSelection(); } }));
  const playhead = sourceSeconds > 0 ? `${Math.min(100, Math.max(0, cursor / sourceSeconds * 100))}%` : "0%";

  const preview = (
    <>
      <div className="clip-preview-slot">
        <video ref={video} src={url || undefined} className="clip-preview" playsInline preload="auto"
          aria-label="Selected clip preview"
          onPlay={() => { setPlaying(true); onPlaybackChange?.(true); }} onPause={() => { setPlaying(false); onPlaybackChange?.(false); }}
          onError={() => setError("This browser cannot preview the video. Try an H.264 MP4.")}
          onLoadedData={() => seek(selection.start)}
          onTimeUpdate={() => {
            const element = video.current;
            if (!element) return;
            if (!element.paused && element.currentTime >= selection.end) {
              element.pause();
              element.currentTime = Math.max(selection.start, selection.end - 1 / 30);
            }
            setCursor(element.currentTime);
          }}
        />
        {previewContainer && (
          <button
            type="button"
            className="clip-preview-toggle"
            aria-label={playing ? "Pause driving video" : "Play driving video"}
            disabled={locked}
            onClick={() => void playSelection()}
          >
            <span>
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6.5 5h3.5v14H6.5V5Zm7.5 0H17.5v14H14V5Z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5L8 5.5Z" />
                </svg>
              )}
            </span>
          </button>
        )}
      </div>
      {compact && <small className="clip-file-name" title={asset.name}>{asset.name}</small>}
    </>
  );
  return (
    <section className={`clip-editor ${compact ? "clip-editor-inline" : ""} ${previewContainer ? "clip-editor-span" : ""}`} aria-label="Input video editor">
      {!compact && <div className="between">
        <strong>Input duration</strong>
        <span className="clip-length">{displayLength}s selected</span>
      </div>}
      {previewContainer ? createPortal(preview, previewContainer) : preview}
      <div className="clip-board" data-mode={clipMode}>
        <div className="clip-board-head">
          <fieldset className="clip-mode">
            <legend>Driving video length</legend>
            <label>
              <input type="radio" name={`clip-mode-${asset.id}`} value="full" checked={clipMode === "full"} disabled={disabled} onChange={() => chooseClipMode("full")} />
              Use full video
            </label>
            <label>
              <input type="radio" name={`clip-mode-${asset.id}`} value="trim" checked={clipMode === "trim"} disabled={disabled} onChange={() => chooseClipMode("trim")} />
              Trim
            </label>
          </fieldset>
          {!compact && <button type="button" className="clip-play" disabled={locked} onClick={playSelection}>{playing ? "Pause" : "Play"}</button>}
          <output aria-label="Video playhead">{timecode(cursor)} <span>/ {timecode(sourceSeconds)}</span></output>
        </div>
        <div
          ref={track}
          className="clip-track"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest(".clip-handle")) return;
            const rect = track.current?.getBoundingClientRect();
            if (!rect) return;
            const x = event.clientX - rect.left;
            const startX = startRatio * rect.width;
            const endX = endRatio * rect.width;
            const inside = x > startX + 10 && x < endX - 10;
            beginDrag(clipMode === "full" || !inside ? "seek" : "move", event);
          }}
        >
          <div className="clip-frames" aria-hidden="true">
            {(frames.length > 0 ? frames : Array.from({ length: 10 }, () => "")).map((frame, index) => (
              frame
                ? <img key={index} src={frame} alt="" draggable={false} />
                : <span key={index} />
            ))}
          </div>
          <div className="clip-dim" style={{ width: `${startRatio * 100}%` }} />
          <div className="clip-dim clip-dim-end" style={{ width: `${(1 - endRatio) * 100}%` }} />
          <div className="clip-range" style={{ left: `${startRatio * 100}%`, width: `${Math.max(0, endRatio - startRatio) * 100}%` }} />
          <button
            type="button"
            className="clip-handle clip-handle-in"
            style={{ left: `${startRatio * 100}%` }}
            aria-label="Trim in"
            disabled={locked || clipMode === "full"}
            onPointerDown={(event) => beginDrag("start", event)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              updateStart(selection.start + (event.key === "ArrowLeft" ? -1 : 1));
            }}
          />
          <button
            type="button"
            className="clip-handle clip-handle-out"
            style={{ left: `${endRatio * 100}%` }}
            aria-label="Trim out"
            disabled={locked || clipMode === "full"}
            onPointerDown={(event) => beginDrag("end", event)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              updateEnd(selection.end + (event.key === "ArrowLeft" ? -1 : 1));
            }}
          />
          <div className="clip-playhead" style={{ left: playhead }} />
        </div>
        <canvas ref={wave} className="clip-wave" aria-hidden="true" />
        <div className="clip-readout">
          <label>
            <span>In</span>
            <input type="number" aria-label="Clip start time" step={0.01} min={0} max={Math.max(0, sourceSeconds - length)} value={Number(selection.start.toFixed(2))}
              disabled={locked || clipMode === "full"} onChange={(event) => { if (event.target.value !== "") updateStart(Number(event.target.value)); }} />
          </label>
          <strong>{displayLength}s</strong>
          <label>
            <span>Out</span>
            <input type="number" aria-label="Clip end time" step={0.01} min={selection.start + minimum} max={Math.min(sourceSeconds, selection.start + maximum)} value={Number(selection.end.toFixed(2))}
              disabled={locked || clipMode === "full"} onChange={(event) => { if (event.target.value !== "") updateEnd(Number(event.target.value)); }} />
          </label>
        </div>
      </div>
      {!compact && <small>Choose {minimum}–{maximum}s. Drag the cyan handle to move the start, and the lime handle to move the end. Drag inside the selection to slide the whole clip. Length snaps to whole seconds. Only this selection is sent to Kie.</small>}
      {compact && <small className="clip-selection-summary">{timecode(selection.start)} → {timecode(selection.end)} · Output: {displayLength}s</small>}
      {compact && (
        <button type="button" className="button secondary clip-play-toggle" disabled={locked} onClick={() => void playSelection()}>
          {playing ? "Pause" : "Play"}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
