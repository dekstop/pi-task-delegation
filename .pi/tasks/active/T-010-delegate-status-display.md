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

**Built (2026-09-19):** `index.ts` has `renderCall` (`Delegate: <task ≤40 chars…>`, `theme.fg("toolTitle", theme.bold("Delegate"))` prefix, `lastComponent` reuse) and `renderResult` (renders `result.content[0]` text — live display while `isPartial`, final result on completion; no `isPartial` branch). `lastComponent` needs a `as Text | undefined` cast (SDK types it as the `Component` interface). `@mariozechner/pi-tui` added to devDependencies (direct import; matches pi-coding-agent's `^0.70.2`). `emit("starting…")` in place; `emit("done")` unchanged on all exits. `npx tsc --noEmit` clean, 39/39 tests pass. Also fixed a pre-existing typecheck error found while verifying: stale 3rd `cwd` arg on `createScratch(taskId, scratchConfig, cwd)` (scratch.ts takes 2 params since the tmpdir move) — removed; no runtime change.

**Next:** manual TUI check (shared with T-011) — status line + streaming transcript while a delegate runs, final result on completion.

**Debug 2026-09-20:** Status display mechanism works correctly — `renderCall` shows `Delegate: <task>` throughout, `renderResult` updates on each `onUpdate` (TUI shows pending bg while `isPartial`, normal bg on completion). The status message was displayed and the mechanism worked. The only issue was that the live transcript content was incomplete (missing bash tool output) — see T-011 for the fix. Scratch directory was created because the delegate call explicitly used `scope: "isolated"` and `scratch: "retain"`; the code defaults (`scope: "project"`, `scratchLifecycle: "ephemeral"`) are correct.
