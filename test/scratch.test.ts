import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { cleanupScratch, createScratch, retainScratch, type ScratchConfig } from "../scratch.js";

let baseDir: string;

function cfg(): ScratchConfig {
	return { scratchBaseDir: baseDir };
}

function isRoot(): boolean {
	return typeof process.getuid === "function" && process.getuid() === 0;
}

beforeEach(() => {
	baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-test-"));
});

afterEach(() => {
	fs.rmSync(baseDir, { recursive: true, force: true });
});

describe("scratch lifecycle", () => {
	it("creates the directory", async () => {
		const p = await createScratch("t1", cfg());
		expect(fs.existsSync(p)).toBe(true);

		const result = await cleanupScratch("t1", cfg());
		expect(result.ok).toBe(true);
		expect(fs.existsSync(p)).toBe(false);
	});

	it("retain mode directory survives after the task", async () => {
		const p = await createScratch("t1", cfg());
		fs.writeFileSync(path.join(p, "out.txt"), "data");

		const retained = await retainScratch("t1", cfg());
		expect(retained).toBe(p);
		expect(fs.existsSync(p)).toBe(true);
		expect(fs.readFileSync(path.join(p, "out.txt"), "utf8")).toBe("data");
	});

	it("each task gets an isolated directory", async () => {
		const a = await createScratch("a", cfg());
		const b = await createScratch("b", cfg());
		expect(a).not.toBe(b);

		fs.writeFileSync(path.join(a, "note.txt"), "a");
		expect(fs.readdirSync(b)).toEqual([]);
	});

	it("scratch is outside the project working directory", async () => {
		const p = await createScratch("t1", cfg());
		expect(p.startsWith(baseDir)).toBe(true);
		expect(baseDir.startsWith(process.cwd() + path.sep)).toBe(false);
	});

	it("cleanup failure is reported, not thrown", async () => {
		if (isRoot()) {
			// root bypasses permission checks; nothing to simulate.
			return;
		}
		const p = await createScratch("t1", cfg());
		fs.writeFileSync(path.join(p, "f.txt"), "x");
		fs.chmodSync(p, 0o555); // read+execute, no write: unlink of children fails

		const result = await cleanupScratch("t1", cfg());
		expect(result.ok).toBe(false);
		expect(result.error).toBeTruthy();

		fs.chmodSync(p, 0o755);
		fs.rmSync(p, { recursive: true, force: true });
	});

	it("cleanup of a missing directory is ok", async () => {
		const result = await cleanupScratch("ghost", cfg());
		expect(result.ok).toBe(true);
	});

	it("retainScratch returns null for a missing directory", async () => {
		expect(await retainScratch("ghost", cfg())).toBeNull();
	});

	it("rejects unsafe task ids", async () => {
		await expect(createScratch("../evil", cfg())).rejects.toThrow();
		const result = await cleanupScratch("..", cfg());
		expect(result.ok).toBe(false);
	});
});
