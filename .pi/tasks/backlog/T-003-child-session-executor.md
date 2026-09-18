# T-003: Child session executor

Create `executor.ts` — the child `AgentSession` lifecycle manager.

**Scope:**
- `executeChildTask(task, options)`: create a fresh `AgentSession` via `createAgentSession()` with `SessionManager.inMemory()`.
- Send the delegated task as the prompt to the child.
- Wait for the child to complete.
- Extract the final assistant message (the child's result).
- Dispose the child session.
- Handle abort/cancellation: propagate abort signal to child, dispose, clean up.
- Handle failure: child creation failure, execution failure, model error. Return a useful error string, don't corrupt the parent.
- The child must NOT receive the `subagent` tool (no recursive delegation).
- The child should use the same `cwd` as the parent (same project environment).
- The child should use the default model (no model selection API).

**Key SDK APIs:**
- `createAgentSession({ sessionManager: SessionManager.inMemory(), cwd, tools, ... })`
- `session.prompt(task)` — send the task
- `session.subscribe(...)` — track completion
- `session.state.messages` — extract final assistant message
- `session.abort()` — cancellation
- `session.dispose()` — cleanup

**Acceptance criteria:**
- Fresh child context: parent conversation is not copied.
- Child receives the task text as its prompt.
- Child has access to the project working directory.
- Child has normal Pi tools (read, bash, etc.) but NOT `subagent`.
- Final assistant message is extracted and returned.
- Child session is disposed after completion.
- Failure returns a useful error, parent remains usable.
- Abort propagates to child, resources cleaned up.

**Next:** Implement, then wire into T-004 (subagent tool).

**Learnings (SDK / environment):**
- `createAgentSession()` is exported from `@mariozechner/pi-coding-agent`. Returns `{ session, extensionsResult, modelFallbackMessage? }`.
- `sessionManager: SessionManager.inMemory()` — no persistence, fresh context. `SessionManager` is exported from the main package.
- Pass `cwd` (parent's `ctx.cwd`) so `DefaultResourceLoader` discovers project extensions/skills/context files and tools resolve paths against it.
- **System prompt override:** use `DefaultResourceLoader` with `systemPromptOverride: () => "..."`, then `await loader.reload()`, then `createAgentSession({ resourceLoader: loader })`. `DefaultResourceLoader` is exported from the main package.
- **Child tools:** when specifying BOTH `cwd` AND `tools`, use the factory functions (`createCodingTools(cwd)`, `createReadOnlyTools(cwd)`, `createReadTool(cwd)`, `createBashTool(cwd)`, etc.) so paths resolve against `cwd`. If you omit `tools`, pi auto-creates them with the correct `cwd` — but then it includes the default set; we want to be explicit so `subagent` is never in the child set (it isn't a built-in, so omitting tools is actually safe, but explicit `createCodingTools(cwd)` is clearest).
- `session.prompt(text)` — sends the task and awaits full completion. This is the main "run to completion" call.
- `session.subscribe(listener)` — returns an unsubscribe fn. Use to track `agent_end` / `turn_end` / `message_end` events if needed, but `prompt()` already resolves on completion.
- `session.messages` (AgentMessage[]) and `session.agent.state.messages` — conversation history. Final assistant message = last message with `role === "assistant"`; its `content` is an array of parts where `part.type === "text"` → `part.text`.
- `msg.stopReason` — `"error"` / `"aborted"` / etc. `msg.errorMessage` — error string if any. Use these to detect failure vs success.
- `session.abort()` — cancel current operation (propagate parent abort here). `session.dispose()` — cleanup; always call in `finally`.
- `session.isStreaming` — boolean, useful to know if still running.
- **Abort propagation:** the tool `execute()` receives `signal` (AbortSignal, 3rd arg) and `ctx.signal`. Wire the parent's `signal`/`ctx.signal` to `session.abort()` so Esc cancels the child. On abort, still `dispose()` and clean up scratch.
- **Failure handling:** wrap `createAgentSession` + `prompt` in try/catch; return a useful error string (do not throw in a way that corrupts the parent). Distinguish creation failure vs execution failure vs model error.
- The child must NOT receive the `subagent` tool. Since `subagent` is registered by *our* extension (not a built-in), the child session created via `createAgentSession()` with a plain `DefaultResourceLoader` will NOT load our extension's tool — but to be safe, do NOT pass `additionalExtensionPaths` pointing at our own extension, and do NOT rely on the child inheriting the parent's extension set. Document that the child is a clean session.
- `Type` from `typebox` for tool parameters; `StringEnum` from `@mariozechner/pi-ai` for enums (e.g. scratch mode). `typebox` and `@mariozechner/pi-ai` are provided by Pi at runtime.
- The bundled `examples/extensions/subagent/` uses a DIFFERENT approach (spawns a separate `pi` process via `--mode json -p --no-session`). We are NOT doing that — our spec mandates in-process `createAgentSession()` + `SessionManager.inMemory()`. Do not copy the spawn approach.
- Model: do NOT pass a `model` — let the child use the default model resolution (settings → first available). No model-selection API in Phase 1.
