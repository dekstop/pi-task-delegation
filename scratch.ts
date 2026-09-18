/**
 * Scratch directory lifecycle manager.
 *
 * Each delegated task may get an isolated scratch directory under the
 * configured scratch base directory (default: <agentDir>/subagents/).
 * Scratch storage is always outside the project working directory.
 *
 * Layout:
 *   <base>/<task-id>/
 *     artifacts/
 *     tmp/
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type ScratchMode = "none" | "ephemeral" | "retain";

export interface ScratchConfig {
	/** Base directory for scratch storage. Default: <agentDir>/subagents. */
	scratchBaseDir?: string;
}

/**
 * Resolve the scratch base directory. The Pi SDK import is deferred so this
 * module stays testable without the Pi runtime (tests always pass an
 * explicit `scratchBaseDir` override).
 */
async function resolveBaseDir(config?: ScratchConfig): Promise<string> {
	if (config?.scratchBaseDir) {
		return config.scratchBaseDir;
	}
	const { getAgentDir } = await import("@mariozechner/pi-coding-agent");
	return path.join(getAgentDir(), "subagents");
}

/** A task id must be a single path segment — no separators, no traversal. */
function assertTaskId(taskId: string): void {
	if (typeof taskId !== "string" || taskId.length === 0) {
		throw new Error("taskId must be a non-empty string");
	}
	if (taskId === "." || taskId === ".." || taskId.includes("/") || taskId.includes("\\")) {
		throw new Error(`Unsafe taskId: ${taskId}`);
	}
}

function toMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Create the scratch directory for a task.
 *
 * Returns the scratch path, or null when scratch is disabled
 * (`mode === "none"`). Throws a clear error when directory creation fails.
 */
export async function createScratch(
	taskId: string,
	mode: ScratchMode,
	config?: ScratchConfig,
): Promise<string | null> {
	if (mode === "none") {
		return null;
	}
	assertTaskId(taskId);
	const baseDir = await resolveBaseDir(config);
	const dir = path.join(baseDir, taskId);
	try {
		await fs.promises.mkdir(path.join(dir, "artifacts"), { recursive: true });
		await fs.promises.mkdir(path.join(dir, "tmp"), { recursive: true });
	} catch (err) {
		throw new Error(`Failed to create scratch directory ${dir}: ${toMessage(err)}`);
	}
	return dir;
}

export interface CleanupResult {
	ok: boolean;
	/** Error message when cleanup failed. */
	error?: string;
}

/**
 * Remove the scratch directory for a task. Best-effort: never throws,
 * failures are returned in the result so the caller can report them
 * without obscuring the original task outcome.
 */
export async function cleanupScratch(
	taskId: string,
	config?: ScratchConfig,
): Promise<CleanupResult> {
	try {
		assertTaskId(taskId);
		const baseDir = await resolveBaseDir(config);
		const dir = path.join(baseDir, taskId);
		await fs.promises.rm(dir, { recursive: true, force: true });
		return { ok: true };
	} catch (err) {
		return { ok: false, error: toMessage(err) };
	}
}

/**
 * Return the scratch path for a retained task, or null when the directory
 * does not exist. Retention is a no-op by design: the directory is simply
 * not removed, so this only resolves the path for the result message.
 */
export async function retainScratch(
	taskId: string,
	config?: ScratchConfig,
): Promise<string | null> {
	assertTaskId(taskId);
	const baseDir = await resolveBaseDir(config);
	const dir = path.join(baseDir, taskId);
	try {
		await fs.promises.access(dir);
		return dir;
	} catch {
		return null;
	}
}
