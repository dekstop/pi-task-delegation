# T-011: Live child output streaming in TUI

Stream the child session's intermediate output (assistant text, tool calls) into the parent TUI while a delegate is running.

**Background:**
Currently `executeChildTask` calls `await session.prompt(task)` and blocks until the child session completes. No intermediate messages are forwarded to the parent TUI. The Pi TUI supports streaming tool output via `onUpdate` (called during `execute`) and `renderResult` with `isPartial: true`.

**Scope:**
- Investigate the Pi SDK's `AgentSession` API for a message/event stream that can be tapped while `prompt()` is in flight. The session may expose an event emitter, a per-message callback, or a lower-level streaming API.
- If the SDK only resolves the final result from `prompt()`, consider polling `session.messages` on an interval as a fallback (less ideal but workable).
- Forward intermediate output via `onUpdate` in `index.ts` so the TUI can render it while `isPartial` is true.
- Add a `renderResult` handler that displays the streaming child output when `isPartial`, and the final result when complete.
- Keep the output concise — show tool calls as one-liners, stream assistant text as it arrives.

**Blockers / unknowns:**
- ~~Whether the Pi SDK exposes a per-message event stream on `AgentSession` outside of `prompt()`.~~ **RESOLVED (2026-09-19):** `AgentSession.subscribe(listener: AgentSessionEventListener): () => void` exists (pi-coding-agent `core/agent-session.d.ts:228`) and returns an unsubscribe fn. No polling needed. `session.messages` getter (`agent-session.d.ts:277`) remains a fallback.

**Learnings (SDK investigation, 2026-09-19):**
- `AgentSessionEvent = AgentEvent | {queue_update} | {compaction_start|end} | {auto_retry_start|end}` (`agent-session.d.ts:40`). `AgentSessionEventListener = (event: AgentSessionEvent) => void`.
- `AgentEvent` (pi-agent-core `types.d.ts:308`) fires during `prompt()`: `agent_start`, `agent_end`(messages), `turn_start`, `turn_end`(message, toolResults), `message_start`(message), `message_update`(message, `assistantMessageEvent`), `message_end`(message), `tool_execution_start`(toolCallId, toolName, args), `tool_execution_update`(…partialResult), `tool_execution_end`(toolCallId, toolName, result, isError).
- `message_update.assistantMessageEvent` is `AssistantMessageEvent` (pi-ai `types.d.ts:182`): `start`/`text_start`/`text_delta`/`text_end`/`thinking_start`/… — streams partial assistant text per delta.
- `tool_execution_start` gives `toolName` + `args` → one-liner per child tool call.
- `subscribe` must be unsubscribed (returned fn) before `session.dispose()` in the executor's `finally`.

**Design (2026-09-19) — RESOLVED, ready to build:**

*Event bridge — reuse the existing `onStatus` channel (no new hook).* The child `AgentSession` is created in `executeChildTask` (executor.ts); the parent's `onUpdate` is reached via the existing `onStatus` hook (`index.ts` → `runDelegateTask` → `executeChildTask`). No `onEvent`/`onStream` hook is added: the executor builds the live transcript and forwards it through `onStatus` (the same "current display text" channel T-010 uses). `tool.ts` `RunOptions` and `executor.ts` `ExecuteOptions` keep their single `onStatus` field — **no API change**, so `test/tool.test.ts` + `test/executor.test.ts` need no edits.

*Transcript building (executor.ts).* A local `let live = ""` accumulates the transcript; `session.subscribe(listener)` is called **after** `session = created.session` and **before** `await session.prompt(task)`. The listener:
- `event.type === "tool_execution_start"` → `live += (live ? "\n" : "") + "→ " + event.toolName` (one-liner per child tool call).
- `event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta"` → `live += event.assistantMessageEvent.delta` (stream assistant text as it arrives).
- any other event → ignored.

Natural event order yields a correct transcript: `→ bash`, `→ read`, then assistant text deltas.

*Coalescing/throttling.* `text_delta` fires per delta (many events). Use a 100 ms timer-based coalescer: a `scheduleFlush()` helper sets a `setTimeout(…, 100)` if none is pending; on fire it calls `onStatus?.(live)` and clears the timer. Each transcript mutation calls `scheduleFlush()`. After `session.prompt` resolves, clear any pending timer and do one final `onStatus?.(live)` flush so the last chunk is not lost. This caps `onUpdate` at ~10/s.

*Lifecycle.* `emit("starting…")` (the T-010 brief status) fires before `subscribe`/`prompt`. In the `finally` (before `session.dispose()`), call the `unsubscribe()` returned by `subscribe` and clear the timer. `emit("done")` stays on every exit path (test compat).

*Render.* Shares T-010's `renderResult` — no separate handler. While `isPartial`, `result.content[0].text` is the live transcript; on completion the final result replaces it (SDK swaps pending bg → normal). `renderCall` (T-010) shows the `Delegate: <task>` title throughout.

*No context leak.* The streaming path only feeds `onStatus` → `onUpdate` (TUI display); it never appends child messages to the parent LLM transcript. `executeChildTask` still returns only `extractFinalAssistantText` (final assistant text) — unchanged.

**Built (2026-09-19):** as designed — `live` + `scheduleFlush` (100 ms coalescer) in `executeChildTask`; `session.subscribe` listener after session creation, before `prompt` (`tool_execution_start` → `→ <toolName>` one-liner; `message_update` + `text_delta` → append `delta`); final flush after `prompt` (guarded: only when `live` non-empty, so an empty transcript can't blank the `starting…` line); unsubscribe + timer clear in `finally`; `emit("starting…")` before `prompt`; `emit("done")` unchanged on all exits. Event field names verified against `pi-agent-core`/`pi-ai` `.d.ts` (`message_update.assistantMessageEvent.type === "text_delta"`, `.delta`; `tool_execution_start.toolName`). `npx tsc --noEmit` clean, 39/39 tests pass.

**Next:** manual TUI check (shared with T-010) — status line + streaming transcript while a delegate runs, final result on completion. Needs a live model run in the TUI; not covered by unit tests by design.

**Debug 2026-09-20:** Live output was not shown in a manual TUI run. Root cause: the event listener only captured `tool_execution_start` and `message_update`/`text_delta`, but **not** `tool_execution_update` events. The bash tool's stdout (the counter numbers) streams through `tool_execution_update.partialResult.content`, not through `text_delta`. Fixed by adding `tool_execution_update` handling to extract text from `partialResult.content`. All 39 tests still pass. The status display (T-010) mechanism works; the content was simply incomplete due to the missing handler.
