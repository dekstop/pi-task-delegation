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
- Whether the Pi SDK exposes a per-message event stream on `AgentSession` outside of `prompt()`. This needs investigation before implementation. If not available, the polling approach is the fallback.

**Acceptance criteria:**
- While a delegate is running, the TUI shows the child's intermediate output (tool calls, partial assistant text) in the tool row.
- On completion, the final result replaces the streaming view.
- The child session's full conversation does not leak into the parent's context — only the final assistant text is returned to the parent LLM.
- Existing tests still pass.

**Next:** Investigate Pi SDK `AgentSession` event/stream API.
