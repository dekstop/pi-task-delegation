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

The extension registers a `subagent` tool. The parent agent calls it with:

```ts
subagent({
  task: "Investigate why the test suite is failing.",
  scratch: "ephemeral"  // optional: "none" (default), "ephemeral", "retain"
})
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `task` | `string` | Natural-language description of the delegated task. The task is authoritative for the work. |
| `scratch` | `"none" \| "ephemeral" \| "retain"` | Optional scratch directory lifecycle. Default: `"none"`. |

## Scratch storage

Optional scratch directories are created outside the project directory under `~/.pi/agent/subagents/`. Each delegated task gets an isolated directory. The scratch base directory is configurable.

| Value | Behaviour |
|-------|-----------|
| `none` (default) | No scratch directory |
| `ephemeral` | Created, removed after task completes, fails, or is cancelled |
| `retain` | Created, retained after execution. The result identifies the path. |

## Status

✅ **Phase 1 complete** — core delegation, scratch storage, error handling, and cancellation.

See `SPEC.md` for the full specification and `ROADMAP.md` for future phases.
