# EXP-4

## 1) Approach philosophy
Runtime measurement + adaptive sizing: the weekly drawer width is not trusted from constants alone. Instead, the grid is measured live (`scrollWidth`) and the Tauri window width/constraints are adjusted to match required space. Esc close uses low-level capture listeners with debounce guard to avoid duplicate close attempts.

Why this is NOT similar to others:
- Not similar to EXP-1: this is measurement-driven adaptive sizing, not static CSS-variable contract.
- Not similar to EXP-2: no native global shortcut plugin usage.
- Not similar to EXP-3: no reducer/state-machine intent dispatch.
- Not similar to EXP-5: no mode-based route/component split.

## 2) Files changed and why
- `src/App.tsx`
  - Removed reducer-based Esc dispatch flow.
  - Added debounced direct Esc close for non-main windows.
  - Added `weeklyGridRef` and `ResizeObserver` effect to measure grid and resize weekly drawer window dynamically.
  - Attached `ref` to weekly schedule grid.

## 3) Assumptions / risks
- Assumes `ResizeObserver` availability in runtime webview.
- Frequent remeasure/reflow could be expensive on low-end hardware.
- Dynamic width changes may look jumpy if grid contents change rapidly.

## 4) How to test it
- `cmd /c npm run tauri dev`
- In app:
  1. Open weekly schedule drawer and verify width auto-fits measured grid.
  2. Resize/zoom and confirm drawer remains at least as wide as grid+margin.
  3. Press `Esc` in non-main windows and verify single close action.
