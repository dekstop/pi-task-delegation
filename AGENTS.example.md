# Using delegates

## Delegate self-contained tasks

When the work is isolated and does not need the parent agent's conversation history, delegate it to a fresh child session using the `delegate` tool:

```ts
delegate({
  task: "Investigate why the test suite is failing."
})
```

This is a **project-scoped** delegate (the default). The child works in the project working directory and has access to project files.

For sandboxed work that should not read or modify project files, use **isolated** scope:

```ts
delegate({
  task: "Run the linter and report any errors.",
  scope: "isolated"
})
```

## Retaining the scratch directory

By default, isolated delegates delete their scratch directory after execution. To retain it:

```ts
delegate({
  task: "Build the project and capture the output.",
  scope: "isolated",
  scratch: "retain"
})
```

When `scratch: "retain"` is set, the child's scratch path is included in the result so the parent can access any files created during execution.
