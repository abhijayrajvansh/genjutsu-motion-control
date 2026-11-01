"use client";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Asset } from "@/lib/storage";
import { VideoSelection, videoSelection } from "@/lib/video-selection";

function timecode(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

export type VideoClipControls = { togglePlayback: () => void };
export function VideoClipEditor({ asset, sourceSeconds, selection, minimum, maximum, disabled, onChange, compact = false, playbackRef, onPlaybackChange }: {
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
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState("");
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const length = selection.end - selection.start;
  const displayLength = Number(length.toFixed(2));
  const valid = length >= minimum && sourceSeconds >= minimum;
  useEffect(() => {
    const next = URL.createObjectURL(asset.blob);
    // The preview URL exists only in this browser and is released on replacement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [asset.blob]);
  function seek(seconds: number) {
    if (!video.current) return;
    video.current.pause();
    const next = Math.max(0, Math.min(sourceSeconds, seconds));
    video.current.currentTime = next;
    setCursor(next);
  }
  function updateStart(start: number) {
    const next = videoSelection(sourceSeconds, minimum, maximum, { start, end: start + length });
    onChange(next);
    seek(next.start);
  }
  function updateEnd(end: number) {
    const next = videoSelection(sourceSeconds, minimum, maximum, { start: selection.start, end });
    onChange(next);
    seek(Math.max(next.start, next.end - 1 / 30));
  }
  async function playSelection() {
    if (!video.current || disabled || !valid || error) return;
    if (!video.current.paused) { video.current.pause(); return; }
    if (video.current.currentTime < selection.start || video.current.currentTime >= selection.end - 0.04)
      video.current.currentTime = selection.start;
    try { await video.current.play(); setError(""); }
    catch { setError("This browser could not play the clip. Try an H.264 MP4."); }
  }
  useImperativeHandle(playbackRef, () => ({ togglePlayback: () => { void playSelection(); } }));
  return (
    <section className={`clip-editor ${compact ? "clip-editor-inline" : ""}`} aria-label="Input video editor">
      {!compact && <div className="between">
        <strong>Input duration</strong>
        <span className="clip-length">{displayLength}s selected</span>
      </div>}
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
      {compact && <small className="clip-file-name" title={asset.name}>{asset.name}</small>}
      <div className="clip-transport">
        {!compact && <button type="button" className="button secondary" disabled={disabled || !valid || !!error} onClick={playSelection}>
          {playing ? "Pause" : "Play selection"}
        </button>}
        <output aria-label="Video playhead">{timecode(cursor)} <span>/ {timecode(sourceSeconds)}</span></output>
      </div>
      <div className="clip-timeline">
        <div className="clip-selection" style={{ left: `${selection.start / sourceSeconds * 100}%`, width: `${length / sourceSeconds * 100}%` }} />
        <input type="range" min={0} max={sourceSeconds} step={0.01} value={cursor}
          aria-label="Scrub video" disabled={disabled || !!error} onChange={(event) => seek(Number(event.target.value))} />
      </div>
      <div className="clip-points">
        <label className="field">
          <span>Start <small>seconds</small></span>
          <input type="number" aria-label="Clip start time" step={0.01} min={0} max={Math.max(0, sourceSeconds - length)} value={Number(selection.start.toFixed(2))}
            disabled={disabled || !valid} onChange={(event) => { if (event.target.value !== "") updateStart(Number(event.target.value)); }} />
          <input type="range" aria-label="Adjust clip start" step={0.01} min={0} max={Math.max(0, sourceSeconds - length)} value={selection.start}
            disabled={disabled || !valid} onChange={(event) => updateStart(Number(event.target.value))} />
          <button type="button" className="text-button" disabled={disabled || !valid} onClick={() => updateStart(cursor)}>Set start here</button>
        </label>
        <label className="field">
          <span>End <small>seconds</small></span>
          <input type="number" aria-label="Clip end time" step={1} min={selection.start + minimum} max={Math.min(sourceSeconds, selection.start + maximum)} value={Number(selection.end.toFixed(2))}
            disabled={disabled || !valid} onChange={(event) => { if (event.target.value !== "") updateEnd(Number(event.target.value)); }} />
          <input type="range" aria-label="Adjust clip end" step={1} min={Math.min(sourceSeconds, selection.start + minimum)} max={Math.min(sourceSeconds, selection.start + maximum)} value={selection.end}
            disabled={disabled || !valid} onChange={(event) => updateEnd(Number(event.target.value))} />
          <button type="button" className="text-button" disabled={disabled || !valid} onClick={() => updateEnd(cursor)}>Set end here</button>
        </label>
      </div>
      <small>{timecode(selection.start)} → {timecode(selection.end)} · Output: {displayLength}s</small>
      {!compact && <small>Choose {minimum}–{maximum}s. Length snaps to whole seconds; move Start to position the segment. Only this selection is sent to Kie.</small>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
