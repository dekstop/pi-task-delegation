# T-005: Tests — delegation and context isolation

Write tests for core delegation behaviour and context isolation.

**Note (from T-003; UPDATED after T-004):** The SDK is now installed locally as a devDependency (pinned to the installed Pi's runtime versions) and resolvable by node/vitest — verified: `import('@mariozechner/pi-coding-agent')` works and exports `createAgentSession`/`SessionManager`/`DefaultResourceLoader`/`getAgentDir`. The old "can't resolve the module" constraint is GONE, so the module-unavailability `skipIf` guard is no longer needed.
**Unknown (verify before writing):** whether actually *executing* a child session in a test (`createAgentSession` + `session.prompt(task)`) works in the local/CI env, or needs a live model/provider/API key that may be absent — no real child-session test has been run yet. So guard integration tests on **model/provider availability** (skip if no model configured), not module availability — and confirm with one real run first. Pure-helper coverage already lives in `test/executor.test.ts`.

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
