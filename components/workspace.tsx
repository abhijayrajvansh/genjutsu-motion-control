"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Asset, Job, records, removeRecord, saveRecord } from "@/lib/storage";
import { KieConnection, KieProvider } from "./kie-connection";
import { MotionHistory } from "./motion-history";
import { GenerationTime } from "./generation-time";
import { ArchiveButton, FavoriteButton } from "./favorite-button";
import { ThemeToggle } from "./theme-toggle";
import { AssetPreview, Button, Modal, useSaved } from "./controls";
import {
  ImageForm,
  MotionForm,
  Submission,
  ToolsForm,
  VideoForm,
} from "./forms";
const tabs = ["Motion Control"];
export function Workspace({ section = "generations" }: { section?: string }) {
  return (
    <KieProvider>
      <WorkspaceContent section={section} />
    </KieProvider>
  );
}
function WorkspaceContent({ section = "generations" }: { section?: string }) {
  const [savedTab, setTab] = useSaved("clone.generations.section", "Motion Control"),
    tab = tabs.includes(savedTab) ? savedTab : tabs[0],
    [menu, setMenu] = useState(""),
    [demo, setDemo] = useState(false),
    [credits, setCredits] = useState(0),
    [jobs, setJobs] = useState<Job[]>([]),
    [assets, setAssets] = useState<Asset[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<Asset | null>(null),
    [motionAsset, setMotionAsset] = useState<Asset | null>(null),
    [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [historyView, setHistoryView] = useSaved("clone.generations.view", "all");
  const [historyLayout, setHistoryLayout] = useSaved("clone.generations.layout", "grid");
  const [savedFavorites, setSavedFavorites] = useSaved("clone.generations.favorites", "[]");
  let favoriteIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(savedFavorites);
    if (Array.isArray(parsed)) favoriteIds = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // Ignore an invalid saved preference.
  }
  const [savedArchives, setSavedArchives] = useSaved("clone.generations.archives", "[]");
  let archiveIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(savedArchives);
    if (Array.isArray(parsed)) archiveIds = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // Ignore an invalid saved preference.
  }
  const historyViews = ["all", "favorites", "archives"] as const;
  const activeView = historyViews.includes(historyView as (typeof historyViews)[number])
    ? (historyView as (typeof historyViews)[number])
    : "all";
  const visibleJobs = jobs.filter((job) => {
    const isArchived = archiveIds.includes(job.id);
    if (activeView === "archives") return isArchived;
    if (isArchived) return false;
    return activeView === "favorites" ? favoriteIds.includes(job.id) : true;
  });
  function toggleFavorite(id: string) {
    setSavedFavorites(JSON.stringify(favoriteIds.includes(id) ? favoriteIds.filter((value) => value !== id) : [...favoriteIds, id]));
  }
  function archiveGeneration(id: string) {
    setSavedArchives(JSON.stringify(archiveIds.includes(id) ? archiveIds.filter((value) => value !== id) : [...archiveIds, id]));
  }
  useEffect(() => {
    // Hydrate local-only workspace settings after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDemo(localStorage.getItem("clone.demo") === "true");
    setCredits(Number(localStorage.getItem("clone.credits") ?? "0"));
    setReady(true);
  }, []);
  useEffect(() => {
    function close(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu("");
    }
    function outside(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setMenu("");
    }
    window.addEventListener("keydown", close);
    document.addEventListener("click", outside);
    return () => {
      window.removeEventListener("keydown", close);
      document.removeEventListener("click", outside);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    async function load() {
      try {
        const [j, a] = await Promise.all([
          records<Job>("jobs"),
          records<Asset>("assets"),
        ]);
        const now = Date.now();
        const updated = await Promise.all(
          j
            .filter((x) => now - x.created < 86400000)
            .map(async (x) => {
              if (x.status === "processing" && now - x.created > 3500) {
                const y = { ...x, status: "completed" as const };
                await saveRecord("jobs", y);
                return y;
              }
              return x;
            }),
        );
        if (live) {
          setJobs(updated.sort((x, y) => y.created - x.created));
          setAssets(a);
        }
      } catch {
        if (live)
          setNotice(
            "Browser storage is unavailable. Enable local storage to keep uploads and generations.",
          );
      }
    }
    void load();
    const t = setInterval(load, 1500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [ready]);
  function toggleDemo() {
    const next = !demo;
    setDemo(next);
    setCredits(next ? 1000 : 0);
    localStorage.setItem("clone.demo", String(next));
    localStorage.setItem("clone.credits", next ? "1000" : "0");
    setNotice(
      next
        ? "Demo mode enabled. Generations preview your uploaded media; no files or API keys leave this browser."
        : "Demo mode disabled.",
    );
    setMenu("");
  }
  async function submit(s: Submission) {
    if (!demo) {
      setNotice(
        "Enable demo mode in the account menu to preview a generation.",
      );
      return;
    }
    setBusy(true);
    try {
      const job: Job = {
        id: crypto.randomUUID(),
        model: s.model,
        kind: s.kind,
        prompt: s.prompt,
        assetId: s.asset.id,
        created: Date.now(),
        status: "processing",
        demo: true,
      };
      await saveRecord("jobs", job);
      setJobs((j) => [job, ...j]);
      setAssets((a) =>
        a.some((x) => x.id === s.asset.id) ? a : [...a, s.asset],
      );
      if (s.kind === "Images" || s.kind === "Motion Control") {
        const c = Math.max(0, credits - 10);
        setCredits(c);
        localStorage.setItem("clone.credits", String(c));
      }
    } catch {
      setNotice("Could not save the generation. Check your browser storage.");
    } finally {
      setBusy(false);
    }
  }
  async function deleteJob(job: Job) {
    try {
      await removeRecord("jobs", job.id);
      setJobs((j) => j.filter((x) => x.id !== job.id));
    } catch {
      setNotice("Could not remove this generation.");
    }
  }
  function download(a: Asset) {
    const url = URL.createObjectURL(a.blob),
      el = document.createElement("a");
    el.href = url;
    el.download = a.name;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const props = { demo, credits, busy, onSubmit: submit };
  return (
    <>
      <header className="site-header" ref={root}>
        <div className="header-inner">
          <Link href="/generations" className="brand">
            <img src="/logo-160.png" alt="" width="26" height="26" />
            <strong>Aiorbust</strong>
          </Link>
          <nav className="desktop-nav">
            <Link
              href="/generations"
              className={section === "generations" ? "active" : ""}
            >
              Easy Generations
            </Link>
          </nav>
          <div className="header-kie-connection">
            <KieConnection />
          </div>
          <div className="header-end">
            <ThemeToggle />
            <button
              className="mobile-toggle"
              aria-label="Menu"
              aria-expanded={menu === "mobile"}
              onClick={() => setMenu(menu === "mobile" ? "" : "mobile")}
            >
              ☰
            </button>
          </div>
        </div>
        {menu === "mobile" && (
          <nav className="mobile-nav">
            {[["generations", "Easy Generations"]].map(
              ([url, label]) => (
                <Link href={`/${url}`} key={url}>
                  {label}
                  {url !== "generations" && <em>Premium</em>}
                </Link>
              ),
            )}
          </nav>
        )}
      </header>
      <main className="main-content">
        {section === "generations" ? (
          <div className="dashboard">
            <div className="workspace-grid">
              <section className="controls-column">
                <div
                  className="tabs"
                  role="tablist"
                  aria-label="Generation type"
                >
                  {tabs.map((t, i) => (
                    <button
                      key={t}
                      id={`tab-${i}`}
                      role="tab"
                      aria-selected={tab === t}
                      aria-controls={`panel-${i}`}
                      tabIndex={tab === t ? 0 : -1}
                      onClick={() => setTab(t)}
                      onKeyDown={(e) => {
                        if (
                          ["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                            e.key,
                          )
                        ) {
                          e.preventDefault();
                          const n =
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? 3
                                : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
                          setTab(tabs[n]);
                          document.getElementById(`tab-${n}`)?.focus();
                        }
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {tabs.map((t, i) => (
                  <div
                    role="tabpanel"
                    id={`panel-${i}`}
                    aria-labelledby={`tab-${i}`}
                    hidden={tab !== t}
                    key={t}
                  >
                    {t === "Motion Control" ? (
                      <MotionForm
                        {...props}
                        initialVideo={motionAsset}
                        key={motionAsset?.id ?? "motion"}
                      />
                    ) : t === "Video Gen" ? (
                      <VideoForm {...props} />
                    ) : t === "Images" ? (
                      <ImageForm {...props} />
                    ) : (
                      <ToolsForm
                        {...props}
                        onUseMotion={(a) => {
                          setMotionAsset(a);
                          setTab("Motion Control");
                          setNotice(
                            "Choose your reference image and reuse this clip from the upload library.",
                          );
                        }}
                      />
                    )}
                  </div>
                ))}
              </section>
              <section className={`history-column ${historyLayout === "list" ? "history-list" : "history-grid"}`}>
                <div className="history-heading">
                  <h2>Your generations</h2>
                  <div className="history-view-toggle" role="group" aria-label="Generation view">
                    <button type="button" aria-pressed={historyLayout !== "list"} onClick={() => setHistoryLayout("grid")}>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="12" y="2" width="6" height="6" rx="1" /><rect x="2" y="12" width="6" height="6" rx="1" /><rect x="12" y="12" width="6" height="6" rx="1" /></svg>
                      Grid
                    </button>
                    <button type="button" aria-pressed={historyLayout === "list"} onClick={() => setHistoryLayout("list")}>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 4h11M7 10h11M7 16h11M2 4h1M2 10h1M2 16h1" /></svg>
                      List
                    </button>
                  </div>
                </div>
                <div className="tabs history-tabs" role="tablist" aria-label="Generation history"
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const index = historyViews.indexOf(activeView);
                    const next = event.key === "Home" ? "all" : event.key === "End" ? "archives" : historyViews[(index + (event.key === "ArrowRight" ? 1 : historyViews.length - 1)) % historyViews.length];
                    setHistoryView(next);
                    document.getElementById(`history-tab-${next}`)?.focus();
                  }}
                >
                  {[["all", "All generations"], ["favorites", "Favorites"], ["archives", "Archives"]].map(([value, label]) => (
                    <button type="button" key={value} role="tab" id={`history-tab-${value}`} aria-selected={activeView === value} aria-controls="history-panel" tabIndex={activeView === value ? 0 : -1} onClick={() => setHistoryView(value)}>{label}</button>
                  ))}
                </div>
                <div id="history-panel" role="tabpanel" aria-labelledby={`history-tab-${activeView}`}>
                <MotionHistory showEmpty={visibleJobs.length === 0} favorites={favoriteIds} archived={archiveIds} view={activeView} onToggleFavorite={toggleFavorite} onArchive={archiveGeneration} />
                {visibleJobs.length > 0 && (
                  <div className="job-list">
                    {visibleJobs.map((j) => {
                      const a = assets.find((x) => x.id === j.assetId);
                      return (
                        <article key={j.id} className="job-card">
                          <div className="between">
                            <div>
                              <div className="generation-title">
                                <FavoriteButton active={favoriteIds.includes(j.id)} onClick={() => toggleFavorite(j.id)} />
                                <strong>{j.id.slice(0, 10)}</strong>
                              </div>
                              <small>{j.model}</small>
                              <small>
                                {j.kind}
                              </small>
                            </div>
                            <GenerationTime created={j.created} />
                          </div>
                          <div className="job-card-tools">
                          <span className={`job-status ${j.status}`}>
                            {j.status === "processing" ? "Processing…" : "Ready"}
                          </span>
                          {activeView === "all" && <ArchiveButton onClick={() => archiveGeneration(j.id)} />}
                          {activeView === "archives" && <button type="button" className="text-button" onClick={() => archiveGeneration(j.id)}>Restore</button>}
                          </div>
                          {j.status === "processing" ? (
                            <div className="processing">
                              <span className="spinner" />
                              Preparing your local preview…
                            </div>
                          ) : (
                            a && (
                              <button
                                className="job-media"
                                aria-label={`Open ${a.name}`}
                                onClick={() => setPreview(a)}
                              >
                                <AssetPreview asset={a} />
                              </button>
                            )
                          )}
                          {j.prompt && (
                            <details className="job-prompt-details">
                              <summary>Show prompt</summary>
                              <p className="job-prompt">{j.prompt}</p>
                            </details>
                          )}
                          <small className="demo-label">
                            Demo preview · original uploaded media
                          </small>
                          <div className="job-actions">
                            {j.status === "completed" && a && (
                              <Button secondary onClick={() => download(a)}>
                                Download
                              </Button>
                            )}
                            {a && a.type.startsWith("image/") && (
                              <Button
                                secondary
                                onClick={() => {
                                  setTab("Motion Control");
                                  setNotice(
                                    "Your image is available under Already here in the reference image picker.",
                                  );
                                }}
                              >
                                Use in Motion Control
                              </Button>
                            )}
                            <button
                              className="text-button"
                              aria-label={`Delete ${j.model} generation`}
                              onClick={() => void deleteJob(j)}
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <SecondaryPage
            section={section}
            demo={demo}
            toggleDemo={toggleDemo}
          />
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          <div className="full-preview">
            <AssetPreview asset={preview} controls />
          </div>
          <Button onClick={() => download(preview)}>Download</Button>
        </Modal>
      )}
    </>
  );
}
function SecondaryPage({
  section,
  demo,
  toggleDemo,
}: {
  section: string;
  demo: boolean;
  toggleDemo: () => void;
}) {
  const names: Record<string, string> = {
    deploy: "Deploy",
    automations: "Automations",
    course: "Courses",
    training: "Character training",
    "dataset-creation": "Dataset Creation",
    captions: "Caption Generator",
    pricing: "Credits",
    account: "Your account",
    terms: "Terms of use",
    privacy: "Privacy policy",
  };
  return (
    <section className="secondary-page">
      <Link href="/generations" className="back-link">
        ← Easy Generations
      </Link>
      <h1>{names[section]}</h1>
      {section === "account" ? (
        <>
          <p>
            This workspace runs locally on your computer. Uploads and preview
            jobs are stored in this browser.
          </p>
          <Button onClick={toggleDemo}>
            {demo ? "Disable demo mode" : "Enable demo mode"}
          </Button>
          <small>
            Demo mode adds 1,000 local credits and lets you preview the
            generation workflow using your original uploads.
          </small>
        </>
      ) : section === "terms" || section === "privacy" ? (
        <>
          <p>
            This is a local, independently reconstructed interface for
            development and review. It is not the original Aiorbust service.
          </p>
          <p>
            Files and generation previews stay in this browser’s IndexedDB.
            Motion Control sends selected media and your key through the local
            server to Kie when you connect or generate. Successfully connected Kie
            keys are saved in this browser’s local storage. Other API key fields
            remain in memory. External signup and community links open the named
            third-party services.
          </p>
          <p>
            For the original service’s policies, visit{" "}
            <a
              href={`https://aiorbust.ai/${section}`}
              target="_blank"
              rel="noreferrer"
            >
              aiorbust.ai/{section}
            </a>
            .
          </p>
        </>
      ) : (
        <>
          <div className="premium-badge">Premium</div>
          <p>
            {section === "pricing"
              ? "Real credits and billing belong to the original service. This local clone includes a free demo mode."
              : "This feature is available to Aiorbust community members. Join the community to unlock Deploy, Automations, Character Models and Courses."}
          </p>
          <a
            className="button"
            href="https://www.skool.com/aiorbust"
            target="_blank"
            rel="noreferrer"
          >
            Join the Aiorbust community ↗
          </a>
          <Button secondary onClick={toggleDemo}>
            {demo ? "Disable demo mode" : "Try local demo mode"}
          </Button>
        </>
      )}
    </section>
  );
}
