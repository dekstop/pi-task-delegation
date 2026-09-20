/**
 * Child agent session executor.
 *
 * Runs a delegated task in a fresh, in-process child AgentSession with a
 * clean context (no parent history). The child receives the explicit task
 * text and the normal Pi tools (read, bash, edit, write) — but never the
 * `delegate` tool (no recursive delegation). The child uses the default
 * model (no model selection).
 *
 * Two execution scopes:
 *   - "project" (default): child works in the project cwd, no scratch dir.
 *   - "isolated": child works in a fresh scratch directory (scratch = cwd),
 *     no access to project files.
 *
 * The Pi SDK is imported lazily inside executeChildTask so this module (and
 * its pure helpers) load in tests without the Pi runtime.
 */
import {
	cleanupScratch,
	createScratch,
	retainScratch,
	type ScratchConfig,
} from "./scratch.js";

/**
 * Structural mirror of the Pi SDK message shapes, so the pure helpers stay
 * testable without the Pi runtime installed. Structurally compatible with
 * the SDK's `AgentMessage[]`.
 */
export interface AgentMessageLike {
	role: string;
	content: unknown;
	stopReason?: string;
	errorMessage?: string;
}

function toMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Build the delegate framing appended to the child's default system prompt.
 * Keeps the full default prompt (tools, guidelines, project context) and
 * appends the delegate instructions plus, for isolated scope, a note that
 * the child is working in an isolated directory with no project access.
 */
export function buildDelegateFraming(scope: "project" | "isolated"): string {
	const lines = [
		"You are a delegate. You have a fresh, isolated context: you do NOT share the parent agent's conversation history.",
		"The task given to you is authoritative. Do the work needed to complete it using your tools.",
		"Keep your final answer concise: state the result, not a transcript of your steps.",
	];
	if (scope === "isolated") {
		lines.push(
			"You are working in an isolated directory with no access to the project files. Use your working directory for any intermediate files.",
		);
	}
	return lines.join("\n");
}

/**
 * Return the text of the final assistant message, or "" when there is none.
 * Joins the text parts of the last assistant message.
 */
export function extractFinalAssistantText(messages: AgentMessageLike[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		if (!Array.isArray(msg.content)) return "";
		const content = msg.content as Array<{ type: string; text?: string }>;
		return content
			.filter((p) => p.type === "text" && typeof p.text === "string")
			.map((p) => p.text)
			.join("");
	}
	return "";
}

export interface ClassifyInput {
	/** Error message when session.prompt() rejected. */
	promptError?: string;
	/** The last assistant message, or null when there is none. */
	lastAssistant?: AgentMessageLike | null;
}

export interface ClassifyResult {
	ok: boolean;
	stopReason?: string;
	error?: string;
}

/**
 * Classify the child outcome from the prompt error and the final assistant
 * message. Pure: no I/O.
 */
export function classifyOutcome(input: ClassifyInput): ClassifyResult {
	if (input.promptError) {
		return { ok: false, error: input.promptError };
	}
	const last = input.lastAssistant;
	if (!last) {
		return { ok: false, error: "child produced no assistant message" };
	}
	switch (last.stopReason) {
		case "error":
			return {
				ok: false,
				stopReason: "error",
				error: last.errorMessage || "child reported an error",
			};
		case "aborted":
			return { ok: false, stopReason: "aborted", error: "aborted" };
		case "length":
			return { ok: true, stopReason: "length" };
		case "stop":
		case "toolUse":
			return { ok: true, stopReason: last.stopReason };
		default:
			return {
				ok: false,
				stopReason: last.stopReason,
				error: `unexpected stopReason: ${last.stopReason}`,
			};
	}
}

export interface ExecuteOptions {
	/** Single path segment; the scratch directory key. */
	taskId: string;
	/** Parent working directory. */
	cwd: string;
	/** Global config directory. Default: getAgentDir(). */
	agentDir?: string;
	/**
	 * Execution scope. "project" (default): child works in the project cwd,
	 * no scratch dir. "isolated": child works in a fresh scratch directory
	 * (scratch = cwd), no project access.
	 */
	scope: "project" | "isolated";
	/**
	 * Scratch lifecycle for isolated scope. "ephemeral" (default): dir
	 * removed after the task. "retain": dir kept. Ignored for project scope.
	 */
	scratchLifecycle?: "ephemeral" | "retain";
	scratchConfig?: ScratchConfig;
	/** Parent abort signal; propagated to the child session. */
	signal?: AbortSignal;
	/**
	 * Progress hook: "starting…", then the live transcript (child tool calls
	 * + assistant text) while the child runs, then "done". Single display
	 * channel — the parent forwards it verbatim to its TUI.
	 */
	onStatus?: (status: string) => void;
}

export interface ChildResult {
	ok: boolean;
	/** The scope that was used. */
	scope: "project" | "isolated";
	/** Final assistant text ("" on failure). */
	output: string;
	/** Useful message on failure. */
	error?: string;
	/** Child's final stopReason (diagnostics). */
	stopReason?: string;
	/** Retained scratch path (isolated + retain only). */
	scratchPath?: string;
	/** Scratch cleanup failure message. */
	scratchError?: string;
}

/**
 * Run a delegated task in a fresh in-process child session and return its
 * final assistant text. Never throws: all failures are returned in the
 * ChildResult so the parent stays usable.
 */
export async function executeChildTask(
	task: string,
	options: ExecuteOptions,
): Promise<ChildResult> {
	const {
		taskId,
		cwd,
		agentDir,
		scope = "project",
		scratchLifecycle = "ephemeral",
		scratchConfig,
		signal,
		onStatus,
	} = options;

	const emit = (status: string) => {
		onStatus?.(status);
	};

	// 1. Already aborted — don't start.
	if (signal?.aborted) {
		emit("done");
		return { ok: false, scope, output: "", error: "aborted", stopReason: "aborted" };
	}

	// 2. Scratch directory (isolated scope only).
	let scratchPath: string | null = null;
	let childCwd = cwd;
	if (scope === "isolated") {
		try {
			scratchPath = await createScratch(taskId, scratchConfig);
			childCwd = scratchPath;
		} catch (err) {
			emit("done");
			return { ok: false, scope, output: "", error: toMessage(err) };
		}
	}

	// 3. Delegate framing appended to the default system prompt.
	const framing = buildDelegateFraming(scope);

	emit("starting…");

	// 4–11.
	let session: any = null;
	let abortHandler: (() => void) | null = null;
	let unsubscribe: (() => void) | null = null;
	let flushTimer: ReturnType<typeof setTimeout> | null = null;
	let live = "";
	let promptError: string | undefined;
	let messages: AgentMessageLike[] = [];
	let toolOutputTracker: Record<string, string> = {};

	// Coalesce transcript updates (~10/s cap) so the TUI isn't flooded per delta.
	// Emit the full accumulated text each flush so the TUI always shows the
	// complete live transcript rather than partial chunks.
	const scheduleFlush = () => {
		if (flushTimer !== null) return;
		flushTimer = setTimeout(() => {
			flushTimer = null;
			emit(live);
		}, 100);
	};
	const clearFlushTimer = () => {
		if (flushTimer !== null) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
	};

	try {
		// Deferred so this module loads without the Pi runtime.
		const sdk = await import("@mariozechner/pi-coding-agent");
		const { DefaultResourceLoader, SessionManager, createAgentSession, getAgentDir } = sdk;

		// 4. Resource loader with the appended delegate framing.
		const loader = new DefaultResourceLoader({
			cwd: childCwd,
			agentDir: agentDir ?? getAgentDir(),
			appendSystemPromptOverride: (base: string[]) => [...base, framing],
		});
		await loader.reload();

		// 5. Fresh in-process child session: clean context, child cwd,
		//    normal tools, never `delegate`.
		const created = await createAgentSession({
			resourceLoader: loader,
			sessionManager: SessionManager.inMemory(),
			cwd: childCwd,
			tools: ["read", "bash", "edit", "write"],
		});
		session = created.session;

		// 6. Propagate parent abort to the child.
		if (signal) {
			abortHandler = () => {
				void session.abort();
			};
			if (signal.aborted) abortHandler();
			else signal.addEventListener("abort", abortHandler);
		}

		// 7a. Live transcript: stream the child's tool calls, tool output,
		//     assistant text, and reasoning through the onStatus channel.
		unsubscribe = session.subscribe((event: any) => {
			if (event.type === "tool_execution_start") {
				const prefix = (live ? "\n" : "") + "→ [" + event.toolName + "] ";
				if (event.toolName === "bash" && event.args?.command) {
					live += prefix + "$ " + event.args.command + "\n";
				} else if (event.args?.path) {
					live += prefix + event.args.path + "\n";
				} else {
					live += prefix;
				}
				scheduleFlush();
			} else if (event.type === "tool_execution_update") {
				// partialResult.content contains accumulated output (not deltas).
				// Track per toolCallId so we only append new text.
				const content = event.partialResult?.content;
				if (Array.isArray(content) && event.toolCallId) {
					const text = content
						.filter((p: any) => p.type === "text" && typeof p.text === "string")
						.map((p: any) => p.text)
						.join("");
					if (text) {
						const last = toolOutputTracker[event.toolCallId] ?? "";
						const delta = text.slice(last.length);
						if (delta) {
							live += delta;
							toolOutputTracker[event.toolCallId] = text;
							scheduleFlush();
						}
					}
				}
			} else if (event.type === "tool_execution_end") {
					if (event.isError) {
						live += " ✗";
						scheduleFlush();
					}
				} else if (event.type === "message_update") {
				const ae = event.assistantMessageEvent;
				if (ae?.type === "text_delta") {
					live += ae.delta;
					scheduleFlush();
				} else if (ae?.type === "thinking_delta") {
					// Skip thinking content — it pollishes the live output.
				}
			}
		});

		// 7b. Run the task to completion.
		try {
			await session.prompt(task);
		} catch (err) {
			promptError = toMessage(err);
		}

		// 7c. Final flush so the last chunk isn't lost.
		clearFlushTimer();
		if (live) emit(live);

		// 8. Snapshot the conversation (for final-message extraction).
		messages = (session.messages ?? []).slice();
	} catch (err) {
		emit("done");
		return { ok: false, scope, output: "", error: `failed to start child session: ${toMessage(err)}` };
	} finally {
		// 11. Always clean up.
		unsubscribe?.();
		clearFlushTimer();
		if (abortHandler && signal) signal.removeEventListener("abort", abortHandler);
		if (session) {
			try {
				session.dispose();
			} catch {
				// best-effort
			}
		}
	}

	// 9. Classify the outcome.
	let lastAssistant: AgentMessageLike | null = null;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") {
			lastAssistant = messages[i];
			break;
		}
	}
	const classified = classifyOutcome({ promptError, lastAssistant });
	if (!classified.ok) {
		emit("done");
		return {
			ok: false,
			scope,
			output: "",
			error: classified.error,
			stopReason: classified.stopReason,
		};
	}

	const output = extractFinalAssistantText(messages);

	// 10. Scratch lifecycle (isolated scope only).
	let scratchResultPath: string | undefined;
	let scratchError: string | undefined;
	if (scope === "isolated") {
		if (scratchLifecycle === "ephemeral") {
			const cleanup = await cleanupScratch(taskId, scratchConfig);
			if (!cleanup.ok) scratchError = cleanup.error;
		} else if (scratchLifecycle === "retain") {
			const retained = await retainScratch(taskId, scratchConfig);
			scratchResultPath = retained ?? scratchPath ?? undefined;
		}
	}

	emit("done");
	return {
		ok: true,
		scope,
		output,
		scratchPath: scratchResultPath,
		scratchError,
	};
}
