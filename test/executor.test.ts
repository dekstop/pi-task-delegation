import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	buildDelegateFraming,
	classifyOutcome,
	executeChildTask,
	extractFinalAssistantText,
	type AgentMessageLike,
} from "../executor.js";

describe("buildDelegateFraming", () => {
	it("frames the child as a delegate with an authoritative task", () => {
		const framing = buildDelegateFraming("project");
		expect(framing).toMatch(/delegate/i);
		expect(framing).toMatch(/fresh/i);
		expect(framing).toMatch(/authoritative/i);
		expect(framing).toMatch(/concise/i);
	});

	it("omits isolated-scope instructions for project scope", () => {
		const framing = buildDelegateFraming("project");
		expect(framing).not.toMatch(/isolated directory/i);
		expect(framing).not.toMatch(/no access to the project/i);
	});

	it("includes isolated-scope instructions for isolated scope", () => {
		const framing = buildDelegateFraming("isolated");
		expect(framing).toMatch(/isolated directory/i);
		expect(framing).toMatch(/no access to the project/i);
	});
});

describe("extractFinalAssistantText", () => {
	it("returns '' for an empty conversation", () => {
		expect(extractFinalAssistantText([])).toBe("");
	});

	it("returns '' when there is no assistant message", () => {
		const messages: AgentMessageLike[] = [{ role: "user", content: "hello" }];
		expect(extractFinalAssistantText(messages)).toBe("");
	});

	it("joins the text parts of the final assistant message", () => {
		const messages: AgentMessageLike[] = [
			{ role: "user", content: "task" },
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Done. " },
					{ type: "thinking", thinking: "..." },
					{ type: "toolCall", name: "bash" },
					{ type: "text", text: "All tests pass." },
				],
				stopReason: "stop",
			},
		];
		expect(extractFinalAssistantText(messages)).toBe("Done. All tests pass.");
	});

	it("uses the last assistant message when there are several", () => {
		const messages: AgentMessageLike[] = [
			{ role: "assistant", content: [{ type: "text", text: "first" }], stopReason: "stop" },
			{ role: "toolResult", content: [] },
			{ role: "assistant", content: [{ type: "text", text: "second" }], stopReason: "stop" },
		];
		expect(extractFinalAssistantText(messages)).toBe("second");
	});

	it("returns '' when the final assistant message has no text parts", () => {
		const messages: AgentMessageLike[] = [
			{
				role: "assistant",
				content: [{ type: "toolCall", name: "bash" }],
				stopReason: "toolUse",
			},
		];
		expect(extractFinalAssistantText(messages)).toBe("");
	});

	it("returns '' when the assistant content is not an array", () => {
		const messages: AgentMessageLike[] = [{ role: "assistant", content: "weird" }];
		expect(extractFinalAssistantText(messages)).toBe("");
	});
});

describe("classifyOutcome", () => {
	it("treats a rejected prompt as an error", () => {
		expect(classifyOutcome({ promptError: "boom" })).toEqual({ ok: false, error: "boom" });
	});

	it("treats a missing assistant message as an error", () => {
		const r = classifyOutcome({ promptError: undefined, lastAssistant: null });
		expect(r.ok).toBe(false);
		expect(r.error).toBeTruthy();
	});

	it("treats stopReason 'error' as a failure using errorMessage", () => {
		const r = classifyOutcome({
			lastAssistant: { role: "assistant", content: [], stopReason: "error", errorMessage: "model exploded" },
		});
		expect(r).toEqual({ ok: false, stopReason: "error", error: "model exploded" });
	});

	it("falls back to a generic message when errorMessage is absent", () => {
		const r = classifyOutcome({
			lastAssistant: { role: "assistant", content: [], stopReason: "error" },
		});
		expect(r.ok).toBe(false);
		expect(r.error).toBeTruthy();
	});

	it("treats stopReason 'aborted' as an abort", () => {
		const r = classifyOutcome({
			lastAssistant: { role: "assistant", content: [], stopReason: "aborted" },
		});
		expect(r).toEqual({ ok: false, stopReason: "aborted", error: "aborted" });
	});

	it("treats stopReason 'length' as success (truncated)", () => {
		const r = classifyOutcome({
			lastAssistant: { role: "assistant", content: [], stopReason: "length" },
		});
		expect(r).toEqual({ ok: true, stopReason: "length" });
	});

	it("treats stopReason 'stop' and 'toolUse' as success", () => {
		expect(
			classifyOutcome({ lastAssistant: { role: "assistant", content: [], stopReason: "stop" } }),
		).toEqual({ ok: true, stopReason: "stop" });
		expect(
			classifyOutcome({ lastAssistant: { role: "assistant", content: [], stopReason: "toolUse" } }),
		).toEqual({ ok: true, stopReason: "toolUse" });
	});

	it("treats an unknown stopReason as an error", () => {
		const r = classifyOutcome({
			lastAssistant: { role: "assistant", content: [], stopReason: "mystery" },
		});
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/mystery/);
	});
});

describe("executeChildTask (SDK-free paths)", () => {
	it("returns aborted immediately when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await executeChildTask("task", {
			taskId: "t1",
			cwd: "/tmp",
			scope: "project",
			signal: controller.signal,
		});
		expect(result.ok).toBe(false);
		expect(result.error).toBe("aborted");
		expect(result.stopReason).toBe("aborted");
		expect(result.scope).toBe("project");
	});

	it("returns aborted with isolated scope", async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await executeChildTask("task", {
			taskId: "t1",
			cwd: "/tmp",
			scope: "isolated",
			signal: controller.signal,
		});
		expect(result.ok).toBe(false);
		expect(result.error).toBe("aborted");
		expect(result.scope).toBe("isolated");
	});

	it("returns a useful error when scratch creation fails (isolated scope)", async () => {
		const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "exec-scratch-"));
		try {
			const result = await executeChildTask("task", {
				taskId: "../evil",
				cwd: "/tmp",
				scope: "isolated",
				scratchConfig: { scratchBaseDir: baseDir },
			});
			expect(result.ok).toBe(false);
			expect(result.error).toBeTruthy();
			expect(result.scope).toBe("isolated");
		} finally {
			fs.rmSync(baseDir, { recursive: true, force: true });
		}
	});

	it("reports progress via onStatus", async () => {
		const statuses: string[] = [];
		const controller = new AbortController();
		controller.abort();
		await executeChildTask("task", {
			taskId: "t1",
			cwd: "/tmp",
			scope: "project",
			signal: controller.signal,
			onStatus: (s) => statuses.push(s),
		});
		expect(statuses).toContain("done");
	});
});
