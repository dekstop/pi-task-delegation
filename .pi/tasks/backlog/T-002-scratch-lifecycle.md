# T-002: Scratch lifecycle module

Create `scratch.ts` — the scratch directory lifecycle manager.

**Scope:**
- `createScratch(taskId, mode)`: create a directory under the configured base path (default `~/.pi/agent/subagents/<task-id>/`) with `artifacts/` and `tmp/` subdirectories. Return the path.
- `cleanupScratch(taskId)`: recursively remove the scratch directory for a task.
- `retainScratch(taskId)`: no-op (directory already exists, just don't remove it).
- Config: accept a `scratchBaseDir` option (default `~/.pi/agent/subagents/`).
- Handle creation failure (permissions, disk full) with a clear error.
- Handle cleanup failure: log/report but don't obscure the original task result.

**Acceptance criteria:**
- `none` mode: no directory created.
- `ephemeral` mode: directory created, removed after task.
- `retain` mode: directory created, survives after task.
- Scratch is outside the project working directory.
- Each task gets an isolated directory.
- Cleanup failure is reported without obscuring the original error.

**Next:** Implement, then wire into T-004 (subagent tool).
