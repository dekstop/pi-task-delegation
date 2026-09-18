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

**Next:** `executor.ts` implemented + unit-tested (pure helpers + SDK-free paths). Remaining: T-004 registers the `subagent` tool that calls `executeChildTask` and maps `ChildResult` → tool result message. Integration tests (real child session) land in T-005/T-006.

**Progress:**
- [x] `executeChildTask(task, options)` — fresh in-process child via `createAgentSession()` + `SessionManager.inMemory()`.
- [x] Task sent as the child's prompt; final assistant text extracted; session always disposed in `finally`.
- [x] Parent `signal` → `session.abort()`; listener removed on completion.
- [x] Failure paths (creation, prompt rejection, no assistant message, stopReason error/aborted) return `{ ok:false, error }` — never throw.
- [x] Child tools `["read","bash","edit","write"]` (allowlist; never `subagent`); same `cwd`; default model.
- [x] Scratch owned by executor: ephemeral → cleanup, retain → path, none → skip; failures in `scratchError`.
- [x] `appendSystemPromptOverride` keeps the full default prompt + subagent framing (+ scratch path line).
- [x] Pure helpers `buildSubagentFraming`, `extractFinalAssistantText`, `classifyOutcome` + SDK-free `executeChildTask` paths unit-tested (`test/executor.test.ts`, 20 tests).

**Spec (reference for multi-session work):**

*Types & signature*
```
export interface ExecuteOptions {
  taskId: string;             // single path segment; scratch key
  cwd: string;               // parent ctx.cwd — same project env
  agentDir?: string;         // default getAgentDir()
  scratchMode?: ScratchMode; // "none" | "ephemeral" | "retain", default "none"
  scratchConfig?: ScratchConfig;
  signal?: AbortSignal;      // parent signal → session.abort()
  onStatus?: (status: string) => void;
}
export interface ChildResult {
  ok: boolean;
  output: string;             // final assistant text ("" on failure)
  error?: string;             // useful message on failure
  stopReason?: string;        // child's final stopReason (diagnostics)
  scratchPath?: string;       // retained scratch path (retain mode)
  scratchError?: string;      // scratch cleanup failure message
}
export async function executeChildTask(task: string, options: ExecuteOptions): Promise<ChildResult>
```

*Lifecycle (in order)*
1. `signal` already aborted → return `{ ok:false, error:"aborted" }` (don't start).
2. `createScratch(taskId, mode, scratchConfig)` → `scratchPath` (null when none).
3. Build appended system prompt: subagent framing + scratch path line (when enabled).
4. `new DefaultResourceLoader({ cwd, agentDir, appendSystemPromptOverride: base => [...base, framing] })`; `await loader.reload()`.
5. `createAgentSession({ resourceLoader: loader, sessionManager: SessionManager.inMemory(), cwd, tools: ["read","bash","edit","write"] })`.
6. Wire `signal` → `session.abort()`.
7. `await session.prompt(task)` in try/catch (capture rejection).
8. Extract final assistant message: last msg `role==="assistant"`, join `content` parts where `type==="text"`.
9. Classify outcome (see below).
10. Scratch: ephemeral → `cleanupScratch`; retain → `retainScratch`; none → skip. Capture failures in `scratchError`.
11. `finally`: `session.dispose()` (always).

*Outcome classification*
- `prompt` rejected → error.
- stopReason `"error"` → error (use `errorMessage`).
- stopReason `"aborted"` → aborted.
- stopReason `"length"` → success, note truncated.
- `"stop"` / `"toolUse"` → success.
- no assistant message at all → error.

*Pure helpers (unit-testable without the Pi runtime)*
- `extractFinalAssistantText(messages: AgentMessage[]): string`
- `classifyOutcome({ promptError, lastAssistant }): { ok, stopReason, error? }`
- `buildSubagentFraming(scratchPath?): string`
- `executeChildTask` defers `await import("@mariozechner/pi-coding-agent")` (like `scratch.ts`) so the module loads in tests.

*Decided*
- In-process child: `createAgentSession` + `SessionManager.inMemory()`.
- Tools: explicit `["read","bash","edit","write"]` (name allowlist); never `subagent`.
- Prompt: `appendSystemPromptOverride` (keeps default tools/guidelines/project context).
- No model selection (default resolution).
- Always `dispose()` in `finally`; catch all, return `{ ok:false, ... }`.

*Not final / open (keep simple; decide in T-004)*
- Who owns scratch lifecycle: executor (current plan) vs tool (T-004). Leaning executor.
- `onStatus` contract: which status strings to emit. Minimal for now.
- Whether to surface `modelFallbackMessage` on `ChildResult`.
- Distinct shape for abort vs generic `ok:false` — leaning `ok:false` + `stopReason:"aborted"`.
- Exact subagent prompt wording.
- How T-004 maps `ChildResult` → tool result message.

**Learnings (SDK / environment):**
- `createAgentSession()` is exported from `@mariozechner/pi-coding-agent`. Returns `{ session, extensionsResult, modelFallbackMessage? }`.
- `sessionManager: SessionManager.inMemory()` — no persistence, fresh context. `SessionManager` is exported from the main package.
- Pass `cwd` (parent's `ctx.cwd`) so `DefaultResourceLoader` discovers project extensions/skills/context files and tools resolve paths against it.
- **System prompt override:** use `DefaultResourceLoader` with a prompt override, then `await loader.reload()` (REQUIRED when you supply your own `resourceLoader` — `createAgentSession` only auto-`reload()`s when you do NOT pass one), then `createAgentSession({ resourceLoader: loader })`. `DefaultResourceLoader` is exported from the main package.
  - **CAVEAT:** `systemPromptOverride` REPLACES the whole default system prompt. When `customPrompt` is set, `buildSystemPrompt` returns early and the child LOSES the built-in tool descriptions/guidelines (the model still knows its tools via the API `tools` param, but per-tool guidance is gone).
  - **PREFERRED:** use `appendSystemPromptOverride: (base) => [...base, "<subagent instructions>"]` — keeps the full default prompt (tools, guidelines, project context / AGENTS.md) and appends the subagent framing (fresh context, task-is-authority, concise result, scratch path). Best matches the spec's "same project environment" + "normal Pi tools".
- **Child tools:** the `tools` option is a `string[]` of tool NAMES (an allowlist), NOT tool instances. The docs example `tools: createCodingTools(cwd)` is outdated — `createCodingTools(cwd)` returns `Tool[]` and would be a type error. Correct usage: `tools: ["read", "bash", "edit", "write"]`. `createAgentSession` applies `cwd` to the built-in tools it builds from those names (see `examples/sdk/05-tools.ts`). The default active set is exactly `["read", "bash", "edit", "write"]`, so passing that list explicitly is clearest and guarantees `subagent` is never in the child set (it's not a built-in).
- **`cwd` resolution:** `createAgentSession` resolves `cwd = options.cwd ?? options.sessionManager?.getCwd() ?? process.cwd()`. Pass `cwd` explicitly.
- `session.prompt(text)` — sends the task and awaits full completion. This is the main "run to completion" call.
- `session.subscribe(listener)` — returns an unsubscribe fn. Use to track `agent_end` / `turn_end` / `message_end` events if needed, but `prompt()` already resolves on completion.
- `session.messages` (AgentMessage[]) and `session.agent.state.messages` — conversation history. Final assistant message = last message with `role === "assistant"`; its `content` is an array of parts where `part.type === "text"` → `part.text`.
- **Message types (pi-ai):** `AssistantMessage.content: (TextContent | ThinkingContent | ToolCall)[]`; `TextContent = { type: "text", text: string }`. `stopReason: "stop" | "length" | "toolUse" | "error" | "aborted"`; `errorMessage?: string`. A `"length"` stop = truncated (warning, not error); `"error"`/`"aborted"` = failure.
- `msg.stopReason` — `"error"` / `"aborted"` / etc. `msg.errorMessage` — error string if any. Use these to detect failure vs success.
- `session.abort()` — cancel current operation (propagate parent abort here). `session.dispose()` — cleanup; always call in `finally`.
- `session.isStreaming` — boolean, useful to know if still running.
- **Abort propagation:** the tool `execute()` receives `signal` (AbortSignal, 3rd arg) and `ctx.signal`. Wire the parent's `signal`/`ctx.signal` to `session.abort()` so Esc cancels the child. On abort, still `dispose()` and clean up scratch.
- **Failure handling:** wrap `createAgentSession` + `prompt` in try/catch; return a useful error string (do not throw in a way that corrupts the parent). Distinguish creation failure vs execution failure vs model error.
- The child must NOT receive the `subagent` tool. Since `subagent` is registered by *our* extension (not a built-in), the child session created via `createAgentSession()` with a plain `DefaultResourceLoader` will NOT load our extension's tool — but to be safe, do NOT pass `additionalExtensionPaths` pointing at our own extension, and do NOT rely on the child inheriting the parent's extension set. Document that the child is a clean session.
- `Type` from `typebox` for tool parameters; `StringEnum` from `@mariozechner/pi-ai` for enums (e.g. scratch mode). `typebox` and `@mariozechner/pi-ai` are provided by Pi at runtime.
- The bundled `examples/extensions/subagent/` uses a DIFFERENT approach (spawns a separate `pi` process via `--mode json -p --no-session`). We are NOT doing that — our spec mandates in-process `createAgentSession()` + `SessionManager.inMemory()`. Do not copy the spawn approach.
- Model: do NOT pass a `model` — let the child use the default model resolution (settings → first available). No model-selection API in Phase 1.
