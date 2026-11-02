# Opening Frame Source Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline in the current workspace, as requested by the user's default workflow.

**Goal:** Add a persisted opening-frame source choice with live prompt guidance and preserve the driving-video request.

**Architecture:** Extend existing sourcing metadata, normalization and prompt generation. Reuse the existing radio renderer; add a regression test using Node's built-in test runner without dependencies.

**Tech Stack:** Next.js, React, TypeScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-02-opening-frame-source-design.md`

## Global Constraints

- Work on `wan-motion-control-v1` in the current workspace.
- Keep Wan 3 and reference-video mode. Opening-frame matching is prompt guidance only.
- Default old/malformed settings to Input video; preserve other source choices.
- No paid generation or production configuration changes.

## Review Focus

- Old settings must hydrate with a checked Input video opening choice.
- Image guidance must not leak into Video1 opening selection or freeze motion.
- All source combinations must fit the existing 2500-character prompt limit.
- The APIMart request must keep generation_type reference and video_urls.
- Manual override reset and reload persistence must continue to work.

### Task 1: Opening source control

Files: `lib/motion-sourcing.ts`, `components/final-output-sourcing.tsx`, `components/motion-workflow.tsx`, `README.md`, `package.json`, `tests/motion-opening-frame.test.mjs`.

- [x] Write tests for saved-setting fallback, opening-reference selection, prompt budget and retained provider video inputs. `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/motion-opening-frame.test.mjs`: four expected failures before implementation; old settings had no openingFrame and the prompt ignored the new choice.
- [x] Add openingFrame metadata defaulting to video, and emit its selected reference before motion instructions. Exclude it from the appearance list.
- [x] Show the radio with an explicit model-dependent guidance description. Update prompt version and README.
- [x] Run the full test suite, typecheck, lint and browser checks for selection/reset/reload. Native Chrome confirmed that Use default restores Image1 opening guidance after a manual edit.
- [x] Focused independent read-only review found no blocking or material findings; five regression tests passed independently. Commit and push are the final integration step authorized in the user's repository instructions.
