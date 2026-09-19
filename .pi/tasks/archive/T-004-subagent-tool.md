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
- `label`/`description`/`promptSnippet`/`promptGuidelines` wording.
- Whether to expose `scratchBaseDir` at all (see Learnings: no extension config API).
- Whether `promptSnippet`/`promptGuidelines` are worth adding (helps the parent know when to delegate).

**Learnings (T-004 investigation — SDK / environment):**
- **ERROR SIGNALING (critical, corrects the T-003 note above):** to mark a tool run as failed you MUST `throw` from `execute`. Returning `{ isError: true }` is IGNORED — the agent loop (`@mariozechner/pi-agent-core/dist/agent-loop.js`, `executePreparedToolCall`) always sets `isError: false` when `execute` resolves, and only sets `isError: true` + builds an error result when `execute` throws. The SDK catches the throw, reports it to the LLM with `isError: true`, and execution continues — so throwing still keeps the parent usable. Implementation: `ok:true` → `return { content: [{ type: "text", text }] }`; `ok:false` → `throw new Error(useful message)`.
  - NOTE: the bundled `examples/extensions/subagent/index.ts` returns `isError: true` in the result object. Per the agent-loop code that property is ignored on return, so that example relies on the error text in `content` (or is subtly wrong). Do not copy the return-`isError` pattern.
- **No extension config API:** there is no `ExtensionAPI` config/settings API to read a `scratchBaseDir` value. So the tool does NOT pass `scratchConfig`; the executor falls back to its default `<agentDir>/subagents` (i.e. `~/.pi/agent/subagents`). Open question: how/whether to expose `scratchBaseDir` — a CLI flag via `pi.registerFlag(...)` is the only discovered mechanism; user settings.json has no per-extension keying. Keep default for now.
- **`onUpdate` shape (confirmed from docs):** `onUpdate?.({ content: [{ type: "text", text: "..." }] })`. Minimal status strings ("starting"/"done") are fine.
- **Testability split:** `index.ts` imports `typebox`, `@mariozechner/pi-ai` (`StringEnum`), and the `ExtensionAPI` type — all provided by Pi at runtime, NOT installed locally — so `index.ts` cannot be loaded in vitest. Put the pure logic in a new `tool.ts` (SDK-free at load time: imports only `./executor.js` + `node:crypto`), and keep `index.ts` thin (just `pi.registerTool(...)` delegating to `tool.ts`).
- **Tool definition shape:** `pi.registerTool({ name, label, description, parameters, execute })`; `execute(toolCallId, params, signal, onUpdate, ctx)`; `ctx.cwd` is the parent working directory; `signal` is the 3rd `execute` arg (Esc → child abort). Optional `promptSnippet` (one-line "Available tools" entry) and `promptGuidelines` (flat Guidelines bullets; must name the tool, e.g. "Use subagent when...").
- **Task ID:** `crypto.randomUUID()` (node:crypto) — a single path segment, safe as the scratch key (no separators/traversal).
- **Is the tool active by default? YES.** Initial session build calls `_buildRuntime({ activeToolNames: <initial>, includeAllExtensionTools: true })` (`dist/core/agent-session.js` ctor). In `_refreshToolRegistry`, `includeAllExtensionTools: true` pushes every extension-registered tool (incl. `subagent`) into the active set. So no `pi.setActiveTools([...])` call is needed — the parent can call `subagent` out of the box. (The `promptGuidelines` bullets are only injected while the tool is active, which it is by default.)
- **`promptSnippet`/`promptGuidelines`:** `promptSnippet` opts the tool into a one-line "Available tools" entry; `promptGuidelines` appends flat Guidelines bullets (must name the tool, e.g. "Use subagent when..."). Both are safe to add and help the parent know when to delegate. Kept minimal.

**Acceptance criteria:**
- `subagent` tool is registered and callable by the parent.
- Tool accepts `task` and optional `scratch` parameters.
- Task ID is generated per invocation.
- Scratch is created/cleaned per the mode.
- Result is returned to the parent.
- Ephemeral scratch is cleaned up in a `finally`-style lifecycle.
- Retained scratch path is mentioned in the result.
- The child does NOT receive the `subagent` tool.

**Type-checking setup (revised — install, not shim):**
- `typescript` + `@types/node` are devDependencies (dev-time check only; Pi loads via jiti, no build step).
- **Correction:** AGENTS.md's "provided by Pi at runtime, not installed locally" describes the *current* state, not a constraint. We *can* install the core packages locally for type-checking.
- **Decision (supersedes the shim plan):** install the three imported core packages as **devDependencies** pinned to the *installed Pi's* bundled versions → real `.d.ts`, clean `tsc`, no shim, no `types/` dir, full confidence in `index.ts`'s `execute` body + executor/scratch SDK usage. No tsconfig change needed (tsc auto-resolves node_modules types; `skipLibCheck` is on).
- **Version pin (critical — NOT "latest"):** installed Pi is **0.70.2**; its `node_modules` bundles `pi-ai@0.70.6` and `typebox@1.1.38`. npm "latest" is 0.73.1 / 1.3.34 — installing latest would drift the local types from the runtime. Pin to the runtime versions and bump them together when Pi updates.
- **Shadowing risk → neutralised:** a local `node_modules` copy of a core package *could* shadow Pi's bundled copy at runtime if jiti resolves to it. But because we pin to the *exact* bundled versions, the runtime gets the same version whether it resolves to the local copy or Pi's bundled copy → no divergence either way. (Doc: "Pi loads packages with separate module roots, so separate installs do not collide" — Pi isolates these; shadowing unlikely.) Verify once by loading in a real Pi session after install.
- `typebox` is the real npm package `typebox` (distinct from `@sinclair/typebox`); the import is literally `from "typebox"`, matching the doc's "Available Imports" table.
- **Real types caught a real bug (why install > shim):** `AgentToolResult<T>` requires `details: T` (required, generic). Both the `execute` return AND the `onUpdate` partial-result need it — added `details: undefined` (the pattern the built-in `write` tool uses). The shim would have typed these `any` and hidden the omission. This is the concrete payoff of real types over a hand-maintained shim.
- **Distribution is a separate, later task → T-007.** Per docs/packages.md "Dependencies": Pi bundles the core packages; if you import any of `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `typebox`, list them in `peerDependencies` with `"*"` and do NOT bundle them. We import three of these → they become `peerDependencies: "*"` when distributed, never `dependencies`/`bundledDependencies`. Local dev uses devDependencies (omitted from production installs).
- **Rationale for installing (vs shim):** real types beat a hand-maintained shim — no drift, no false confidence, `tsc` stays a meaningful gate for `index.ts`/executor/scratch. Dev-time only; doesn't change what Pi provides at runtime.

**Next:** T-004 COMPLETE — committed a5a6084 (devDeps pinned to runtime versions, `typecheck` script, `tsc` clean, `vitest` 37/37, 2× `details: undefined` in index.ts, T-007 ticketed). Unblocks T-005/T-006. Optional: verify once in a real Pi session that the local `node_modules` core-package copies don't shadow Pi's bundled ones (expected: identical versions, so no divergence either way).
