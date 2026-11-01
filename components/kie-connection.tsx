"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
const SAVED_KEY = "clone.kie.api-key";
export function KieProvider({ children }: { children: React.ReactNode }) {
  const keyVersion = useRef(0);
  const [key, setKeyState] = useState(""),
    [configured, setConfigured] = useState(false),
    [connected, setConnected] = useState(false),
    [balance, setBalance] = useState<number | null>(null),
    [revision, setRevision] = useState(0);
  const request = useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
      const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, ...(key ? { "x-kie-key": key } : {}) },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new KieRequestError(response.status, data);
      return data as T;
    },
    [key],
  );
  useEffect(() => {
    let active = true;
    const version = keyVersion.current;
    const controller = new AbortController();
    async function restore() {
      let saved = "";
      try { saved = localStorage.getItem(SAVED_KEY)?.trim() ?? ""; } catch { /* Use the current page when storage is unavailable. */ }
      await Promise.resolve();
      if (!active || keyVersion.current !== version) return;
      if (saved) setKeyState(saved);
      const config = await fetch("/api/kie/config", { cache: "no-store", signal: controller.signal })
        .then((response) => response.json()).catch(() => ({ configured: false }));
      if (!active) return;
      setConfigured(config.configured === true);
      if (keyVersion.current !== version || (!saved && !config.configured)) return;
      const response = await fetch("/api/kie/config", {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: saved ? { "x-kie-key": saved } : {},
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
  }, []);
  const connect = useCallback(async () => {
    const version = keyVersion.current;
    const data = await request<{ credits: number }>("/api/kie/config", {
      method: "POST",
    });
    if (keyVersion.current !== version) return;
    setConnected(true);
    setBalance(data.credits);
    if (key) {
      try { localStorage.setItem(SAVED_KEY, key); } catch { /* Keep the current connection working. */ }
    }
  }, [request, key]);
  function setKey(v: string) {
    keyVersion.current += 1;
    try { localStorage.removeItem(SAVED_KEY); } catch { /* Storage may be disabled. */ }
    setKeyState(v.trim());
    setConnected(false);
    setBalance(null);
  }
  return (
    <Context.Provider
      value={{
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
        {!kie.configured || !!kie.key ? (
          <input aria-label="Kie API key" type="password" placeholder="Paste API key" autoComplete="off" spellCheck={false}
            value={kie.key} onChange={(event) => { kie.setKey(event.target.value); setError(""); }} />
        ) : <small>Server key configured</small>}
        <Button secondary type="button" disabled={busy || (!kie.key && !kie.configured)} onClick={connect}
          data-connected={kie.connected}
          aria-label={kie.connected ? "Connected, check Kie balance" : "Not connected, connect Kie"}
          title={kie.connected ? "Check Kie balance" : "Connect Kie"}>
          {busy ? "…" : kie.connected ? "Check" : "Connect"}
        </Button>
      </div>
      {kie.balance !== null && <small className="kie-balance">{kie.balance.toLocaleString()} credits</small>}
      {error && (
        <Modal title="Kie connection failed" closeLabel="Close" className="connection-error-modal" onClose={() => setError("")}>
          <p role="alert">{error}</p>
        </Modal>
      )}
    </section>
  );
}
