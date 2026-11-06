"use client";
import { useState } from "react";
import { createPortal } from "react-dom";

type Spot = { top: number; left: number; width: number; height: number };

// Purely visual: covers the page with a black layer. The app underneath stays mounted and running.
export function HideUiToggle() {
  const [spot, setSpot] = useState<Spot | null>(null);
  return (
    <>
      <button
        type="button"
        className="hide-ui-toggle"
        aria-pressed={false}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setSpot({ top: r.top, left: r.left, width: r.width, height: r.height });
        }}
      >
        Hide UI
      </button>
      {spot &&
        createPortal(
          <div className="hide-ui-overlay">
            <button
              type="button"
              className="hide-ui-toggle"
              aria-pressed
              autoFocus
              style={{ position: "fixed", ...spot }}
              onClick={() => setSpot(null)}
            >
              Show UI
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
