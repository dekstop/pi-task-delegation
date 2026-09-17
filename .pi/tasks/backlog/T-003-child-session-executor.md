# T-003: Child session executor

Create `executor.ts` — the child `AgentSession` lifecycle manager.

**Scope:**
- `executeChildTask(task, options)`: create a fresh `AgentSession` via `createAgentSession()` with `SessionManager.inMemory()`.
- Send the delegated task as the prompt to the child.
- Wait for the child to complete.
- Extract the final assistant message (the child's result).
- Dispose the child session.
- Handle abort/cancellation: propagate abort signal to child, dispose, clean up.
- Handle failure: child creation failure, execution failure, model error. Return a useful error string, don't corrupt the parent.
- The child must NOT receive the `subagent` tool (no recursive delegation).
- The child should use the same `cwd` as the parent (same project environment).
- The child should use the default model (no model selection API).

**Key SDK APIs:**
- `createAgentSession({ sessionManager: SessionManager.inMemory(), cwd, tools, ... })`
- `session.prompt(task)` — send the task
- `session.subscribe(...)` — track completion
- `session.state.messages` — extract final assistant message
- `session.abort()` — cancellation
- `session.dispose()` — cleanup

**Acceptance criteria:**
- Fresh child context: parent conversation is not copied.
- Child receives the task text as its prompt.
- Child has access to the project working directory.
- Child has normal Pi tools (read, bash, etc.) but NOT `subagent`.
- Final assistant message is extracted and returned.
- Child session is disposed after completion.
- Failure returns a useful error, parent remains usable.
- Abort propagates to child, resources cleaned up.

**Next:** Implement, then wire into T-004 (subagent tool).
