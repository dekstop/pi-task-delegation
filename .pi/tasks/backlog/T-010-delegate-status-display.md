# T-010: Status display while delegate is running

Show a status indicator in the Pi TUI while a delegate task is executing, so the user can see the delegate is working.

**Background:**
The `delegate` tool currently blocks with no visible feedback until the child session completes. The `onUpdate` callback is already wired in `index.ts` and the executor emits `"starting"` and `"done"` status strings, but there is no `renderCall`/`renderResult` to display them in the TUI.

**Scope:**
- Add a `renderCall` that shows a label (e.g. "Delegate: <task snippet>") while the tool is executing.
- Add a `renderResult` that checks `isPartial` and shows the current status text (e.g. "running…") while the tool has not yet returned.
- Extend the executor's `onStatus` callback to emit richer status strings (e.g. "child session starting", "child executing", "done") so the TUI has something meaningful to display.
- Keep the implementation small — no new modules, just the two render hooks in `index.ts` and a richer status string from `executor.ts`.

**Acceptance criteria:**
- While a delegate is running, the TUI shows a status line (not blank) in the tool row.
- The status updates at least once after the child session starts.
- On completion, the final result text replaces the status line.
- Existing tests still pass (unit tests don't exercise TUI rendering, but the executor status path is covered).

**Next:** None — single self-contained change.
