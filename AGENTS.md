# Instructions

## Context

Read `README.md` to get up to speed with the current project. 

## Project-specific

- Extension entry point: `index.ts`
- Supporting modules: `executor.ts`, `scratch.ts`
- Tests in `test/` directory, run with `npx vitest run`
- The extension is loaded by Pi via jiti — no build step
- `@mariozechner/pi-coding-agent` and `typebox` are provided by Pi at runtime, not installed locally
- Scratch storage: system tmp under `os.tmpdir()/pi-delegates/<task-id>/`
- The child session must NOT receive the `delegate` tool (no recursive delegation in Phase 1)
- Use `createAgentSession()` with `SessionManager.inMemory()` for child sessions
- Child uses the same `cwd` as the parent (same project environment, fresh context)
- Keep the implementation small — avoid speculative abstractions

## Development process

You have limited context memory, so always work in stages. Make a plan first before you dive in, splitting requests into discrete tasks. This is especially important for larger changes. Then work on one task at a time. 

Keep track of your progress so that another agent can pick up the work if you get interrupted.

Keep `README.md` updated with any major changes to the project scope. It should only contain information useful to end users, any details regarding the implementation plan and progress should live in task files, and any instructions to agents in `AGENTS.md`. 

## Task tracking

For non-trivial or multi-step coding work, use the `task-tracker` Pi skill:

```text
/skill:task-tracker
```

It maintains `.pi/tasks/{backlog,active,archive}/` plus `.pi/tasks/ready.md`. Task files use stable IDs and meaningful filenames such as `T-014-oauth-callback.md`; the directory is the task's authoritative state, and tasks are moved between directories rather than duplicated. Keep the first 10 lines of backlog tasks concise enough for routine review; active tasks contain detailed current work and are the normal task-context files; archive is cold storage and should not normally be loaded. Use `ready.md` as a lightweight index of backlog tasks ready to be picked up, not as a second source of truth. Use explicit dependencies/blockers, acceptance criteria, and a `Next` action. Work on one primary task at a time, record out-of-scope discoveries as separate tasks, and use Git/repository state as authoritative when resuming after compaction or restart.

## Version control

The project directory is under Git version control. Create a repository if needed, using a "main" branch. 

Commit every successful feature implementation with a descriptive message. Use the git identity "Coding Agent <agent@auto.local>" to indicate that it came from an automated coding agent. Don't include any system details or personal information about the user, including any file or directory paths outside the project root. 

## Miscellaneous

Keep `README.md` and `AGENTS.md` below 7k bytes at all times.

We use British spelling, date formats, and measurement units.
