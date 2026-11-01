"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MotionProvider } from "@/lib/motion-models";
import { Button, Modal } from "./controls";
export class KieRequestError extends Error {
  code?: string;
  generationStarted?: boolean;
  constructor(
    public status: number,
    data: { error?: unknown; code?: unknown; generationStarted?: boolean },
  ) {
    super(typeof data.error === "string" ? data.error : "The request failed.");
    this.code = typeof data.code === "string" ? data.code : undefined;
    this.generationStarted = data.generationStarted;
  }
}
type Connection = {
  provider: MotionProvider;
  setProvider: (provider: MotionProvider) => void;
  mediaReady: boolean;
  key: string;
  setKey: (key: string) => void;
  configured: boolean;
  connected: boolean;
  balance: number | null;
  revision: number;
  changed: () => void;
  request: <T>(url: string, init?: RequestInit) => Promise<T>;
  connect: () => Promise<void>;
};
const Context = createContext<Connection | null>(null);
const savedKey = (provider: MotionProvider) => `clone.${provider}.api-key`;
export function KieProvider({ children }: { children: React.ReactNode }) {
  const keyVersion = useRef(0);
  const [provider, setProviderState] = useState<MotionProvider>("kie");
  const [mediaReady, setMediaReady] = useState(true);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { if (localStorage.getItem("clone.motion.provider") === "apimart") setProviderState("apimart"); } catch { /* Browser storage unavailable. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const [key, setKeyState] = useState(""),
    [configured, setConfigured] = useState(false),
    [connected, setConnected] = useState(false),
    [balance, setBalance] = useState<number | null>(null),
    [revision, setRevision] = useState(0);
  const request = useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
      const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, "x-motion-provider": provider, ...(key ? { [provider === "apimart" ? "x-apimart-key" : "x-kie-key"]: key } : {}) },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new KieRequestError(response.status, data);
      return data as T;
    },
    [key, provider],
  );
  useEffect(() => {
    let active = true;
    const version = keyVersion.current;
    const controller = new AbortController();
    async function restore() {
      let saved = "";
      try { saved = localStorage.getItem(savedKey(provider))?.trim() ?? ""; } catch { /* Use the current page when storage is unavailable. */ }
      await Promise.resolve();
      if (!active || keyVersion.current !== version) return;
      setKeyState(saved);
      setConnected(false);
      setBalance(null);
      const config = await fetch(`/api/kie/config?provider=${provider}`, { cache: "no-store", signal: controller.signal })
        .then((response) => response.json()).catch(() => ({ configured: false }));
      if (!active) return;
      setConfigured(config.configured === true);
      setMediaReady(config.mediaReady === true);
      if (keyVersion.current !== version || (!saved && !config.configured)) return;
      const response = await fetch("/api/kie/config", {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "x-motion-provider": provider, ...(saved ? { [provider === "apimart" ? "x-apimart-key" : "x-kie-key"]: saved } : {}) },
      });
      const data = await response.json();
      if (!active || keyVersion.current !== version) return;
      setConnected(response.ok);
      setBalance(response.ok ? data.credits : null);
    }
    void restore().catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [provider]);
  const connect = useCallback(async () => {
    const version = keyVersion.current;
    const data = await request<{ credits: number | null }>("/api/kie/config", {
      method: "POST",
    });
    if (keyVersion.current !== version) return;
    setConnected(true);
    setBalance(data.credits);
    if (key) {
      try { localStorage.setItem(savedKey(provider), key); } catch { /* Keep the current connection working. */ }
    }
  }, [request, key, provider]);
  function setKey(v: string) {
    keyVersion.current += 1;
    try { localStorage.removeItem(savedKey(provider)); } catch { /* Storage may be disabled. */ }
    setKeyState(v.trim());
    setConnected(false);
    setBalance(null);
  }
  function setProvider(value: MotionProvider) {
    keyVersion.current += 1;
    setConnected(false); setBalance(null); setKeyState(""); setConfigured(false); setMediaReady(value === "kie");
    setProviderState(value);
    try { localStorage.setItem("clone.motion.provider", value); } catch { /* Browser storage unavailable. */ }
  }
  return (
    <Context.Provider
      value={{
        provider,
        setProvider,
        mediaReady,
        key,
        setKey,
        configured,
        connected,
        balance,
        revision,
        changed: () => setRevision((r) => r + 1),
        request,
        connect,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useKie() {
  const context = useContext(Context);
  if (!context) throw new Error("Kie connection is unavailable.");
  return context;
}
export function KieConnection() {
  const kie = useKie(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const name = kie.provider === "apimart" ? "APIMart" : "Kie";
  const balanceLabel = kie.balance === null ? "Unavailable" : kie.balance.toLocaleString("en-US", { maximumFractionDigits: 2 });
  async function connect() {
    setError("");
    setBusy(true);
    try {
      await kie.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Kie.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="kie-connection kie-compact">
      <div className="kie-key-row">
        <select aria-label="API provider" value={kie.provider} disabled={busy} onChange={(e) => { kie.setProvider(e.target.value as MotionProvider); setError(""); }}>
          <option value="kie">Kie</option><option value="apimart">APIMart</option>
        </select>
        {!kie.configured || !!kie.key ? (
          <input aria-label={`${name} API key`} type="password" placeholder="Paste API key" autoComplete="off" spellCheck={false}
            value={kie.key} onChange={(event) => { kie.setKey(event.target.value); setError(""); }} />
        ) : <small>Server key configured</small>}
        <Button secondary type="button" disabled={busy || (!kie.key && !kie.configured)} onClick={connect}
          data-connected={kie.connected}
          aria-label={kie.connected ? `${name} credits: ${balanceLabel}. Refresh balance` : `Connect ${name}`}
          title={kie.connected ? `Check ${name} credits` : `Connect ${name}`}>
          {busy ? "…" : kie.connected ? `Credits: ${balanceLabel}` : "Connect"}
        </Button>
      </div>
      {error && (
        <Modal title={`${name} connection failed`} closeLabel="Close" className="connection-error-modal" onClose={() => setError("")}>
          <p role="alert">{error}</p>
        </Modal>
      )}
    </section>
  );
}
