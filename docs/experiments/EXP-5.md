# EXP-5

## 1) Approach philosophy
Route-isolated shell behavior: each window mode (`drawer`, `floating`, `report`, `main`) is treated as its own shell contract via mode classes and shell-local keyboard focus. Esc handling is owned by the shell container itself instead of global window listeners.

Why this is NOT similar to others:
- Not similar to EXP-1: not global DOM listener/capture as primary mechanism.
- Not similar to EXP-2: no native global shortcut registration.
- Not similar to EXP-3: no reducer/state-machine intent dispatch layer.
- Not similar to EXP-4: no adaptive runtime resize loop as core sizing mechanism.

## 2) Files changed and why
- `src/App.tsx`
  - Added `windowModeClass` classification for route/window mode shells.
  - Removed global Esc listener effect for non-main windows.
  - Added shell-focus effect and shell-local Esc capture handlers via `ref` + `tabIndex`.
  - Weekly schedule branch now relies on shell/CSS classes rather than inline per-element width styles.
- `src/styles.css`
  - Added explicit shell class rules for weekly drawer width and non-main shell focus outline behavior.

## 3) Assumptions / risks
- Assumes shell root focus is reliably acquired on mount.
- If focus is stolen by embedded controls instantly, Esc may require a second press in edge flows.
- CSS class contracts must stay in sync with mode class generation.

## 4) How to test it
- `cmd /c npm run tauri dev`
- In app:
  1. Open drawer/floating/report windows and press `Esc`.
  2. Verify shell-local Esc closes the window without global listener dependencies.
  3. Open weekly schedule and verify drawer shell width remains >= grid with 0.5rem spacing.
