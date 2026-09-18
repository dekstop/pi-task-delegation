/**
 * Child agent session executor.
 *
 * Runs a delegated task in a fresh, in-process child AgentSession with a
 * clean context (no parent history). The child receives the explicit task
 * text, the project working directory, and the normal Pi tools
 * (read, bash, edit, write) — but never the `subagent` tool (no recursive
 * delegation). The child uses the default model (no model selection).
 *
 * The Pi SDK is imported lazily inside executeChildTask so this module (and
 * its pure helpers) load in tests without the Pi runtime.
 */
import {
	cleanupScratch,
	createScratch,
	retainScratch,
	type ScratchConfig,
	type ScratchMode,
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
 * Build the subagent framing appended to the child's default system prompt.
 * Keeps the full default prompt (tools, guidelines, project context) and
 * appends the subagent instructions plus, when enabled, the scratch path.
 */
export function buildSubagentFraming(scratchPath?: string | null): string {
	const lines = [
		"You are a subagent. You have a fresh, isolated context: you do NOT share the parent agent's conversation history.",
		"The task given to you is authoritative. Do the work needed to complete it using your tools.",
		"Keep your final answer concise: state the result, not a transcript of your steps.",
	];
	if (scratchPath) {
		lines.push(
			`Your scratch directory is ${scratchPath}. Use it for intermediate files; it lives outside the project.`,
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
	/** Parent working directory — the child shares the project environment. */
	cwd: string;
	/** Global config directory. Default: getAgentDir(). */
	agentDir?: string;
	/** Scratch lifecycle. Default: "none". */
	scratchMode?: ScratchMode;
	scratchConfig?: ScratchConfig;
	/** Parent abort signal; propagated to the child session. */
	signal?: AbortSignal;
	/** Progress hook. Minimal: "starting" and "done". */
	onStatus?: (status: string) => void;
}

export interface ChildResult {
	ok: boolean;
	/** Final assistant text ("" on failure). */
	output: string;
	/** Useful message on failure. */
	error?: string;
	/** Child's final stopReason (diagnostics). */
	stopReason?: string;
	/** Retained scratch path (retain mode). */
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
		scratchMode = "none",
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
		return { ok: false, output: "", error: "aborted", stopReason: "aborted" };
	}

	// 2. Scratch directory.
	let scratchPath: string | null = null;
	try {
		scratchPath = await createScratch(taskId, scratchMode, scratchConfig);
	} catch (err) {
		emit("done");
		return { ok: false, output: "", error: toMessage(err) };
	}

	// 3. Subagent framing appended to the default system prompt.
	const framing = buildSubagentFraming(scratchPath);

	emit("starting");

	// 4–11.
	let session: any = null;
	let abortHandler: (() => void) | null = null;
	let promptError: string | undefined;
	let messages: AgentMessageLike[] = [];

	try {
		// Deferred so this module loads without the Pi runtime.
		const sdk = await import("@mariozechner/pi-coding-agent");
		const { DefaultResourceLoader, SessionManager, createAgentSession, getAgentDir } = sdk;

		// 4. Resource loader with the appended subagent framing.
		const loader = new DefaultResourceLoader({
			cwd,
			agentDir: agentDir ?? getAgentDir(),
			appendSystemPromptOverride: (base: string[]) => [...base, framing],
		});
		await loader.reload();

		// 5. Fresh in-process child session: clean context, project cwd,
		//    normal tools, never `subagent`.
		const created = await createAgentSession({
			resourceLoader: loader,
			sessionManager: SessionManager.inMemory(),
			cwd,
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

		// 7. Run the task to completion.
		try {
			await session.prompt(task);
		} catch (err) {
			promptError = toMessage(err);
		}

		// 8. Snapshot the conversation (for final-message extraction).
		messages = (session.messages ?? []).slice();
	} catch (err) {
		emit("done");
		return { ok: false, output: "", error: `failed to start child session: ${toMessage(err)}` };
	} finally {
		// 11. Always clean up.
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
			output: "",
			error: classified.error,
			stopReason: classified.stopReason,
		};
	}

	const output = extractFinalAssistantText(messages);

	// 10. Scratch lifecycle.
	let scratchResultPath: string | undefined;
	let scratchError: string | undefined;
	if (scratchMode === "ephemeral") {
		const cleanup = await cleanupScratch(taskId, scratchConfig);
		if (!cleanup.ok) scratchError = cleanup.error;
	} else if (scratchMode === "retain") {
		const retained = await retainScratch(taskId, scratchConfig);
		scratchResultPath = retained ?? scratchPath ?? undefined;
	}

	emit("done");
	return {
		ok: true,
		output,
		scratchPath: scratchResultPath,
		scratchError,
	};
}
