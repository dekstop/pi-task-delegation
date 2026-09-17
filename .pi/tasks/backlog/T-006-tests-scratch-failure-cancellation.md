# T-006: Tests — scratch, failure, cancellation

Write tests for scratch lifecycle, failure handling, and cancellation.

**Scope:**
- Scratch:
  - `scratch: "none"`: no directory created.
  - `scratch: "ephemeral"`: directory created, removed after task.
  - `scratch: "retain"`: directory created, survives after task.
  - Scratch is outside the project directory.
  - Child can write to its scratch directory.
- Failure:
  - Child session creation failure: parent receives a useful error.
  - Task execution failure: parent receives a useful error.
  - Parent remains usable after failure.
  - Scratch cleanup is attempted after failure.
  - Cleanup failure is reported without obscuring the original error.
- Cancellation:
  - Child execution stops on abort.
  - Resources are cleaned up (child disposed).
  - Ephemeral scratch is removed on cancellation.
  - Parent remains usable after cancellation.

**Acceptance criteria:**
- All tests pass.
- Tests use vitest.
- Tests are in `test/` directory.
- Tests cover the scenarios listed above.

**Next:** None — this is the final task for Phase 1.
