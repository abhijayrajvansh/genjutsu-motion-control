"use client";
import { useEffect, useState } from "react";

export function GenerationElapsed({ created, completedAt }: { created: number; completedAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (completedAt !== undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [completedAt]);
  const seconds = Math.max(0, Math.floor(((completedAt ?? now) - created) / 1000));
  const label = completedAt === undefined ? "elapsed" : "total";
  return <span className="generation-elapsed" aria-label={`${seconds} seconds ${label}`}>{seconds}s {label}</span>;
}

export function GenerationTime({ created }: { created: number }) {
  const date = new Date(created);
  return (
    <time className="generation-time" dateTime={date.toISOString()}>
      <span>{date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}</span>
      <span>
        {date.toLocaleTimeString("en-US", {
          timeZone: "Asia/Kolkata",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })} IST
      </span>
    </time>
  );
}
