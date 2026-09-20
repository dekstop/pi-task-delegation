## T-012 — Inherit parent context option

Add a delegate option so the child inherits the parent's full conversation history as a perfect copy, enabling prompt caching benefits.

## Dependencies
- None

## Acceptance criteria
- [ ] New `context` parameter on the `delegate` tool: `"inherit" | "clean"` (default `"clean"`)
- [ ] `context: "inherit"` passes the parent's full message history to the child as a perfect copy
- [ ] Child session starts with identical system prompt + full conversation history
- [ ] Existing `scope` and `scratch` parameters remain unaffected
- [ ] Backward compatible — default `"clean"` preserves current behaviour
- [ ] Extension schema, description, and prompt guidelines updated

### Next
Inspect `executor.ts` and `scratch.ts` to understand how the child session is initialised, then add the `context` parameter and pass the parent messages through when `"inherit"`.

### Notes
- Prompt caching requires identical prefix messages — a perfect copy of the parent history is essential.
- The child must NOT receive the `delegate` tool (no recursive delegation) — this is unchanged.
- The child uses the same `cwd` as the parent (per existing design).
- Keep the implementation small — avoid speculative abstractions.

### Unknowns
- How the Pi SDK exposes the parent conversation history to a child session (need to inspect `createAgentSession` API).
- Whether the SDK automatically caches identical prefixes or if we need to ensure byte-for-byte equality.

### Hypothesis
The SDK's `createAgentSession()` accepts a messages array; passing the parent's full history (system prompt + all messages) should give the child an identical starting context.
