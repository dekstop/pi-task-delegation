import { describe, expect, it } from "vitest";
import { mapChildResultToText, runDelegateTask } from "../tool.js";
import type { ChildResult } from "../executor.js";

describe("mapChildResultToText", () => {
	it("returns the child's final text on success", () => {
		const result: ChildResult = { ok: true, scope: "project", output: "All done." };
		expect(mapChildResultToText(result)).toBe("All done.");
	});

	it("mentions a retained scratch path on success", () => {
		const result: ChildResult = { ok: true, scope: "isolated", output: "Done.", scratchPath: "/tmp/scratch/t1" };
		expect(mapChildResultToText(result)).toContain("Scratch retained at: /tmp/scratch/t1");
	});

	it("appends a scratch cleanup failure without obscuring the outcome", () => {
		const result: ChildResult = { ok: true, scope: "isolated", output: "Done.", scratchError: "rm failed" };
		const text = mapChildResultToText(result);
		expect(text).toContain("Done.");
		expect(text).toContain("scratch cleanup failed: rm failed");
	});

	it("falls back to a note when a successful child produced no text", () => {
		expect(mapChildResultToText({ ok: true, scope: "project", output: "" })).toBe("(no output)");
	});

	it("returns a useful error on failure", () => {
		const result: ChildResult = { ok: false, scope: "project", output: "", error: "model exploded" };
		expect(mapChildResultToText(result)).toBe("Delegate failed: model exploded");
	});

	it("appends a scratch error on failure without replacing the main error", () => {
		const result: ChildResult = { ok: false, scope: "isolated", output: "", error: "boom", scratchError: "mkdir failed" };
		const text = mapChildResultToText(result);
		expect(text).toContain("Delegate failed: boom");
		expect(text).toContain("Scratch error: mkdir failed");
	});
});

describe("runDelegateTask (SDK-free paths)", () => {
	it("surfaces an aborted run as a failure outcome", async () => {
		const controller = new AbortController();
		controller.abort();
		const outcome = await runDelegateTask(
			{ task: "do a thing" },
			{ cwd: "/tmp" },
			{ signal: controller.signal },
		);
		expect(outcome.ok).toBe(false);
		expect(outcome.text).toMatch(/aborted/);
	});

	it("reports progress via onStatus", async () => {
		const statuses: string[] = [];
		const controller = new AbortController();
		controller.abort();
		await runDelegateTask(
			{ task: "do a thing" },
			{ cwd: "/tmp" },
			{ signal: controller.signal, onStatus: (s) => statuses.push(s) },
		);
		expect(statuses).toContain("done");
	});

	it("defaults to project scope", async () => {
		const controller = new AbortController();
		controller.abort();
		const outcome = await runDelegateTask(
			{ task: "do a thing" },
			{ cwd: "/tmp" },
			{ signal: controller.signal },
		);
		expect(outcome.ok).toBe(false);
		expect(outcome.text).toMatch(/aborted/);
	});

	it("passes isolated scope through", async () => {
		const controller = new AbortController();
		controller.abort();
		const outcome = await runDelegateTask(
			{ task: "do a thing", scope: "isolated" },
			{ cwd: "/tmp" },
			{ signal: controller.signal },
		);
		expect(outcome.ok).toBe(false);
		expect(outcome.text).toMatch(/aborted/);
	});
});
