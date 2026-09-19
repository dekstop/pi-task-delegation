/**
 * Scratch directory lifecycle manager.
 *
 * Each delegated task gets an isolated scratch directory inside the project
 * under `.pi/delegates/<task-id>/`. Scratch storage is always project-local.
 *
 * Layout:
 *   <cwd>/.pi/delegates/<task-id>/
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface ScratchConfig {
	/** Base directory for scratch storage. Default: <cwd>/.pi/delegates. */
	scratchBaseDir?: string;
}

/**
 * Resolve the scratch base directory. Tests always pass an explicit
 * `scratchBaseDir` override.
 */
async function resolveBaseDir(config?: ScratchConfig, cwd?: string): Promise<string> {
	if (config?.scratchBaseDir) {
		return config.scratchBaseDir;
	}
	return path.join(cwd ?? ".", ".pi", "delegates");
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
 * Returns the scratch path. Throws a clear error when directory creation fails.
 */
export async function createScratch(
	taskId: string,
	config?: ScratchConfig,
	cwd?: string,
): Promise<string> {
	assertTaskId(taskId);
	const baseDir = await resolveBaseDir(config, cwd);
	const dir = path.join(baseDir, taskId);
	try {
		await fs.promises.mkdir(dir, { recursive: true });
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
	cwd?: string,
): Promise<CleanupResult> {
	try {
		assertTaskId(taskId);
		const baseDir = await resolveBaseDir(config, cwd);
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
	cwd?: string,
): Promise<string | null> {
	assertTaskId(taskId);
	const baseDir = await resolveBaseDir(config, cwd);
	const dir = path.join(baseDir, taskId);
	try {
		await fs.promises.access(dir);
		return dir;
	} catch {
		return null;
	}
}
