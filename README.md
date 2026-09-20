# pi-task-delegation

A Pi agent extension to delegate tasks to a fresh, isolated child agent session.

## Purpose

With a constrained local LLM context window, continuing a large parent conversation can become expensive or impossible. This extension lets an agent delegate self-contained work into a fresh child context, so the child starts with a clean context budget rather than inheriting the parent's accumulated history.

The child receives only the explicit task text, executes it independently, and returns a concise result to the parent.

## Installation

Install locally (project-scoped) via the Pi CLI:

```bash
pi install -l https://github.com/dekstop/pi-task-delegation.git
```

Or install globally:

```bash
pi install https://github.com/dekstop/pi-task-delegation.git
```

Verify with `pi list`.

## Usage

The extension registers a `delegate` tool. The parent agent calls it with a `task` string and optional `scope` and `scratch` parameters.

### Basic (project-scoped) delegate

A typical user prompt:

```
Run a delegate to investigate why the test suite is failing and report back
```

This is a **project-scoped** delegate (the default). The child works in the project working directory and has full access to project files.

### Isolated delegate

A typical user prompt:

```
isolated delegate to research how pi agent extensions can update their status message
```

An **isolated** delegate works in a fresh scratch directory with no access to project files. Use this for sandboxed work. Only the final output of an isolated task is reported back into the calling context.

### Retaining the scratch directory

By default, isolated delegates delete their scratch directory after execution. To retain it, include an instruction like:

```
isolated delegate to generate 100 test records in this format, keep the files
```

When the scratch directory of an isolated delegate is retained, the path is included in the result so the parent can access any files created during execution.

## Setup

Optionally add something like the following to your project's `AGENTS.md` to instruct how delegates should be used on the current project:

```markdown
## Delegates

Use delegates for research tasks to save context. Use isolated delegates by default, especially when the work is self-contained and doesn't need access to project files.
```

