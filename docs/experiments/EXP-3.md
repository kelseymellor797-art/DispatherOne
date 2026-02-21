# EXP-3

## 1) Approach philosophy
State-machine window control: Esc does not close windows directly from handlers. Instead, handlers dispatch a close intent, and a centralized effect executes close based on current window role (`main|drawer|floating|report`). Weekly layout is consumed through a role-policy object.

Why this is NOT similar to others:
- Not similar to EXP-1: no direct DOM handler -> close call path; uses intent reducer.
- Not similar to EXP-2: no native global shortcut registration.
- Not similar to EXP-4: no runtime geometry measurement loop.
- Not similar to EXP-5: no route/component split by mode.

## 2) Files changed and why
- `src/App.tsx`
  - Added reducer-driven window intent model (`ESC_CLOSE_REQUESTED`).
  - Added role classification (`WindowRole`) and centralized close effect.
  - Reworked Esc listeners and React capture handlers to dispatch intents.
  - Added `windowLayoutPolicy` object for weekly layout consumption.

## 3) Assumptions / risks
- Assumes intent dispatch and close effect timing remain deterministic under repeated key events.
- Adds abstraction complexity for future contributors.
- If role inference is wrong, close intent can target wrong behavior.

## 4) How to test it
- `cmd /c npm run tauri dev`
- In app:
  1. Open each non-main window type and press `Esc` repeatedly.
  2. Verify each Esc triggers exactly one close action.
  3. Open weekly schedule and verify grid remains contained with 0.5rem spacing.
