# pi-task-delegation

A Pi extension that lets a parent Pi agent session delegate a task to a fresh, isolated child agent session.

## Purpose

Pi sessions accumulate conversational context. With a constrained local LLM context window, continuing a large parent conversation can become expensive or impossible. This extension lets the parent delegate self-contained work into a fresh child context, so the child starts with a clean context budget rather than inheriting the parent's accumulated history.

The child receives only the explicit task text, executes it independently, and returns a concise result to the parent.

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

Two execution scopes:

- **`project`** (default) — the child works in the project working directory, with access to project files.
- **`isolated`** — the child works in a fresh, isolated scratch directory with no access to project files.

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

The extension registers a `delegate` tool. The parent agent calls it with:

```ts
delegate({
  task: "Investigate why the test suite is failing.",
  scope: "project"       // optional: "project" (default) | "isolated"
  scratch: "ephemeral"   // optional: "ephemeral" (default) | "retain" — isolated scope only
})
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `task` | `string` | Natural-language description of the delegated task. The task is authoritative for the work. |
| `scope` | `"project" \| "isolated"` | Execution scope. Default: `"project"`. |
| `scratch` | `"ephemeral" \| "retain"` | Scratch lifecycle for isolated scope. Default: `"ephemeral"`. Ignored for project scope. |

## Execution scopes

| Scope | Behaviour |
|-------|-----------|
| `project` (default) | Child works in the project working directory. No scratch directory is created. |
| `isolated` | Child works in a fresh scratch directory (scratch = cwd). No access to project files. |

## Scratch storage

Scratch directories are only created for `scope: "isolated"`. Each isolated task gets a directory under `os.tmpdir()/pi-delegates/<task-id>/`.

| Value | Behaviour |
|-------|-----------|
| `ephemeral` (default) | Created, removed after the task completes, fails, or is cancelled. |
| `retain` | Created, retained after execution. The result identifies the path. |

## Setup

Copy the contents of `AGENTS.example.md` into your project's `AGENTS.md` to advertise delegates and scratch storage to any agents used on the project.

## Status

✅ **Phase 1 complete** — core delegation, isolated scope, scratch storage, error handling, and cancellation.
