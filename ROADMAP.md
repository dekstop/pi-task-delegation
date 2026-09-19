# pi-task-delegation — Future Roadmap

## 1. Purpose

This document describes possible future development beyond Phase 1 of `pi-task-delegation`.

Unlike the Phase 1 implementation specification, this is intentionally **non-binding and exploratory**.

Phase 1 may prove sufficient for most practical use.

The main question to answer before investing heavily in later phases is:

> **How well does parent-context restoration work in practice, and how much time/memory does it save compared with simply reconstructing the parent context?**

If the answer is "well enough", Phase 2 may provide substantial value for local LLM usage.

If the answer is "not much", or the complexity/cost of maintaining runtime-specific cache support is too high, the project may reasonably stop after Phase 1.

The guiding principle is therefore:

> **Measure first; optimise only where the measured bottleneck warrants it.**

---

# 2. Overall Journey

The current proposed journey is:

```text
Phase 1
Context-isolated task delegation
        |
        v
Phase 2
Context persistence / restoration
        |
        v
Phase 3
Model residency / model swapping
        |
        v
Phase 4
Runtime optimisation / scheduling
```

These phases are progressively more dependent on the capabilities of the underlying inference engine.

Phase 1 should remain useful and complete without any of them.

---

# 3. Phase 1 — Context-Isolated Task Delegation

**Status: planned / primary implementation target**

Phase 1 provides the core capability:

```text
Parent session
      |
      | explicit task
      v
Fresh child session
      |
      | concise result
      v
Parent session
```

The goal is context isolation rather than agent specialisation.

### Core capabilities

* fresh child Pi session;
* explicit task handoff;
* no implicit parent conversation transfer;
* concise result returned to parent;
* optional external scratch;
* serial execution;
* lifecycle/error/cancellation handling.

### Explicitly excluded

* model selection;
* model swapping;
* KV-cache management;
* persistent context snapshots;
* parallel delegates;
* agent roles;
* persistent child state.

### Success criterion

The main question is simply:

> Does delegating self-contained work into a fresh context materially improve the usefulness of Pi when context is constrained?

If yes, the feature is already valuable even if all later phases are abandoned.

---

# 4. Phase 2 — Context Persistence and Restoration

**Status: speculative**

## Objective

Reduce the cost of returning to a parent session after a child has executed.

The problem is:

```text
Parent
  20–30k tokens of context
       |
       v
Child runs
       |
       v
Parent resumes
```

Without runtime-level context persistence, the parent may need to reconstruct and prefill its context before continuing.

With a reusable inference-state cache:

```text
Parent context
      |
      | suspend
      v
KV/cache snapshot
      |
      v
Child execution
      |
      v
restore parent KV/cache
      |
      v
Parent continues
```

The logical session remains the source of truth. The cache is merely an optimisation.

---

## 4.1 First question: does this actually matter?

This should be answered experimentally before building a substantial abstraction.

Measure:

```text
Parent context size
Child execution time
Parent restoration time
Cache save time
Cache restore time
Memory usage
Disk usage, if applicable
```

Compare:

```text
A: reconstruct parent context
B: restore cached context
```

across realistic context sizes.

For example:

```text
5k tokens
10k tokens
20k tokens
30k tokens
```

The important metric is not merely cache restore speed.

It is:

```text
total delegation overhead
=
suspend cost
+ child execution
+ resume cost
```

versus:

```text
reconstruct parent
=
session reconstruction
+ context prefill
```

A cache mechanism that restores in 100ms but requires an expensive 2-second snapshot is not necessarily useful.

---

# 5. Phase 2.1 — Opportunistic Context Reuse

The least invasive form of Phase 2 should be explored first.

If the inference backend already provides prompt/prefix caching, the extension may be able to benefit simply by maintaining stable session/context identities.

No explicit persistence abstraction may be necessary.

The extension should investigate what the current Pi + inference stack already does before implementing its own cache management.

---

# 6. Phase 2.2 — In-Memory Context Residency

If the backend supports multiple contexts/slots and available memory permits it, the parent context may simply remain resident while the child runs.

Conceptually:

```text
Inference runtime

Parent context ── resident
Child context  ── active
```

After the child completes:

```text
Child ── released
Parent ── resumed
```

This avoids disk persistence entirely.

The trade-off is memory.

A parent with a large context plus a large child context may require substantial KV memory.

---

# 7. Phase 2.3 — Persistent Context Snapshots

If contexts cannot all remain resident, a context may be suspended into a persistent representation.

Conceptually:

```text
Parent
  |
  | snapshot
  v
Persistent execution state
  |
  | evict
  v
Child runs
  |
  | restore
  v
Parent
```

The exact implementation is backend-specific.

For example, llama.cpp provides slot/KV-cache mechanisms that make this a practical area for experimentation.

Other inference engines may use substantially different mechanisms.

The extension should therefore avoid assuming that every backend exposes a llama.cpp-style "save slot / restore slot" interface.

---

# 8. Context Persistence Abstraction

If Phase 2 proves worthwhile, introduce a backend capability boundary.

Conceptually:

```ts
interface ContextPersistence {
  canSnapshot(context: Context): boolean;

  snapshot(context: Context): Promise<ContextSnapshot>;

  restore(
    snapshot: ContextSnapshot,
    context: Context
  ): Promise<void>;

  discard(snapshot: ContextSnapshot): Promise<void>;
}
```

This is illustrative rather than a final API.

The important property is:

> The delegation/session layer should not need to know how a backend preserves execution state.

A llama.cpp implementation might use KV/slot snapshots.

Another backend might use:

* server-side prefix caches;
* resident execution slots;
* block caches;
* native session handles;
* some completely different mechanism.

A backend with no useful persistence capability should simply fall back to context reconstruction.

---

# 9. Context Snapshot Semantics

A snapshot must be considered **derived runtime state**, not authoritative session state.

Conceptually:

```text
Session
├── transcript / logical state     ← authoritative
│
└── execution snapshot             ← disposable optimisation
```

If the snapshot disappears:

```text
snapshot unavailable
      |
      v
reconstruct from session
```

The extension must still be able to continue.

This protects against:

* process restarts;
* cache corruption;
* incompatible runtime versions;
* model changes;
* tokenizer changes;
* configuration changes;
* manual cache deletion.

---

# 10. Cache Identity and Invalidation

A future snapshot system will need to establish when a saved execution state is still valid.

Potential compatibility inputs include:

* model identity;
* model revision;
* tokenizer;
* chat template;
* system prompt;
* tool definitions;
* relevant runtime configuration;
* context/token sequence;
* backend/runtime version.

The exact representation should be determined by the inference backend.

The extension should never blindly assume:

```text
session ID == valid cache
```

A logical session may survive while its physical execution state becomes invalid.

---

# 11. Phase 2.5 — Resource Accounting

**Status: speculative**

If context persistence proves useful, the next concern is deciding **when** to retain, snapshot, or discard execution state.

The runtime may eventually need rough information about:

```text
Model memory
KV memory
Context length
Number of resident contexts
Available memory
Snapshot size
Save/restore cost
```

Perfect accounting is not required.

Useful approximate information may be enough to make sensible decisions.

For example:

```text
small parent context
    → reconstruct

large parent context
    → retain/snapshot

memory pressure
    → evict cached contexts
```

---

# 12. Phase 2.6 — Context Cache Policy

A future context manager could maintain multiple suspended sessions:

```text
Session A   active
Session B   resident
Session C   persistent snapshot
Session D   transcript only
```

Potential policies could include:

* least recently used;
* favour currently active parent sessions;
* evict largest contexts first;
* snapshot only above a context-size threshold;
* keep recently suspended contexts resident;
* limit total cache memory.

These should not become user-facing configuration until there is evidence that users need control.

A simple policy should be preferred initially.

---

# 13. Phase 2.7 — Observability

Context persistence will be difficult to evaluate without measuring it.

The extension should eventually be able to report internal metrics such as:

```text
context restore:
  cache hit
  restore time: 140ms

context restore:
  cache miss
  reconstruction time: 6.8s
```

and:

```text
snapshot:
  size: X MB
  save time: Y ms
```

For model switching:

```text
model transition:
  A → B
  load time: X s
```

These metrics should primarily be developer/runtime telemetry, not automatically injected into the model's context.

---

# 14. Phase 3 — Model Residency and Model Swapping

**Status: speculative and likely substantially more complex**

Phase 3 becomes relevant if users want delegated tasks to use different models.

For example:

```text
Parent
  model A
      |
      v
Child
  model B
```

This is especially relevant in local environments where model weights cannot all remain resident.

The conceptual lifecycle becomes:

```text
Suspend parent context
        |
        v
Acquire child model
        |
        v
Run child
        |
        v
Release child model
        |
        v
Restore parent model
        |
        v
Restore parent context
        |
        v
Continue parent
```

---

# 15. Model Runtime Abstraction

The extension should not assume that:

```text
one model = one process
```

Different inference engines have different runtime architectures.

The useful abstraction is instead:

> Make a particular model available for execution.

Conceptually:

```ts
interface ModelRuntime {
  acquire(modelId: string): Promise<ModelLease>;
}

interface ModelLease {
  modelId: string;
  release(): Promise<void>;
}
```

The implementation might:

* switch an existing server;
* load/unload a model;
* change a process configuration;
* connect to an already-running model;
* do nothing because the requested model is already resident.

The extension should not expose those implementation details.

---

# 16. Logical Model vs Resident Model

A Pi session should retain its logical model identity independently of physical model residency.

For example:

```text
Parent session
  logical model = A

Runtime:
  currently resident = B
```

This is valid.

When the parent resumes:

```text
acquire A
restore parent context
continue
```

The parent session itself should not become logically associated with B merely because B happened to be resident during child execution.

This distinction becomes increasingly important if multiple Pi sessions exist.

---

# 17. Model Selection Policy

If Phase 3 is implemented, the public API could eventually allow something like:

```ts
delegate({
  task: "...",
  model: "model-b"
})
```

However, the exact model-selection semantics should be designed only after Phase 2 and real usage have been evaluated.

Potential sources of model choice include:

1. explicit task request;
2. inherited parent model;
3. configured default;
4. task/context requirements;
5. resource constraints;
6. latency/quality trade-offs.

No role-to-model mapping should be introduced merely for convenience.

The task remains the primary semantic unit.

---

# 18. Model Switching and Context Persistence Are Coupled

Phase 3 depends heavily on Phase 2.

Suppose:

```text
Parent
  model A
  25k context
```

must temporarily switch to:

```text
Child
  model B
```

The parent execution state must survive the transition.

Therefore:

```text
Phase 3
model swapping
       |
       v
requires reliable context suspension/restoration
```

This is one reason model swapping should not be attempted before context persistence has been evaluated.

---

# 19. Runtime Capability Model

If multiple inference engines are supported, the extension should use capabilities rather than backend-specific assumptions.

Conceptually:

```ts
interface ExecutionCapabilities {
  prefixCaching?: boolean;
  contextPersistence?: boolean;
  multipleContexts?: boolean;
  multipleModels?: boolean;
  modelSwitching?: boolean;
}
```

This is illustrative, not a final API.

The runtime might report:

```text
llama.cpp
  context persistence       yes
  multiple contexts        yes
  multiple resident models depends on configuration

another backend
  prefix caching            yes
  persistent snapshots      no
  multiple contexts        yes
  model switching           no
```

The extension should degrade gracefully.

---

# 20. Why Backend-Specific Support Matters

Execution-engine support is likely to become one of the major sources of complexity after Phase 1.

Different engines expose different abstractions.

For example:

```text
llama.cpp
  slots
  KV cache
  prompt caching
  persistent slot state

vLLM
  block-based KV cache
  automatic prefix caching
  server-managed execution

other runtimes
  potentially completely different mechanisms
```

Therefore the extension should avoid building a universal abstraction that pretends these mechanisms are identical.

Instead:

```text
Pi logical semantics
        |
        v
generic execution capability
        |
        +---- llama.cpp adapter
        |
        +---- vLLM adapter
        |
        +---- other backend adapters
```

The generic layer describes what the extension needs.

Each backend determines how to provide it.

---

# 21. Phase 4 — Runtime Optimisation and Scheduling

**Status: highly speculative**

Only consider this if Phases 1–3 demonstrate a real need.

Potential capabilities include:

* multiple simultaneously resident models;
* multiple active contexts;
* context cache eviction;
* model load scheduling;
* resource-aware task execution;
* queueing;
* prioritisation;
* background work;
* parallel children.

This is where `pi-task-delegation` could evolve towards a general local inference runtime manager.

However, this is deliberately **not** the current goal.

---

# 22. Parallel Delegation

Parallel execution is potentially useful:

```text
Parent
  |
  +-- Child A
  +-- Child B
  +-- Child C
```

but it introduces significant additional complexity for local inference:

* GPU/CPU contention;
* multiple KV contexts;
* model residency;
* memory pressure;
* result ordering;
* cancellation;
* synthesis;
* scheduling.

Given the likely constrained local environment, serial execution should remain the baseline unless real workloads demonstrate a compelling need.

---

# 23. Potential Phase 4 Resource Scheduler

If parallel execution eventually becomes worthwhile, a scheduler could reason about:

```text
Task
  ├── model requirement
  ├── expected context size
  ├── expected compute
  └── priority
```

and runtime state:

```text
Model A resident
Model B not resident

Context A resident
Context B snapshot
Memory pressure high
```

The scheduler could then determine execution order.

This should be considered a separate optimisation problem rather than part of the core task-delegation abstraction.

---

# 24. Important Cross-Phase Principle: Transcript Is the Source of Truth

Across all phases:

```text
Logical session
       |
       +---- transcript
       |
       +---- runtime state
              |
              +---- KV cache
              +---- model residency
              +---- execution handles
```

The transcript/session state must remain authoritative.

Runtime state is disposable.

This means the system can recover from:

```text
cache loss
model unload
process restart
runtime failure
backend change
```

by reconstructing the logical session.

This principle is essential if the extension becomes more sophisticated.

---

# 25. Important Cross-Phase Principle: Optimisation Must Be Transparent

The user should not have to understand:

* KV caches;
* slots;
* model residency;
* cache eviction;
* runtime processes.

The fundamental operation remains:

```text
delegate(task)
```

The runtime should optimise that operation underneath.

A user should not need to change how they delegate a task simply because the backend supports a better cache.

---

# 26. Important Cross-Phase Principle: Capability-Based Degradation

If a backend does not support a particular optimisation:

```text
context snapshot unavailable
        |
        v
reconstruct context
```

If multiple model residency is unavailable:

```text
model swap required
        |
        v
serially unload/load models
```

If model switching isn't available:

```text
requested model unavailable
        |
        v
fail explicitly
```

Do not silently substitute a different model merely because it is available.

Correctness should take precedence over optimisation.

---

# 27. Open Questions

These questions should remain explicitly unresolved until practical experimentation provides evidence.

### 27.1 How useful is parent context restoration?

This is probably the most important question.

Measure whether:

```text
snapshot + restore
```

is meaningfully better than:

```text
reconstruct + prefill
```

for realistic Pi sessions.

This should determine whether Phase 2 is worth substantial engineering effort.

### 27.2 How much memory does a typical parent context consume?

A nominal 30k-token context does not directly translate into one universal memory cost.

It depends on:

* model;
* KV precision;
* architecture;
* number of layers;
* attention configuration;
* runtime implementation.

Measure real workloads.

### 27.3 How expensive are persistent snapshots?

Snapshot size, disk throughput and save/restore latency need to be measured rather than assumed.

### 27.4 Can Pi's existing session/runtime mechanisms already provide enough reuse?

Before adding an extension-level persistence system, determine what Pi and the selected inference backend already do automatically.

### 27.5 How portable does context persistence need to be?

It may be reasonable for Phase 2 to support only one backend initially.

Do not build a complex multi-backend abstraction until there is evidence that multiple backends matter.

### 27.6 Is model swapping actually useful?

If most delegated tasks work well with the parent's existing model, model switching may provide little practical value relative to its complexity.

### 27.7 How frequently do users delegate tasks?

If delegation is infrequent, aggressive cache management may not repay its implementation and memory costs.

If delegation becomes a frequent interaction pattern, persistent contexts may become much more valuable.

---

# 28. Suggested Evaluation Strategy

Rather than committing to all phases now, evaluate the project incrementally.

## After Phase 1

Use it for real work.

Measure qualitatively:

* Does isolated context make delegation useful?
* Does the parent/child interaction feel natural?
* Are returned results sufficient?
* Is scratch useful?
* Are users frequently delegating tasks?

If the answer is "yes", continue investigating Phase 2.

## Before Phase 2 implementation

Build a small experimental benchmark.

Compare:

```text
A:
parent → child → reconstruct parent

B:
parent → child → restore parent
```

Test multiple parent context sizes and realistic local models.

Record:

* latency;
* memory;
* snapshot size;
* restore reliability;
* failure modes.

Only proceed if the improvement is meaningful.

## After Phase 2

Use the same approach for model switching.

Measure:

```text
same model
vs
different model
```

and:

```text
context restoration
+
model loading
+
context restoration
```

before committing to Phase 3.

---

# 29. Likely Stopping Points

There is no requirement to reach Phase 4.

Potential successful endpoints are:

### Phase 1 only

A lightweight task-delegation extension that provides useful context isolation.

This may be sufficient for many users.

### Phase 2

A task-delegation extension with efficient context suspension/restoration for constrained local inference.

This is potentially the most valuable optimisation for long-running sessions.

### Phase 3

A runtime-aware delegation system capable of switching models.

This is substantially more specialised and should be justified by actual workloads.

### Phase 4

A local inference scheduler/orchestrator.

This would be a much larger system and should only be pursued if the preceding phases demonstrate a genuine need.

---

# 30. Recommended Development Philosophy

The project should grow according to measured bottlenecks:

```text
Useful delegation?
        |
        +-- no → stop
        |
        +-- yes
             |
             v
Parent restoration expensive?
        |
        +-- no → Phase 1 may be sufficient
        |
        +-- yes
             |
             v
Context persistence worthwhile?
        |
        +-- no → stop
        |
        +-- yes
             |
             v
Different models materially useful?
        |
        +-- no → stop
        |
        +-- yes
             |
             v
Model runtime management
```

This is preferable to building a general-purpose multi-agent framework in anticipation of problems that may never arise.

---

# 31. Architectural North Star

The long-term architectural idea is not:

> Build a sophisticated multi-agent framework.

It is:

> **Give Pi a lightweight way to move work between isolated execution contexts while efficiently managing the expensive runtime state behind those contexts.**

Phase 1 solves the first half.

Phase 2 may solve the most important runtime cost.

Phase 3 may extend the system into model-aware execution.

Everything after that is optional.

The simplest successful implementation remains the preferred outcome.
