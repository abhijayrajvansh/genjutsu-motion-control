"use client";
import { useEffect, useState } from "react";
import { formatCredits } from "@/lib/motion-pricing";
import { MotionJob } from "@/lib/motion-models";
import { useKie } from "./kie-connection";
import { Button, TextField } from "./controls";
const pending = ["uploading", "submitting", "waiting", "queuing", "generating"];
export function MotionHistory({ showEmpty = true }: { showEmpty?: boolean }) {
  const { connected, request, revision } = useKie(),
    [jobs, setJobs] = useState<MotionJob[]>([]),
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
          setJobs(updated);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load Kie history.",
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
  return (
    <div className="motion-history">
      {!connected ? (
        <div className="empty-history">
          Connect your Kie API key in Motion Control to view and resume real
          generations.
        </div>
      ) : !jobs.length && showEmpty ? (
        <div className="empty-history">
          No Kie generations yet. Load the two-second trial or upload your own
          reference image and driving video.
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
          jobs.map((job) => (
            <MotionCard
              key={job.id}
              job={job}
              onChange={() => setRefresh((r) => r + 1)}
            />
          ))}
      </div>
    </div>
  );
}
function MotionCard({
  job,
  onChange,
}: {
  job: MotionJob;
  onChange: () => void;
}) {
  const { request } = useKie(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [taskId, setTaskId] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/kie/motion/${job.id}/download`, {
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
  const { key } = useKie();
  function connectionHeaders() {
    return key ? { "x-kie-key": key } : undefined;
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
    submission_unknown: "Check Kie logs",
  };
  return (
    <article className="job-card">
      <div className="between">
        <div>
          <strong>
            {job.label} · {job.seconds}s · {job.resolution}
          </strong>
          <small>
            {job.mode === "first-frame"
              ? "First frame + reference"
              : "Reference image + video"}{" "}
            · {new Date(job.created).toLocaleString()}
          </small>
        </div>
        <span
          className={`job-status ${job.state === "success" ? "completed" : job.state === "fail" ? "failed" : "processing"}`}
        >
          {stateLabels[job.state]}
        </span>
      </div>
      {pending.includes(job.state) && (
        <div className="processing">
          <span className="spinner" />
          {job.state === "uploading" || job.state === "submitting"
            ? "Uploading / submitting to Kie…"
            : "Your video is rendering on Kie. You can leave and return."}
        </div>
      )}
      {job.state === "success" && job.resultUrls?.[0] && (
        <video
          className="real-result"
          src={job.resultUrls[0]}
          controls
          playsInline
          preload="metadata"
        />
      )}
      {job.prompt && (
        <details className="job-prompt-details">
          <summary>Show prompt</summary>
          <p className="job-prompt">{job.prompt}</p>
        </details>
      )}
      <small className="real-label">
        {job.creditsConsumed !== undefined
          ? `Kie cost: ${formatCredits(job.creditsConsumed)} credits`
          : job.estimatedCredits !== undefined
            ? `Kie cost: ~${formatCredits(job.estimatedCredits)} credits (estimated)`
            : "Kie cost: unavailable"}
      </small>
      {job.taskId && <small className="task-id">Kie task: {job.taskId}</small>}
      {job.error && <p className="error">{job.error}</p>}
      {(job.state === "submission_unknown" || job.needsRecovery) && (
        <div className="recover-task">
          <small>
            Check{" "}
            <a href="https://kie.ai/logs" target="_blank" rel="noreferrer">
              Kie logs
            </a>{" "}
            before submitting again. If a task exists, paste its ID to resume it
            without another charge.
          </small>
          <TextField
            label="Existing Kie task ID"
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
            <a
              className="button secondary"
              href={job.resultUrls?.[0]}
              target="_blank"
              rel="noreferrer"
            >
              Open original ↗
            </a>
          </>
        )}
        <Button secondary onClick={onChange} disabled={busy}>
          Refresh status
        </Button>
      </div>
    </article>
  );
}
