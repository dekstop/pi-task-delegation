# pi-task-delegation — Phase 1 Implementation Specification

## 1. Objective

Implement a minimal Pi extension that allows a parent Pi agent session to delegate a task to a fresh, isolated child agent session.

The primary purpose is **context management**, not agent specialisation.

A delegated task should execute with a fresh model context rather than consuming the parent session's accumulated conversation history. The child performs the task independently and returns a concise result to the parent.

The extension should be named:

`pi-task-delegation`

The initial user-facing tool should be named:

`delegate`

The core abstraction is:

> Delegate a task into an isolated Pi context, then return the result to the parent.

---

## 2. Motivation

Pi sessions can accumulate substantial conversational context. With a constrained local LLM context window, repeatedly continuing a large parent conversation can become expensive or eventually impossible.

Many tasks do not require the parent's complete conversation history.

For example:

* researching a question;
* inspecting a codebase;
* analysing a file;
* investigating an error;
* producing an intermediate artefact;
* performing a self-contained implementation task;
* checking or validating something independently.

Instead of adding the entire parent history to such work, the parent should be able to create a fresh context containing only the information deliberately supplied in the delegated task.

Conceptually:

```text
Parent context
      |
      | explicit task
      v
Fresh child context
      |
      | concise result
      v
Parent context
```

The child should **not** inherit the parent's conversation history by default.

---

## 3. Phase 1 Scope

Phase 1 provides:

1. A `delegate` tool available to the parent Pi session.
2. Creation of a fresh child `AgentSession`.
3. Explicit task handoff from parent to child.
4. Execution of the task in the child context.
5. A concise child-to-parent result.
6. Optional child scratch/artifact storage outside the main project directory.
7. Proper handling of success, failure, cancellation, and cleanup.
8. Serial execution only.

Phase 1 should use existing Pi SDK/session mechanisms wherever possible.

Pi core should not be modified unless an extension API limitation makes this unavoidable.

---

## 4. Non-Goals

The following are deliberately out of scope for Phase 1.

### 4.1 Agent roles

Do not introduce roles such as:

* scout;
* researcher;
* reviewer;
* worker;
* oracle;
* planner;
* coder.

The task itself defines what the child is supposed to do.

There should be no role taxonomy or role-to-prompt mapping.

### 4.2 Model selection

The child should use the currently appropriate/default model according to the existing Pi/runtime configuration.

Do not add a `model` argument to the Phase 1 public API.

Model selection and model swapping are deferred to a later phase.

### 4.3 Context persistence

Do not implement KV-cache persistence, context snapshots, prompt-cache management, or session restoration optimisations.

A child session may be entirely ephemeral.

The architecture should not prevent these capabilities being added later.

### 4.4 Parallel execution

Do not implement simultaneous or background delegates.

Phase 1 execution is intentionally serial:

```text
parent
  -> child
  -> parent
  -> child
  -> parent
```

The implementation should avoid architectural choices that make future concurrency impossible, but concurrency is not a Phase 1 feature.

### 4.5 Persistent child state

Do not create standard files such as:

* `state.md`;
* `findings.md`;
* `decisions.md`;
* `summary.md`.

The child's returned result is normally sufficient for communicating its outcome to the parent.

Scratch files are only for actual intermediate/generated artefacts where filesystem storage is useful.

### 4.6 Automatic synthesis

The extension should not attempt to synthesise multiple child results or otherwise interpret their meaning.

The parent agent is responsible for interpreting the returned result.

### 4.7 Automatic task decomposition

The extension should not decide how to break a task into subtasks.

The parent explicitly decides when to delegate and what task to provide.

### 4.8 Automatic context selection

The extension should not attempt to infer which parts of the parent's conversation are relevant.

The parent task is the explicit context boundary.

---

## 5. Public API

The intended initial tool interface is approximately:

```ts
delegate({
  task: string,
  scratch?: "none" | "ephemeral" | "retain"
})
```

### `task`

Required.

A natural-language description of the delegated task.

The task should contain whatever context the child needs.

The task is authoritative for the work being requested.

Example:

```text
Investigate why the test suite is failing after the recent parser
changes. Inspect the relevant source and tests. Identify the likely
cause and report your findings. Do not modify files.
```

The parent can include relevant facts from its own conversation explicitly:

```text
We are implementing X. The intended behaviour is Y. The parent
session has established Z. Investigate whether the current
implementation satisfies that behaviour. Inspect the repository
but do not modify files.
```

No implicit parent-history transfer should occur.

### `scratch`

Optional.

Default:

```text
"none"
```

Supported values:

#### `none`

No dedicated delegate scratch directory is created.

#### `ephemeral`

Create a dedicated scratch directory outside the main project directory.

The directory is available to the child during execution and is removed after the task completes, fails, or is cancelled.

#### `retain`

Create a dedicated scratch directory outside the main project directory and retain it after execution.

The returned result should identify the retained directory when relevant.

---

## 6. Context Isolation

Context isolation is the central Phase 1 requirement.

The child must receive:

* its own fresh Pi agent context;
* the delegated task;
* the normal execution environment appropriate to the project;
* normal tools required to perform the task.

The child must not receive:

* the parent's conversation history;
* the parent's previous model messages;
* the parent's previous tool calls/results;
* the parent's internal reasoning;
* parent-only transient context;
* the parent's accumulated context merely because it is convenient to implement.

The intended relationship is:

```text
Parent AgentSession
        |
        | task
        v
New AgentSession
```

and explicitly not:

```text
Parent AgentSession
        |
        | fork/copy entire conversation
        v
Child AgentSession
```

The latter defeats the primary purpose of the extension.

---

## 7. Child Session Creation

The implementation should create a separate Pi `AgentSession`.

Prefer an in-memory/session-local session manager for Phase 1 where the Pi SDK permits this.

Conceptually:

```ts
const child = await createAgentSession({
  cwd: parent.cwd,
  sessionManager: SessionManager.inMemory(),
  // appropriate inherited configuration
});
```

The exact API should follow the current Pi SDK rather than assuming the above names/signatures are exact.

The child should inherit the normal project execution environment where appropriate, including:

* working directory;
* project configuration;
* available filesystem;
* normal tools.

It should not inherit the parent's conversation.

---

## 8. Child System Instructions

The child should receive a very small fixed instruction establishing the delegation boundary.

Conceptually:

```text
You are executing a delegated task from another Pi session.

Work on the task below independently.

The task is authoritative for what you are being asked to do.
Do not assume access to the parent conversation.

When finished, return a concise result describing:
- what you established or changed;
- important evidence;
- unresolved issues;
- generated artefacts, if any.

TASK:
<task>
```

The exact wording can be refined during implementation.

The instruction should remain deliberately small.

Do not add:

* role definitions;
* generic multi-agent philosophy;
* orchestration instructions;
* lengthy behavioural guidance;
* unnecessary explanation of the extension.

The child needs only enough information to understand the delegation boundary and expected handoff.

---

## 9. Recursive Delegation

Phase 1 should not expose the `delegate` tool to child sessions by default.

The intended initial topology is:

```text
parent
  |
  +-- child
```

not:

```text
parent
  |
  +-- child
       |
       +-- grandchild
            |
            +-- ...
```

This avoids introducing recursion, nested lifecycle management, resource multiplication, and cancellation complexity into the initial implementation.

The architecture may allow recursive delegation to be added later if there is a demonstrated need.

---

## 10. Child Execution

Once created, the child receives the delegated task and executes it using normal Pi mechanisms.

The extension should wait for the child to finish.

Phase 1 should not provide:

* background execution;
* detached execution;
* parallel children;
* automatic retries;
* automatic delegation chains.

The parent call should conceptually behave like:

```text
delegate(task)
    |
    |-- create child
    |-- execute child
    |-- capture result
    |-- clean up
    `-- return result
```

---

## 11. Result Handoff

The child should return only its final result to the parent.

The parent does not need the child's complete transcript.

Do not inject the child's:

* intermediate model messages;
* tool calls;
* tool outputs;
* internal reasoning;
* system prompt

into the parent context.

The result should be concise and useful.

A typical result might be:

```text
Delegate completed.

The failure is caused by X. The parser now produces Y while the
test expects Z. The relevant code is in A and the failing test is
B.

No files were modified.
```

If artefacts were produced:

```text
Delegate completed.

Generated the requested analysis in:
<scratch path>

The main finding is X.
```

The exact result format should not be rigidly schema-driven in Phase 1.

Plain text is preferred.

---

## 12. Result Extraction

The implementation should identify the child's final assistant response using the Pi session APIs.

Do not return the entire child transcript.

If Pi's APIs provide a clean final-response event/result, use it.

If extraction requires inspecting session messages, encapsulate that logic inside the extension rather than exposing it through the public API.

---

## 13. Scratch and Artefacts

Scratch storage is separate from the project working directory.

Do not create the default scratch directory inside:

```text
<project>/.pi/
```

or another project-local directory.

The extension should own a dedicated location, conceptually:

```text
~/.pi/agent/delegates/<task-id>/
    metadata.json
    task.md
    artifacts/
    tmp/
```

The exact location should follow Pi's established conventions where possible.

The important requirements are:

1. It is outside the main project directory.
2. It is owned/managed by the extension.
3. Each delegated task gets an isolated directory.
4. The child is told the scratch path only when scratch is enabled.
5. The parent receives the path when retained artefacts may need integration.

The parent remains responsible for deciding whether and how artefacts are incorporated into the main project.

The child should not automatically copy scratch files into the project.

---

## 14. Scratch Lifecycle

### `none`

No scratch directory.

### `ephemeral`

Create scratch storage before execution.

Remove it after:

* successful completion;
* task failure;
* cancellation.

Cleanup should occur in a `finally`-style lifecycle so that errors do not leave normal temporary data behind.

### `retain`

Create scratch storage and retain it after execution.

The final result should mention the retained path when relevant.

The extension should not attempt to determine automatically whether a file is "important enough" to retain.

Retention is an explicit caller choice.

---

## 15. Task Metadata

The extension may create internal metadata for lifecycle management.

For example:

```json
{
  "taskId": "...",
  "createdAt": "...",
  "status": "running",
  "scratch": "retain"
}
```

This metadata is extension state, not model context.

It should not be unnecessarily injected into the child prompt.

Likewise, UI/progress state should remain outside the model conversation wherever Pi's extension/session mechanisms permit.

---

## 16. Working Directory

By default, the child should execute with the same project working directory as the parent.

This gives the child access to the same source tree and project environment.

This does **not** mean the child's conversation is inherited.

The distinction is:

```text
same filesystem/project
        !=
same model context
```

The delegated task must explicitly tell the child whether it should:

* inspect files;
* modify files;
* avoid modifications;
* create artefacts;
* perform some other operation.

The extension should not infer these permissions from task wording in Phase 1.

---

## 17. File Modification

The child should have normal filesystem/tool access appropriate to its Pi session.

The parent task determines what the child is being asked to do.

For example:

```text
Inspect the implementation and report findings. Do not modify files.
```

or:

```text
Implement the requested change, run the relevant tests, and report
what changed.
```

Phase 1 does not introduce a separate permission model.

If stronger filesystem isolation becomes necessary, it should be considered as a future capability rather than built into the initial abstraction.

---

## 18. Parent Context Impact

One of the primary success criteria is that delegating work should avoid copying the parent's accumulated context into the child.

The parent should receive only the child's final result.

This means a large parent context can remain large, while the child gets a new context budget.

For example:

```text
Parent:
  20k tokens existing context

Child:
  fresh context
  task + project instructions
  potentially 20k+ tokens of independent work

Parent:
  receives concise result
```

The child therefore does not consume the parent's remaining context merely by existing.

Phase 1 does not attempt to solve the separate problem of efficiently restoring the parent's model/KV state after the child completes.

That is explicitly deferred to Phase 2.

---

## 19. Failure Handling

Child failure must not corrupt the parent session.

Failures include:

* child session creation failure;
* task execution failure;
* tool failure;
* model/inference failure;
* unexpected child termination;
* scratch creation failure;
* scratch cleanup failure.

The parent should receive a useful error/result indicating that delegation failed.

The implementation should not silently convert a failed child task into a successful result.

Scratch cleanup should still be attempted after failure.

Cleanup failure should be reported appropriately without obscuring the original task failure.

---

## 20. Cancellation

Cancellation should propagate from the parent invocation to the child execution where supported by the Pi APIs.

Conceptually:

```text
parent cancels
      |
      v
child execution cancelled
      |
      v
child disposed
      |
      v
scratch cleanup
      |
      v
parent remains usable
```

Cancellation must not leave the parent session in an unusable state.

For ephemeral scratch, cancellation must trigger cleanup.

---

## 21. Serial Concurrency

Phase 1 should support only one active delegated task per parent invocation.

There should be no requirement for concurrent children.

If the parent has:

```text
task A
task B
task C
```

they execute sequentially if delegated sequentially.

The internal implementation should nevertheless avoid relying on unsafe global mutable state that would make future concurrent execution impossible.

In particular, avoid a design where the extension assumes there can only ever be one Pi session in the entire process.

---

## 22. Extension vs Pi Core

Prefer implementing the feature entirely within the extension.

Use existing Pi mechanisms for:

* creating sessions;
* managing session lifecycle;
* running prompts;
* tool execution;
* cancellation;
* configuration;
* project environment.

Do not modify Pi core merely to make the extension's implementation more convenient.

If the current SDK cannot provide a required isolation/lifecycle capability, document the limitation and make the smallest necessary change.

---

## 23. Internal Architecture

A useful internal separation is:

```ts
interface ChildExecutor {
  execute(request: ChildTask): Promise<ChildResult>;
}
```

Phase 1 can implement this directly using a fresh Pi `AgentSession`.

Conceptually:

```text
delegate tool
      |
      v
Task lifecycle
      |
      v
ChildExecutor
      |
      v
fresh AgentSession
```

This boundary is intentional.

Future phases can introduce runtime/context/model management without changing the conceptual task-delegation API.

For example:

```text
Phase 1

ChildExecutor
    |
    v
Pi AgentSession


Future

ChildExecutor
    |
    v
ExecutionRuntime
    |
    +-- ContextRuntime
    +-- ModelRuntime
    |
    v
Pi AgentSession / inference backend
```

Do not implement these future abstractions prematurely unless they materially simplify Phase 1.

---

## 24. Model Handling

Phase 1 should not expose model selection.

The child should use the normal model configuration for its session.

Do not add:

```ts
model: "..."
```

to the public Phase 1 tool.

Do not introduce model-to-role mappings.

Do not implement model loading/unloading.

Do not assume that changing a session's model is equivalent to changing the underlying inference runtime.

Model residency and model selection are future execution-layer concerns.

---

## 25. Execution Backend Independence

Phase 1 should not depend on llama.cpp-specific functionality.

The extension should work through Pi's normal agent/session interfaces.

The design should leave room for future inference backends with different capabilities.

Examples include:

* llama.cpp;
* vLLM;
* Ollama;
* MLX-based runtimes;
* other local inference servers;
* potentially remote inference backends.

Phase 1 does not need to abstract their KV or model-management features.

That becomes relevant only when implementing context persistence and model management.

---

## 26. Future Context Persistence Boundary

Although context persistence is out of scope, Phase 1 should preserve a clean conceptual distinction:

```text
Logical session state
    |
    +-- conversation/transcript
    |
    +-- runtime execution state
          |
          +-- KV/cache/etc.
```

The transcript/session is authoritative.

Any future KV/cache state should be treated as derived acceleration state.

If a future cache is lost or invalidated, the session must remain reconstructable from its logical state.

This principle should not require implementation in Phase 1.

---

## 27. Security and Isolation Considerations

The child is intentionally context-isolated, but not necessarily sandboxed.

Context isolation means:

```text
no parent conversation
```

It does not mean:

```text
no access to parent filesystem
```

The child normally runs in the same project environment.

Therefore, the task supplied by the parent must be treated as the authority for the intended work.

Do not claim that Phase 1 provides a security sandbox.

A stronger sandbox/permission model can be considered later if needed.

---

## 28. Testing Requirements

At minimum, tests should cover:

### Basic delegation

* Parent can invoke `delegate`.
* Child session is created.
* Child receives the supplied task.
* Child executes successfully.
* Parent receives the final child result.

### Context isolation

Verify that information present only in the parent conversation is not automatically available to the child.

For example:

```text
Parent knows secret test phrase X.

Task:
"What information do you have from the parent conversation?"
```

The child should not receive X unless the task explicitly includes it.

### Filesystem inheritance

Verify that the child can access the expected project working directory.

### Scratch

Test:

* `scratch: "none"`;
* `scratch: "ephemeral"`;
* `scratch: "retain"`.

Verify that:

* scratch is outside the project directory;
* ephemeral scratch is removed;
* retained scratch remains;
* the child can write to its scratch directory.

### Result handling

Verify that:

* final result reaches the parent;
* intermediate child messages do not become parent context;
* child transcript is not unnecessarily injected into the parent.

### Failure

Test child:

* session creation failure;
* execution failure;
* tool failure where practical.

Verify the parent remains usable.

### Cancellation

Verify that:

* child execution stops;
* resources are cleaned up;
* ephemeral scratch is removed;
* parent remains usable.

### Multiple sequential tasks

Verify:

```text
parent
  -> child A
  -> child B
  -> child C
```

works without state leaking between child sessions.

### Recursive delegation

Verify that the Phase 1 child does not unexpectedly receive the delegation tool.

---

## 29. Acceptance Criteria

Phase 1 is complete when all of the following are true:

* [ ] `pi-task-delegation` can be installed/loaded as a Pi extension.
* [ ] The extension exposes a `delegate` tool.
* [ ] The tool accepts a natural-language task.
* [ ] The child runs in a fresh Pi agent context.
* [ ] Parent conversation history is not copied into the child.
* [ ] The child has the expected project working directory/environment.
* [ ] The child can perform normal Pi tool operations.
* [ ] The child returns a concise result.
* [ ] Only the final result is handed back to the parent.
* [ ] Optional scratch can be disabled.
* [ ] Optional ephemeral scratch is cleaned up.
* [ ] Optional retained scratch survives task completion.
* [ ] Scratch is outside the main project directory.
* [ ] Child failure does not corrupt the parent.
* [ ] Cancellation works without leaving the parent unusable.
* [ ] Delegated tasks execute serially.
* [ ] The child does not recursively receive the delegation tool.
* [ ] No named agent roles are required.
* [ ] No model-selection API is introduced.
* [ ] No KV/context persistence mechanism is required.
* [ ] No parallel/background execution is required.
* [ ] No persistent child-agent state is required.
* [ ] Pi core changes are avoided unless demonstrably necessary.

---

## 30. Implementation Guidance

Keep the implementation small.

The desired architecture is closer to:

```text
tool
  |
  +-- create task ID
  |
  +-- create optional scratch
  |
  +-- create fresh AgentSession
  |
  +-- execute task
  |
  +-- extract final result
  |
  +-- dispose child
  |
  +-- clean/retain scratch
  |
  `-- return result
```

than to a general-purpose multi-agent framework.

Avoid implementing speculative abstractions merely because future phases may need them.

The one architectural boundary worth preserving is the separation between:

```text
task delegation
```

and:

```text
physical inference execution
```

That allows later phases to optimise context and model management without changing the fundamental Phase 1 user experience.

---

## 31. Guiding Principles

### Fresh context by default

Delegation means isolation, not conversation forking.

### Explicit context transfer

If the child needs information from the parent, the parent puts it in the task.

### Result over transcript

The parent normally needs the child's conclusion, not its entire execution history.

### Scratch is separate from project state

Generated/intermediate artefacts belong in extension-managed scratch storage until the parent deliberately integrates them.

### Logical state over runtime state

The session/transcript is authoritative. Future inference caches are optimisation layers.

### Serial before parallel

Optimise for simplicity and constrained local compute first.

### No premature specialisation

The task defines the child's purpose. No role system is required.

### No premature model orchestration

Model selection and model residency are future concerns.

### Backend independence

Phase 1 should rely on Pi's session abstraction rather than llama.cpp-specific mechanisms.

### Optimisation must remain optional

Future context caching or model management must never be required for the logical task-delegation semantics to work.
