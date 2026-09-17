# T-004: Subagent tool registration

Create `index.ts` — the Pi extension entry point.

**Scope:**
- Export default factory function receiving `ExtensionAPI`.
- Register `subagent` tool via `pi.registerTool()`.
- Tool parameters:
  - `task: string` (required) — natural-language task description
  - `scratch: "none" | "ephemeral" | "retain"` (optional, default `"none"`)
- Tool execution flow:
  1. Generate task ID (e.g. `crypto.randomUUID()`)
  2. Create scratch if mode != `"none"` (via T-002)
  3. Execute child session (via T-003)
  4. If scratch is `"ephemeral"`: clean up scratch in `finally`
  5. If scratch is `"retain"`: include path in result
  6. Return result to parent
- Config: read `scratchBaseDir` from extension config/settings if provided.
- The child system prompt should be small: delegation boundary + task + scratch path (if any).

**Acceptance criteria:**
- `subagent` tool is registered and callable by the parent.
- Tool accepts `task` and optional `scratch` parameters.
- Task ID is generated per invocation.
- Scratch is created/cleaned per the mode.
- Result is returned to the parent.
- Ephemeral scratch is cleaned up in a `finally`-style lifecycle.
- Retained scratch path is mentioned in the result.
- The child does NOT receive the `subagent` tool.

**Next:** Implement, then test in T-005 and T-006.
