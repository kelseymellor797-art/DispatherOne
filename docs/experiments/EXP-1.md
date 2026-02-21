# EXP-1

## 1) Approach philosophy
DOM-only unification: Esc behavior and weekly sizing are solved entirely in the React/CSS layer without introducing backend window-manager logic. The key difference is making the browser event pipeline and CSS variable contract the single authority.

Why this is NOT similar to others:
- Not similar to EXP-2: no Rust/native window command orchestration.
- Not similar to EXP-3: no state machine/event reducer.
- Not similar to EXP-4: no runtime measurement/ResizeObserver sizing loop.
- Not similar to EXP-5: no route-isolated shell split.

## 2) Files changed and why
- `src/App.tsx`
  - Added React capture fallback (`onKeyDownCapture` / `onKeyUpCapture`) for non-main windows.
  - Added `isEscapeReactEvent` and unified non-main Esc close callback usage.
  - Kept weekly drawer width based on static constants with 0.5rem margin policy.
- `src/styles.css`
  - Added CSS variables (`--weekly-grid-width`, `--weekly-grid-gap`, `--weekly-drawer-width`).
  - Rewired weekly drawer/grid hardcoded widths to variable-based single source.

## 3) Assumptions / risks
- Assumes DOM capture handlers receive Esc consistently when window is focused.
- Assumes static width policy is acceptable for all monitor scales.
- If native focus bypasses DOM events, Esc may still miss in edge cases.

## 4) How to test it
- `cmd /c npm run tauri dev`
- In app:
  1. Open weekly schedule drawer and press `Esc`.
  2. Open report/floating windows and press `Esc`.
  3. Verify weekly schedule grid has 0.5rem margins and drawer is not narrower than grid.
