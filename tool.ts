/**
 * Delegate tool logic — pure, SDK-free at load time.
 *
 * Kept separate from index.ts so it loads in tests without the Pi runtime
 * (index.ts imports typebox / @mariozechner/pi-ai, which are provided by Pi
 * at runtime, not installed locally). This module imports only ./executor.js
 * and node:crypto.
 */
import { randomUUID } from "node:crypto";
import { executeChildTask, type ChildResult } from "./executor.js";

/** Validated tool parameters. */
export interface DelegateToolParams {
	/** Natural-language task description (required). */
	task: string;
	/** Scratch lifecycle. Default: "none". */
	scratch?: "none" | "ephemeral" | "retain";
}

/** The slice of the tool execution context the tool needs. */
export interface ToolContext {
	/** Parent working directory — the child shares the project environment. */
	cwd: string;
}

/**
 * The tool outcome. `text` is already mapped for the LLM: the child's
 * output on success, or a useful error message on failure. The caller
 * decides how to surface it (return vs throw — see index.ts).
 */
export interface ToolOutcome {
	ok: boolean;
	text: string;
}

/**
 * Map a ChildResult to the text shown to the parent LLM. Pure: no I/O.
 *
 * - ok:true  → the child's final assistant text; a retained scratch path is
 *   mentioned; a scratch cleanup failure is appended without obscuring the
 *   main outcome.
 * - ok:false → a useful error message (scratch errors appended, not
 *   replacing the main error).
 */
export function mapChildResultToText(result: ChildResult): string {
	if (result.ok) {
		const lines: string[] = [];
		if (result.output) lines.push(result.output);
		if (result.scratchPath) lines.push(`Scratch retained at: ${result.scratchPath}`);
		if (result.scratchError) lines.push(`Warning: scratch cleanup failed: ${result.scratchError}`);
		return lines.length > 0 ? lines.join("\n") : "(no output)";
	}

	const parts: string[] = [`Delegate failed: ${result.error ?? "unknown error"}`];
	if (result.scratchError) {
		parts.push(`Scratch error: ${result.scratchError}`);
	}
	return parts.join("\n");
}

export interface RunOptions {
	/** Parent abort signal; propagated to the child session. */
	signal?: AbortSignal;
	/** Progress hook (minimal: "starting"/"done"). */
	onStatus?: (status: string) => void;
}

/**
 * Run a single delegated task: generate a task id, call executeChildTask,
 * and map the ChildResult to text. Never throws — failures are returned in
 * the ToolOutcome so the caller (index.ts) can surface them via a thrown
 * error (which is how the SDK sets isError).
 */
export async function runDelegateTask(
	params: DelegateToolParams,
	ctx: ToolContext,
	options: RunOptions = {},
): Promise<ToolOutcome> {
	const result = await executeChildTask(params.task, {
		taskId: randomUUID(),
		cwd: ctx.cwd,
		scratchMode: params.scratch ?? "none",
		signal: options.signal,
		onStatus: options.onStatus,
	});
	return { ok: result.ok, text: mapChildResultToText(result) };
}
