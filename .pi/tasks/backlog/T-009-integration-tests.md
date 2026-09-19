# T-009: Automated integration tests with a live model

Write integration tests that actually run a child session with a live model/provider, verifying end-to-end delegation behaviour that unit tests cannot cover.

**Background:**
Unit tests (executor.test.ts, scratch.test.ts, tool.test.ts) cover all SDK-free paths — 37/37 passing. However, the following require a real model/provider:
- Context isolation: parent secrets don't leak to child
- Result handling: intermediate child messages don't pollute parent context
- Multiple sequential tasks: parent → child A → parent → child B without state leaking
- Recursive delegation blocked: child doesn't receive `subagent` tool
- Task execution failure: child session fails gracefully

**Scope:**
- Add integration tests that guard on model/provider availability (skip if no model configured).
- Context isolation test: parent has a secret, child is asked about it — child should not know.
- Result handling test: verify final assistant text extraction from multi-turn child session.
- Sequential tasks test: run two child tasks back-to-back, verify no state leaks.
- Recursive delegation test: child attempts to use `subagent` — should not be available.
- Failure test: simulate a child failure and verify error propagation.
- All integration tests should use vitest, live in `test/`.

**Acceptance criteria:**
- Integration tests skip gracefully when no model/provider is available.
- Context isolation verified via automated test (not just manual).
- Sequential tasks verified via automated test.
- Recursive delegation blocked verified via automated test.
- Failure handling verified via automated test.
- All tests pass in an environment with a configured model.

**Next:** None — this is a single self-contained change.
