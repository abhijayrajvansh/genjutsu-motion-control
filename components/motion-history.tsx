"use client";
import { useEffect, useState } from "react";
import { formatCredits, formatMotionCredits } from "@/lib/motion-pricing";
import { MotionJob } from "@/lib/motion-models";
import { useKie } from "./kie-connection";
import { Button, TextField } from "./controls";
import { GenerationElapsed, GenerationTime } from "./generation-time";
import { ArchiveButton, FavoriteButton } from "./favorite-button";
import { RenderPreview } from "./render-preview";
const pending = ["uploading", "submitting", "waiting", "queuing", "generating"];
export function MotionHistory({ showEmpty = true, favorites, archived, view, onToggleFavorite, onArchive }: {
  showEmpty?: boolean;
  favorites: string[];
  archived: string[];
  view: "all" | "favorites" | "archives";
  onToggleFavorite: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const { connected, request, revision, provider } = useKie(),
    [snapshot, setSnapshot] = useState<{ request: typeof request; jobs: MotionJob[] } | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!connected) return;
    let active = true,
      busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const data = await request<{ jobs: MotionJob[] }>("/api/kie/motion");
        const updated: MotionJob[] = [];
        for (const job of data.jobs) {
          if (job.taskId && job.state !== "success" && job.state !== "fail") {
            try {
              const result = await request<{ job: MotionJob }>(
                `/api/kie/motion/${job.id}`,
              );
              updated.push(result.job);
            } catch (e) {
              updated.push(job);
              if (active)
                setError(
                  e instanceof Error ? e.message : "Could not refresh status.",
                );
            }
          } else updated.push(job);
        }
        if (active) {
          setSnapshot({ request, jobs: updated });
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load provider history.",
          );
      } finally {
        busy = false;
      }
    }
    void load();
    const timer = setInterval(load, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connected, request, revision, refresh]);
  const jobs = snapshot?.request === request ? snapshot.jobs : [];
  const name = provider === "apimart" ? "APIMart" : "Kie";
  const visibleJobs = jobs.filter((job) => {
    const isArchived = archived.includes(job.id);
    if (view === "archives") return isArchived;
    if (isArchived) return false;
    return view === "favorites" ? favorites.includes(job.id) : true;
  });
  return (
    <div className="motion-history">
      {!connected ? (
        <div className="empty-history">
          Connect your {name} API key in the header to view and resume real
          generations.
        </div>
      ) : !visibleJobs.length && showEmpty ? (
        <div className="empty-history">
          {view === "favorites"
            ? "No favorites yet. Use the star on a generation to save it here."
            : view === "archives"
              ? "No archived generations yet. Use the bin on All generations to move one here."
              : `No ${name} generations yet. Load the two-second trial or upload your own reference image and driving video.`}
        </div>
      ) : null}
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError("");
              setRefresh((r) => r + 1);
            }}
          >
            Refresh status
          </button>
        </div>
      )}
      <div className="job-list">
        {connected &&
          visibleJobs.map((job) => (
            <MotionCard
              key={job.id}
              job={job}
              favorite={favorites.includes(job.id)}
              showArchive={view === "all"}
              showRestore={view === "archives"}
              onToggleFavorite={() => onToggleFavorite(job.id)}
              onArchive={() => onArchive(job.id)}
              onChange={() => setRefresh((r) => r + 1)}
            />
          ))}
      </div>
    </div>
  );
}
function MotionResult({ job }: { job: MotionJob }) {
  const { request, key, provider } = useKie();
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [media, setMedia] = useState<{
    request: typeof request;
    id: string;
    attempt: number;
    url?: string;
    error?: string;
  } | null>(null);
  const preserveAudio = job.preserveInputAudio !== false;
  const current = media?.request === request && media.id === job.id && media.attempt === attempt
    ? media : null;

  useEffect(() => {
    if (!requested || !preserveAudio) return;
    const controller = new AbortController();
    let active = true;
    let url: string | undefined;
    async function prepare() {
      try {
        // Use the same authenticated, audio-preserving file as Download video.
        const response = await fetch(`/api/kie/motion/${job.id}/download?originalAudio=true`, {
          headers: { "x-motion-provider": provider, ...(key ? { [provider === "apimart" ? "x-apimart-key" : "x-kie-key"]: key } : {}) },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Could not prepare video audio.");
        }
        const blob = await response.blob();
        if (!active) return;
        url = URL.createObjectURL(blob);
        setMedia({ request, id: job.id, attempt, url });
      } catch (error) {
        if (active) setMedia({ request, id: job.id, attempt,
          error: error instanceof Error ? error.message : "Could not prepare video audio." });
      }
    }
    void prepare();
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [requested, preserveAudio, job.id, request, key, provider, attempt]);

  return (
    <>
      <video
        className="real-result"
        src={preserveAudio && current?.url ? current.url : job.resultUrls?.[0]}
        controls
        playsInline
        preload="metadata"
        onPlay={(event) => {
          if (!preserveAudio || current?.url) return;
          event.currentTarget.pause();
          setRequested(true);
          if (current?.error) setAttempt((value) => value + 1);
        }}
        onLoadedMetadata={(event) => {
          if (preserveAudio && current?.url) {
            // Native controls remain available if the browser requires another play gesture.
            void event.currentTarget.play().catch(() => {});
          }
        }}
      />
      {preserveAudio && requested && !current && <p role="status">Preparing video with original audio…</p>}
      {preserveAudio && current?.error && (
        <p className="error" role="alert">
          {current.error}{" "}
          <button type="button" className="text-button" onClick={() => setAttempt((value) => value + 1)}>
            Retry playback
          </button>
        </p>
      )}
    </>
  );
}
function MotionCard({
  job,
  onChange,
  favorite,
  showArchive,
  showRestore,
  onToggleFavorite,
  onArchive,
}: {
  job: MotionJob;
  onChange: () => void;
  favorite: boolean;
  showArchive: boolean;
  showRestore: boolean;
  onToggleFavorite: () => void;
  onArchive: () => void;
}) {
  const { request } = useKie(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [taskId, setTaskId] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/kie/motion/${job.id}/download${job.preserveInputAudio !== false ? "?originalAudio=true" : ""}`, {
        headers: connectionHeaders(),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download failed.");
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `motion-${job.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download video.");
    } finally {
      setBusy(false);
    }
  }
  const { key, provider } = useKie();
  const name = job.provider === "apimart" ? "APIMart" : "Kie";
  function connectionHeaders() {
    return { "x-motion-provider": provider, ...(key ? { [provider === "apimart" ? "x-apimart-key" : "x-kie-key"]: key } : {}) };
  }
  async function linkTask() {
    setBusy(true);
    setError("");
    try {
      await request(`/api/kie/motion/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link this task.");
    } finally {
      setBusy(false);
    }
  }
  const stateLabels: Record<string, string> = {
    uploading: "Uploading",
    submitting: "Submitting",
    waiting: "Queued",
    queuing: "Queued",
    generating: "Rendering",
    success: "Ready",
    fail: "Failed",
    submission_unknown: "Check provider tasks",
  };
  return (
    <article className="job-card">
      <div className="between">
        <div className="generation-title">
          <span className={`job-status ${job.state === "success" ? "completed" : job.state === "fail" ? "failed" : "processing"}`}>
            {stateLabels[job.state]}
          </span>
          <strong>{(job.taskId || job.id).slice(0, 10)}</strong>
        </div>
        <GenerationTime created={job.created} />
        <small>{job.label} · {job.resolution}</small>
        <div className="job-mode-row">
          <small>
            {job.mode === "first-frame"
              ? "First frame + reference"
              : "Reference image + video"}
          </small>
          <div className="job-card-tools">
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
      {pending.includes(job.state) && (
        <RenderPreview image={job.previewImage} state={job.state} />
      )}
      {job.state === "success" && job.resultUrls?.[0] && (
        <MotionResult job={job} />
      )}
      <div className="job-meta-row">
        {job.prompt && (
          <details className="job-prompt-details">
            <summary>Show prompt</summary>
            <p className="job-prompt">{job.prompt}</p>
            {(job.model === "wan" || job.model === "wan27r2v" || job.model === "wan27edit") && (
              <small className="job-prompt-seed">
                {typeof job.seed === "number" ? `Seed: ${job.seed}` : "Seed: not recorded"}
              </small>
            )}
          </details>
        )}
        <small className="real-label">
          {job.creditsConsumed !== undefined && !pending.includes(job.state)
            ? `Cost: ${formatCredits(job.creditsConsumed)} credits`
            : job.estimatedCredits !== undefined
              ? `Cost: ${formatMotionCredits(job.estimatedCredits, job.estimatedCurrency, 2, false)}`
              : "Cost: unavailable"}
          {" · "}
          <GenerationElapsed created={job.created} completedAt={job.state === "success" || job.state === "fail" ? job.completedAt ?? job.updated : undefined} />
        </small>
      </div>
      {job.error && <p className="error">{job.error}</p>}
      {(job.state === "submission_unknown" || job.needsRecovery) && (
        <div className="recover-task">
          <small>
            Check{" "}
            <a href={job.provider === "apimart" ? "https://apimart.ai" : "https://kie.ai/logs"} target="_blank" rel="noreferrer">
              {name} tasks
            </a>{" "}
            before submitting again. If a task exists, paste its ID to resume it
            without another charge.
          </small>
          <TextField
            label={`Existing ${name} task ID`}
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          />
          <Button
            secondary
            disabled={busy || !taskId.trim()}
            onClick={linkTask}
          >
            Link existing task
          </Button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="job-actions">
        {job.state === "success" && (
          <>
            <Button disabled={busy} onClick={download}>
              {busy ? "Downloading…" : "Download video"}
            </Button>
          </>
        )}
        <Button secondary onClick={onChange} disabled={busy}>
          Refresh status
        </Button>
      </div>
    </article>
  );
}
