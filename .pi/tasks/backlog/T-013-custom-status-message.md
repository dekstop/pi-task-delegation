# T-013: Custom status message parameter

Let the parent agent set a custom status message shown during delegate execution.

**Background:**
Currently the delegate's live status is purely the child's transcript (tool calls + assistant text). The task text is only used as the prompt. For long-running delegates, the parent may want to show a more descriptive status (e.g., "Building project…" or "Running test suite…").

**Scope:**
- Add an optional `status` parameter to the delegate tool.
- If provided, emit it as the first status message before "starting…".
- If not provided, keep the current behaviour (child transcript only).
- Update docs (README, AGENTS.example.md) to explain the parameter.

**Acceptance criteria:**
- `delegate({ task: "...", status: "Building project…" })` shows "Building project…" as the first status line.
- Without `status`, the live transcript starts with "starting…" as before.
- All existing tests pass.
- README and AGENTS.example.md document the new parameter.

**Next:** Implement in index.ts, tool.ts, executor.ts; update docs; run tests.
