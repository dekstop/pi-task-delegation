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
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { runDelegateTask } from "./tool.js";
import type { DelegateToolParams } from "./tool.js";

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
			scope: Type.Optional(
				StringEnum(["project", "isolated"] as const, {
					description:
						"Execution scope. 'project' (default): child works in the project directory. 'isolated': child works in a fresh, isolated directory with no project access.",
				}),
			),
			scratch: Type.Optional(
				StringEnum(["ephemeral", "retain"] as const, {
					description:
						"Scratch lifecycle for isolated scope. 'ephemeral' (default): scratch removed after the task. 'retain': scratch kept after the task. Ignored for project scope.",
				}),
			),
		}),
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const task = typeof args?.task === "string" ? args.task : "";
			const snippet = task.length > 80 ? task.slice(0, 80) + "…" : task;
			text.setText(theme.fg("toolTitle", theme.bold("Delegate")) + ": " + snippet);
			return text;
		},
		renderResult(result, _options, _theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const first = result.content[0];
			text.setText(first?.type === "text" ? first.text : "");
			return text;
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const toolParams: DelegateToolParams = {
				task: params.task,
				scope: params.scope,
				scratch: params.scratch,
			};
			const outcome = await runDelegateTask(
				toolParams,
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
