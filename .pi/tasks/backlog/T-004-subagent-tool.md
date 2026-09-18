# T-004: Subagent tool registration

Create `index.ts` — the Pi extension entry point.

**Scope:**
- Export default factory function receiving `ExtensionAPI`.
- Register `subagent` tool via `pi.registerTool()`.
- Tool parameters:
  - `task: string` (required) — natural-language task description
  - `scratch: "none" | "ephemeral" | "retain"` (optional, default `"none"`)
- Tool execution flow:
  1. Generate task ID (`crypto.randomUUID()`) — single path segment.
  2. Call `executeChildTask(task, { taskId, cwd: ctx.cwd, scratchMode, scratchConfig, signal, onStatus })`.
  3. Map `ChildResult` → tool result message (see Learnings).
- Config: read `scratchBaseDir` from extension config/settings if provided → `scratchConfig`.
- Scratch is owned by the executor (T-003): the tool passes `scratchMode` + `scratchConfig` and reads `scratchPath`/`scratchError` from `ChildResult`. (Supersedes the old "tool creates/cleans scratch" steps.)
- The child does NOT receive the `subagent` tool (guaranteed by the executor's tool allowlist).

**Learnings from T-003 (executor.ts):**
- `executeChildTask(task, { taskId, cwd, agentDir?, scratchMode?, scratchConfig?, signal?, onStatus? }): Promise<ChildResult>`; `ChildResult = { ok, output, error?, stopReason?, scratchPath?, scratchError? }`. Never throws.
- Registration: `pi.registerTool({ name, label, description, parameters, execute })`; `execute(_toolCallId, params, signal, onUpdate, ctx)`.
- `cwd` from `ctx.cwd`; omit `agentDir` (executor defaults to `getAgentDir()`).
- `signal` (3rd execute arg) → `executeChildTask.signal` (Esc cancels the child).
- `onUpdate` (4th execute arg) → `executeChildTask.onStatus` (minimal: "starting"/"done").
- Tool result: return `{ content: [{ type: "text", text }], isError? }`. `ok:true` → `output` as text (+ mention `scratchPath` if retain). `ok:false` → useful error + `isError: true`. Append `scratchError` without obscuring the main outcome. Surface failures as `isError` results, not throws (keeps the parent usable).
- Params: `task: Type.String()`; `scratch: StringEnum(["none","ephemeral","retain"])` (optional). `Type` from `typebox`, `StringEnum` from `@mariozechner/pi-ai`.

**Open / not final:**
- Exact `onUpdate` partial-result shape (check the SDK type) — minimal status strings for now.
- `isError: true` vs error-text-only on failure — leaning `isError: true` for genuine failures.
- How the extension reads `scratchBaseDir` (extension config vs settings) — needs the ExtensionAPI config API.
- `label`/`description` wording.

**Acceptance criteria:**
- `subagent` tool is registered and callable by the parent.
- Tool accepts `task` and optional `scratch` parameters.
- Task ID is generated per invocation.
- Scratch is created/cleaned per the mode.
- Result is returned to the parent.
- Ephemeral scratch is cleaned up in a `finally`-style lifecycle.
- Retained scratch path is mentioned in the result.
- The child does NOT receive the `subagent` tool.

**Next:** Implement `index.ts` (register `subagent`, map `ChildResult` → tool result). Then T-005/T-006.
