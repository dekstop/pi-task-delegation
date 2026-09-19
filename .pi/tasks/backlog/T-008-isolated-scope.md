# T-008: Add `scope` parameter — isolated subagent mode

**Status:** Complete

## What was done

Replaced the old `scratch: "none" | "ephemeral" | "retain"` parameter with two new parameters:

- `scope: "project" | "isolated"` (default `"project"`)
- `scratch: "ephemeral" | "retain"` (default `"ephemeral"`, isolated scope only)

### Behaviour

- `scope: "project"` (default) — child works in the project cwd, no scratch dir created. `scratch` param is ignored.
- `scope: "isolated"` — child works in a fresh scratch directory (scratch = cwd), no project access. `scratch` controls lifecycle.

### Changes

- **scratch.ts**: Removed `ScratchMode` type. `createScratch` no longer takes a mode param; always returns `string`.
- **executor.ts**: `ExecuteOptions` now has `scope` + `scratchLifecycle` instead of `scratchMode`. `ChildResult` includes `scope`. `buildDelegateFraming` takes `scope` instead of `scratchPath`.
- **tool.ts**: `DelegateToolParams` has `scope` + `scratch`. `runDelegateTask` passes scope through; only sets `scratchLifecycle` for isolated scope.
- **index.ts**: Tool schema updated with `scope` and new `scratch` enum.
- **Tests**: Updated for new signatures. All 39 tests pass.
- **README.md** / **AGENTS.example.md**: Updated to document the new parameters.
