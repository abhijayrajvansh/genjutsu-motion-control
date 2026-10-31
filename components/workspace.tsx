"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Asset, Job, records, removeRecord, saveRecord } from "@/lib/storage";
import { KieProvider } from "./kie-connection";
import { MotionHistory } from "./motion-history";
import { AssetPreview, Button, Modal, useSaved } from "./controls";
import {
  ImageForm,
  MotionForm,
  Submission,
  ToolsForm,
  VideoForm,
} from "./forms";
const nav = [
  ["deploy", "Deploy"],
  ["automations", "Automations"],
  ["course", "Courses"],
];
const characters = [
  ["training", "Training"],
  ["dataset-creation", "Dataset Creation"],
  ["captions", "Caption Generator"],
];
const tabs = ["Motion Control", "Video Gen", "Images", "Tools"];
export function Workspace({ section = "generations" }: { section?: string }) {
  return (
    <KieProvider>
      <WorkspaceContent section={section} />
    </KieProvider>
  );
}
function WorkspaceContent({ section = "generations" }: { section?: string }) {
  const [tab, setTab] = useSaved("clone.generations.section", "Motion Control"),
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
      <div className="cost-banner">
        Always check your RunPod and Vast.ai containers and terminate them when
        you’re done — they keep incurring charges until you stop them.
      </div>
      <div className="experimental-banner">
        <span>This platform is experimental and under active development.</span>{" "}
        Things change constantly. If something does not work, ask in{" "}
        <a href="https://discord.gg/aiorbust" target="_blank" rel="noreferrer">
          our Discord
        </a>
        .
      </div>
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
            {nav.slice(0, 2).map(([url, label]) => (
              <Link
                href={`/${url}`}
                key={url}
                className={`premium-link ${section === url ? "active" : ""}`}
              >
                <span>Premium</span>
                {label}
              </Link>
            ))}
            <div className="nav-group">
              <button
                className="premium-link character"
                aria-expanded={menu === "characters"}
                onClick={() =>
                  setMenu(menu === "characters" ? "" : "characters")
                }
              >
                <span>Premium</span>Character Models <Chevron />
              </button>
              {menu === "characters" && (
                <div className="dropdown">
                  {characters.map(([url, label]) => (
                    <Link
                      href={`/${url}`}
                      key={url}
                      onClick={() => setMenu("")}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link href="/course" className="premium-link">
              <span>Premium</span>Courses
            </Link>
            <a
              className="plan-pill"
              href="https://www.skool.com/aiorbust"
              target="_blank"
              rel="noreferrer"
            >
              Free plan <em>Upgrade</em>
            </a>
          </nav>
          <div className="header-end">
            <button
              className="mobile-toggle"
              aria-label="Menu"
              aria-expanded={menu === "mobile"}
              onClick={() => setMenu(menu === "mobile" ? "" : "mobile")}
            >
              ☰
            </button>
            <div className="account-wrap">
              <button
                className="account-button"
                aria-haspopup="menu"
                aria-expanded={menu === "account"}
                onClick={() => setMenu(menu === "account" ? "" : "account")}
              >
                <span>
                  <em>{credits}</em> {demo ? "demo credits" : "credits"}
                </span>
                <span className="avatar">H</span>
                <Chevron />
              </button>
              {menu === "account" && (
                <div className="dropdown account-menu" role="menu">
                  <div className="account-label">
                    Local workspace<small>Free plan</small>
                  </div>
                  <Link role="menuitem" href="/account">
                    Account
                  </Link>
                  <Link role="menuitem" href="/pricing">
                    Buy credits
                  </Link>
                  <a
                    role="menuitem"
                    href="https://www.skool.com/aiorbust"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join the community ↗
                  </a>
                  <hr />
                  <button role="menuitem" onClick={toggleDemo}>
                    {demo ? "Disable demo mode" : "Enable demo mode"}
                  </button>
                  <small className="menu-note">
                    Local preview only. No AI provider connected.
                  </small>
                </div>
              )}
            </div>
          </div>
        </div>
        {menu === "mobile" && (
          <nav className="mobile-nav">
            {[["generations", "Easy Generations"], ...nav, ...characters].map(
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
            <div className="retention-notice">
              <strong>Download the videos you want to keep.</strong>{" "}
              <span>
                Kie uploads are temporary, and result links can expire. Real job
                records are saved on this computer. Your Kie renders also appear
                in{" "}
                <a href="https://kie.ai/logs" target="_blank" rel="noreferrer">
                  kie.ai/logs
                </a>
                .
              </span>
            </div>
            <section className="account-callout">
              <h2>Bring your own kie.ai or WaveSpeed account</h2>
              <p>
                Official H3, Seedance 2.0, Seedance 2.5 and Wan 3 render on your
                own account rather than ours. They are the two hosts worth
                using:{" "}
                <strong>
                  cheaper per render than the big platforms, and uncensored
                </strong>{" "}
                — which for most of what gets made here is the difference
                between a result and a refusal. You pay them directly for the
                render, and we charge nothing on top for Seedance or Wan.
              </p>
              <div className="signup-links">
                <a
                  className="button"
                  href="https://kie.ai"
                  target="_blank"
                  rel="noreferrer"
                >
                  Sign up at kie.ai
                </a>
                <a
                  className="button secondary"
                  href="https://wavespeed.ai"
                  target="_blank"
                  rel="noreferrer"
                >
                  Sign up at WaveSpeed
                </a>
              </div>
              <small>
                Either works — you only need one. Your key is used to start the
                render and is never stored on our side.
              </small>
            </section>
            {demo && (
              <div className="demo-notice" role="status">
                Demo mode · Previews use your original uploads. No AI rendering
                or external requests.
              </div>
            )}
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
              <section className="history-column">
                <h2>Your generations</h2>
                <MotionHistory showEmpty={jobs.length === 0} />
                {jobs.length > 0 && (
                  <div className="job-list">
                    {jobs.map((j) => {
                      const a = assets.find((x) => x.id === j.assetId);
                      return (
                        <article key={j.id} className="job-card">
                          <div className="between">
                            <div>
                              <strong>{j.model}</strong>
                              <small>
                                {j.kind} ·{" "}
                                {new Date(j.created).toLocaleString()}
                              </small>
                            </div>
                            <span className={`job-status ${j.status}`}>
                              {j.status === "processing"
                                ? "Processing…"
                                : "Ready"}
                            </span>
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
                          {j.prompt && <p className="job-prompt">{j.prompt}</p>}
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
      <footer>
        <Link href="/terms">Terms of use</Link> ·{" "}
        <Link href="/privacy">Privacy policy</Link>
      </footer>
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
function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="currentColor"
    >
      <path d="m5.23 7.21 4.77 4.77 4.77-4.77-1.06-1.06L10 9.63 6.29 6.15z" />
    </svg>
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
            server to Kie when you connect or generate. Other API key fields are
            held in memory. External signup and community links open the named
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
