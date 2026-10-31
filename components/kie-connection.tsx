"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button, TextField } from "./controls";
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
export function KieProvider({ children }: { children: React.ReactNode }) {
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
    fetch("/api/kie/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (active) {
          setConfigured(data.configured === true);
          setConnected(data.configured === true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const connect = useCallback(async () => {
    const data = await request<{ credits: number }>("/api/kie/config", {
      method: "POST",
    });
    setConnected(true);
    setBalance(data.credits);
  }, [request]);
  function setKey(v: string) {
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
    <section className="kie-connection">
      <div className="between">
        <h3>Kie API connection</h3>
        <span
          className={kie.connected ? "connected-label" : "disconnected-label"}
        >
          {kie.connected ? "Connected" : "Not connected"}
        </span>
      </div>
      {!kie.configured && (
        <TextField
          label="Kie API key"
          type="password"
          placeholder="Paste your key"
          autoComplete="off"
          spellCheck={false}
          value={kie.key}
          onChange={(e) => {
            kie.setKey(e.target.value);
            setError("");
          }}
          hint={
            <>
              Get your key from{" "}
              <a href="https://kie.ai/api-key" target="_blank" rel="noreferrer">
                kie.ai/api-key
              </a>
              . It stays in memory for this page and is sent only to this local
              server and Kie’s API/upload service.
            </>
          }
        />
      )}
      {kie.configured && (
        <small>
          A server key is configured in .env.local. Its value is never exposed
          to your browser.
        </small>
      )}
      <Button
        secondary
        type="button"
        disabled={busy || (!kie.key && !kie.configured)}
        onClick={connect}
      >
        {busy
          ? "Checking…"
          : kie.connected
            ? "Check Kie balance"
            : "Connect Kie"}
      </Button>
      {kie.balance !== null && (
        <small className="connected-label">
          Kie balance: {kie.balance.toLocaleString()} credits
        </small>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
