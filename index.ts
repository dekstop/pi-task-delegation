/**
 * pi-task-delegation — Pi extension entry point.
 *
 * Registers a single `delegate` tool that delegates a task to a fresh,
 * isolated in-process child AgentSession (see executor.ts). The child gets a
 * clean context (no parent history), the project working directory, and the
 * normal Pi tools (read, bash, edit, write) — but never the `delegate` tool
 * (no recursive delegation).
 *
 * The pure logic lives in tool.ts (SDK-free at load time) so it is testable
 * without the Pi runtime; this file only wires the tool to the extension API.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { runDelegateTask } from "./tool.js";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description:
			"Delegate a self-contained task to a fresh, isolated delegate. " +
			"The delegate runs in a clean context (no shared conversation history) " +
			"with the project working directory and the normal tools (read, bash, edit, write), " +
			"but cannot delegate further. Returns the delegate's final answer.",
		promptSnippet: "Delegate a task to a fresh, isolated delegate (clean context, no further delegation)",
		promptGuidelines: [
			"Use delegate to delegate a self-contained task to a fresh delegate when the work is isolated and does not need the parent's conversation history.",
		],
		parameters: Type.Object({
			task: Type.String({ description: "The task to delegate, in natural language." }),
			scratch: Type.Optional(
				StringEnum(["none", "ephemeral", "retain"] as const, {
					description:
						"Scratch storage: none (default, no scratch dir), ephemeral (created then cleaned up), retain (kept after the task).",
				}),
			),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const outcome = await runDelegateTask(
				{ task: params.task, scratch: params.scratch },
				{ cwd: ctx.cwd },
				{
					signal,
					onStatus: (status) => {
						onUpdate?.({ content: [{ type: "text", text: status }], details: undefined });
					},
				},
			);
			// The SDK sets isError only when execute throws; a returned value
			// never sets the flag. Throwing is caught by the SDK and reported
			// to the LLM, so the parent stays usable.
			if (!outcome.ok) {
				throw new Error(outcome.text);
			}
			// `details` is required by AgentToolResult; we have no structured
			// payload to render, so undefined (same as the built-in write tool).
			return { content: [{ type: "text", text: outcome.text }], details: undefined };
		},
	});
}
