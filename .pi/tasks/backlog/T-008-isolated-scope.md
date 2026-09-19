# T-008: Add `scope` parameter — isolated subagent mode

Introduce an explicit `scope` parameter so the caller can choose between project scope (default) and isolated scope (scratch = cwd).

**Scope:**
- Add `scope: "project" | "isolated"` to the tool schema (tool.ts + index.ts).
- Default: `"project"` — child works in project cwd, no scratch dir created.
- `"isolated"` — child works in the scratch directory (scratch = cwd).
- When `scope: "isolated"`:
  - Scratch must be `"ephemeral"` or `"retain"` (not `"none"`). Reject `"none"` with a clear error.
  - The scratch directory becomes the child's cwd, not the project cwd.
  - The framing should tell the child it is working in an isolated directory with no project access.
- When `scope: "project"`:
  - No scratch dir created (simplifies: scratch only exists for isolated tasks).
  - Child works in project cwd (same as current default behaviour).
  - No scratch path in framing.
- Update `mapChildResultToText` to mention the scope mode.
- Update tests:
  - Tool schema includes `scope`.
  - `scope: "project"` — child works in project cwd, no scratch dir created.
  - `scope: "isolated"` — child works in scratch dir; scratch dir is cwd.
  - `scope: "isolated"` with `scratch: "none"` — rejected with clear error.
  - Integration test: isolated child cannot access project files.

**Acceptance criteria:**
- New parameter accepted by the tool.
- Default scope is `"project"` (backwards compatible).
- `"isolated"` mode makes scratch the child's cwd.
- `"project"` mode creates no scratch dir.
- `scope: "isolated"` with `scratch: "none"` is rejected.
- All existing tests still pass.
- Integration test confirms isolated child cannot access project files.

**Next:** None — this is a single self-contained change.
