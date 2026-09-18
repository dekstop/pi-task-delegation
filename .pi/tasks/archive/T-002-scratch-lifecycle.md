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

**Status:** Done (2026-09-18).

**Result:** `scratch.ts` implemented with `createScratch(taskId, mode, config?)`, `cleanupScratch(taskId, config?)`, `retainScratch(taskId, config?)`. Default base dir resolved via lazy `getAgentDir()` import (deferred so the module stays testable without the Pi runtime); tests pass an explicit `scratchBaseDir` under `os.tmpdir()`. `createScratch` returns null for `none`, throws a clear error on creation failure. `cleanupScratch` is best-effort: returns `{ ok, error? }`, never throws. `retainScratch` returns the existing path or null. Task ids validated as single path segments. 9 tests in `test/scratch.test.ts`, all passing. Verified under jiti with the real `getAgentDir()` default.

**Next:** Wire into T-004 (subagent tool).

**Learnings (SDK / environment):**
- Self-contained: only Node `node:fs` / `node:path` / `node:os` needed. No session SDK here.
- `getAgentDir()` is exported from `@mariozechner/pi-coding-agent` and returns `~/.pi/agent`. Default scratch base = `path.join(getAgentDir(), "subagents")`. Do not hardcode `~`/home expansion; go through `getAgentDir()`.
- `getAgentDir()` is a synchronous value (no `await`), per SDK exports list.
- Keep `createScratch`/`cleanupScratch`/`retainScratch` pure-ish and individually testable against a temp base dir (pass `scratchBaseDir` override in tests, e.g. `os.tmpdir()`).
- `retain` is a no-op by design — the directory simply is not removed; don't add bookkeeping.
- Cleanup must be best-effort: swallow/collect the error and return it, never throw through the original task result.
