# pi-task-delegation

A Pi extension that lets a parent Pi agent session delegate a task to a fresh, isolated child agent session.

## Purpose

Pi sessions accumulate conversational context. With a constrained local LLM context window, continuing a large parent conversation can become expensive or impossible. This extension lets the parent delegate self-contained work into a fresh child context, so the child starts with a clean context budget rather than inheriting the parent's accumulated history.

The child receives only the explicit task text, executes it independently, and returns a concise result to the parent.

## Installation

Install locally (project-scoped) via the Pi CLI:

```bash
pi install . -l
```

Or install globally:

```bash
pi install ./local/path
```

Verify with `pi list`.

## Usage

The extension registers a `delegate` tool. The parent agent calls it with a `task` string and optional `scope` and `scratch` parameters.

### Basic (project-scoped) delegate

```ts
delegate({
  task: "Investigate why the test suite is failing."
})
```

This is a **project-scoped** delegate (the default). The child works in the project working directory and has access to project files.

### Isolated delegate

```ts
delegate({
  task: "Run the linter and report any errors.",
  scope: "isolated"
})
```

An **isolated** delegate works in a fresh scratch directory with no access to project files. Use this for sandboxed work.

### Retaining the scratch directory

By default, isolated delegates delete their scratch directory after execution (`scratch: "ephemeral"`). To retain it:

```ts
delegate({
  task: "Build the project and capture the output.",
  scope: "isolated",
  scratch: "retain"
})
```

When `scratch: "retain"` is set, the child's scratch path is included in the result so the parent can access any files created during execution.

## How it works

```text
Parent context          Fresh child context
      |                      |
      |  explicit task      |
      +--------------------->+
      |                      |
      |  concise result     |
      +<---------------------+
```

The child does **not** inherit the parent's conversation history. The parent is responsible for including any context the child needs in the task text.

## Setup

Copy the contents of `AGENTS.example.md` into your project's `AGENTS.md` to advertise delegates and scratch storage to any agents used on the project.

## Status

✅ Current — core delegation, isolated scope, scratch storage, error handling, and cancellation.
