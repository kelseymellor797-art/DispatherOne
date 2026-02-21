# EXP-2

## 1) Approach philosophy
Native window orchestration: Esc closure for non-main windows is driven by Tauri global shortcut registration (`Escape`) instead of relying on DOM bubbling/capture. Weekly sizing is treated as window-constraint first, with content fitted inside via inner section padding.

Why this is NOT similar to others:
- Not similar to EXP-1: Esc handling is native shortcut registration, not DOM-capture-first.
- Not similar to EXP-3: no reducer/state-machine for window intents.
- Not similar to EXP-4: no runtime measurement loop (`ResizeObserver`/`scrollWidth`).
- Not similar to EXP-5: no route/shell decomposition.

## 2) Files changed and why
- `src/App.tsx`
  - Added `@tauri-apps/plugin-global-shortcut` integration.
  - Registered `Escape` shortcut in non-main windows to close current window via native path.
  - Kept DOM Esc listeners only for non-Tauri fallback.
  - Switched weekly grid sizing to section-inner-padding fit model.
- `src/styles.css`
  - Weekly schedule grid now fills section width (`100%`) while section applies 8px padding.
  - Weekly drawer fixed at `1076px` for native width contract.

## 3) Assumptions / risks
- Assumes global shortcut plugin is available and `Escape` can be registered at runtime.
- Shortcut registration can conflict if another window/process already owns `Escape`.
- Web fallback still depends on DOM listeners.

## 4) How to test it
- `cmd /c npm run tauri dev`
- In app:
  1. Open drawer/report/floating windows and press `Esc`.
  2. Confirm non-main windows close via native shortcut.
  3. Open weekly schedule and verify drawer width is not narrower than the grid with 0.5rem side spacing.
