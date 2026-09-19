# Using delegates

## Delegate self-contained tasks

When the work is isolated and does not need the parent agent's conversation history, delegate it to a fresh child session using the `delegate` tool:

```ts
delegate({
  task: "Investigate why the test suite is failing.",
  scope: "project"       // optional: "project" (default) | "isolated"
  scratch: "ephemeral"   // optional: "ephemeral" (default) | "retain" — isolated scope only
})
```

## Execution scopes

- **`project`** (default) — the child works in the project working directory, with access to project files. No scratch directory is created.
- **`isolated`** — the child works in a fresh, isolated scratch directory with no access to project files. Use this when the task should not read or modify project files.

## Scratch lifecycle (isolated scope only)

The `scratch` parameter controls the lifecycle of the isolated scratch directory:

- **`ephemeral`** (default) — scratch created and removed after the task finishes (success, failure, or cancellation).
- **`retain`** — scratch created and kept after execution; the result message identifies the path.

The `scratch` parameter is ignored for `scope: "project"`.

