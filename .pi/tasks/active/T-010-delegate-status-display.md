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

**Learnings (SDK investigation, 2026-09-19):**
- `renderCall`/`renderResult` are optional fields on `ToolDefinition` (pi-coding-agent `core/extensions/types.d.ts:351,353`). Signatures: `renderCall(args, theme, context) => Component`; `renderResult(result, options, theme, context) => Component`.
- `options.isPartial` (`ToolRenderResultOptions`) is `true` while the tool has not returned — this is the flag to branch on for the "running…" view.
- `context.lastComponent` is the previously returned component for this render slot; reuse it and call `.setText(...)` (do not allocate a new component each render). `context.args` holds the current tool-call args.
- `Text` component comes from `@mariozechner/pi-tui`: `new Text(text, 0, 0)` then `.setText(text)`.
- Reference pattern: built-in `read` tool (`core/tools/read.js`) — `renderCall`/`renderResult` both do `const text = context.lastComponent ?? new Text(""); text.setText(...); return text;`.
- `onUpdate` is `AgentToolUpdateCallback<TDetails> = (partialResult: AgentToolResult<TDetails>) => void` (pi-agent-core `types.d.ts:271`). `AgentToolResult<T> = { content: (TextContent|ImageContent)[], details: T }`. Already wired in `index.ts` (emits `onStatus` strings as text content).

**Design (2026-09-19) — RESOLVED, ready to build:**

*Confirmed (resolves the open question):* the TUI **does** re-invoke `renderResult` with `isPartial: true` after each `onUpdate` fires. Trace: `onUpdate(partial)` → SDK emits `tool_execution_update` → `interactive-mode.js` `case "tool_execution_update"` calls `component.updateResult({...partial, isError:false}, /*isPartial*/ true)` then `this.ui.requestRender()` → `tool-execution.js` `updateResult` → `updateDisplay()` (bg = `toolPendingBg` while partial) → `render(width)` → `resultRenderer(result, {isPartial:true}, theme, context)`. So the status/streaming line refreshes on every `onUpdate`.

*Single display channel.* The `onStatus` hook is the one "current display text" channel. The parent (`index.ts`) forwards it verbatim to `onUpdate` as text content. The executor owns the string and emits, in order: `"starting…"` (brief, before `session.prompt`) → the growing live transcript (see T-011) → `"done"` (terminal, all exit paths). No second hook — the transcript *is* the status line once it starts.

*Render hooks (index.ts):*
- `renderCall(args, theme, _ctx)`: the tool title. Reuse `context.lastComponent ?? new Text("")`, `.setText(...)`, return it. Text: `Delegate: <task snippet>` where the snippet is `args.task` truncated to ~40 chars (append `…` if cut). Style the `Delegate:` prefix with `theme.fg("toolTitle", theme.bold("Delegate"))` (mirrors the built-in `read` tool's `renderCall`).
- `renderResult(result, { isPartial }, theme, _ctx)`: reuse `context.lastComponent ?? new Text("")`, `.setText(result.content[0]?.text ?? "")`, return it. The text is the live display while `isPartial` and the final result when complete — the hook does not branch on `isPartial` for content (the SDK already paints the pending bg); it only renders whatever text is current. (Optional: dim/italic while partial; skip for now — keep small.)
- `Text` from `@mariozechner/pi-tui` (`new Text(text, 0, 0)`); `Theme`/`Component` types from `@mariozechner/pi-coding-agent`. Reference: built-in `read` tool (`core/tools/read.js`) and `examples/extensions/minimal-mode.ts`.

*Parent wiring (index.ts `execute`):* keep the existing `onStatus: (status) => onUpdate?.({ content: [{ type: "text", text: status }], details: undefined })`. No change needed — the richer strings flow through the same hook.

*Test compat:* the executor still calls `emit("done")` on every exit path (aborted early-return, scratch fail, session-start fail, classify-fail, success). `test/executor.test.ts` + `test/tool.test.ts` assert `onStatus` receives `"done"` (aborted path) — unchanged. The `emit("starting")` → `emit("starting…")` rename happens *after* the abort check, so the aborted-path tests are unaffected.

**Next:** (1) `index.ts`: add `renderCall` + `renderResult` (reuse `lastComponent`, `Text` from pi-tui). (2) `executor.ts`: `emit("starting…")` before `session.prompt` (keep `emit("done")` on all exits). (3) Run `npx vitest run` (baseline 39 passing). (4) T-011 layers the transcript on the same `onStatus` channel — build together, ship as one change.
