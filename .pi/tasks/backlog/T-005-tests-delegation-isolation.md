# T-005: Tests — delegation and context isolation

Write tests for core delegation behaviour and context isolation.

**Note (from T-003):** Real child-session tests need `@mariozechner/pi-coding-agent`, which is NOT installed locally (Pi provides it at runtime) — plain `npx vitest run` can't resolve it. So integration tests must `await import(...)` and `describe.skipIf` when unavailable: keeps the local suite green (skipped) and runs where the SDK is present. Pure-helper coverage already lives in `test/executor.test.ts`.

**Scope:**
- Basic delegation: parent invokes `subagent`, child session is created, child receives the task, child executes, parent receives the final result.
- Context isolation: information present only in the parent conversation is NOT available to the child. (e.g. parent knows a secret phrase, task asks "what information do you have from the parent?" — child should not know the secret.)
- Filesystem inheritance: child can access the expected project working directory.
- Result handling: final result reaches the parent; intermediate child messages do NOT become parent context; child transcript is not injected into the parent.
- Multiple sequential tasks: parent → child A → parent → child B → parent works without state leaking between child sessions.
- Recursive delegation: the Phase 1 child does NOT receive the `subagent` tool.

**Acceptance criteria:**
- All tests pass.
- Tests use vitest.
- Tests are in `test/` directory.
- Tests cover the scenarios listed above.

**Next:** T-006 (tests — scratch, failure, cancellation).
