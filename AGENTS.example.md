# Using delegates

## Delegate self-contained tasks

When the work is isolated and does not need the parent agent's conversation history, delegate it to a fresh child session using the `delegate` tool:

```ts
delegate({
  task: "Investigate why the test suite is failing.",
  scratch: "ephemeral"  // optional: "none" | "ephemeral" | "retain"
})
```

## Use scratch for intermediate files

If the delegated task produces intermediate files (artifacts, build output, logs), enable scratch storage so the child has a writable workspace:

- **`none`** (default) — no scratch directory.
- **`ephemeral`** — scratch created and removed after the task finishes (success, failure, or cancellation).
- **`retain`** — scratch created and kept after execution; the result message identifies the path.

## Gitignore

If you use `scratch: "retain"`, add the scratch directory to your project's `.gitignore` to avoid committing intermediate files:

```text
.pi/delegates/
```
