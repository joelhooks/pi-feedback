import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, SessionEntry } from "@mariozechner/pi-coding-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";

type ReviewSession = {
	id: string;
	filePath: string;
	label: string;
	baseline: string;
	lastSeen: string;
	isTemp: boolean;
	mode: "placeholder" | "send";
	setEditorText?: (text: string) => void;
	notify?: (message: string, type?: "info" | "warning" | "error" | "success") => void;
	timer?: NodeJS.Timeout;
};

type PendingFeedback = {
	token: string;
	label: string;
	diff: string;
	filePath: string;
};

const APP_NAME = process.env.PI_FEEDBACK_APP || "Cursor";
const PLACEHOLDER = "[Review feedback]";
const TEMPLATE_PATH =
	process.env.PI_FEEDBACK_TEMPLATE || path.join(os.homedir(), ".pi", "agent", "feedback-template.md");
const DEFAULT_TEMPLATE = `## Review feedback from {{app}}

I edited {{label}}. Treat the changed lines as feedback on that response. Infer my intent from additions, removals, rewrites, and comments. Do not apply the diff mechanically unless that is clearly the right next step.

Diff:
{{diff}}
`;
const sessions = new Map<string, ReviewSession>();
const pendingFeedback = new Map<string, PendingFeedback>();

function getText(message: AssistantMessage): string {
	return message.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

function getLastAssistantText(branch: SessionEntry[]): string | undefined {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role !== "assistant") continue;
		const assistant = message as AssistantMessage;
		if (assistant.stopReason !== "stop") return undefined;
		const text = getText(assistant);
		return text || undefined;
	}
	return undefined;
}

function resolveFilePath(arg: string, cwd: string): string {
	const expanded = arg.startsWith("~/") ? path.join(os.homedir(), arg.slice(2)) : arg;
	return path.resolve(cwd, expanded);
}

function createUnifiedDiff(label: string, before: string, after: string): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-feedback-diff-"));
	const beforePath = path.join(tmpDir, "before.md");
	const afterPath = path.join(tmpDir, "after.md");
	try {
		fs.writeFileSync(beforePath, before, "utf8");
		fs.writeFileSync(afterPath, after, "utf8");
		const result = spawnSync(
			"diff",
			["-u", "-L", `before ${label}`, "-L", `after ${label}`, beforePath, afterPath],
			{ encoding: "utf8" },
		);
		return (result.stdout || "").trim();
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

function formatDiffForDisplay(diff: string): string {
	return diff
		.split("\n")
		.filter((line) => !line.startsWith("\\ No newline at end of file"))
		.map((line) => `│ ${line}`)
		.join("\n");
}

function getFeedbackTemplate(): string {
	try {
		if (fs.existsSync(TEMPLATE_PATH)) return fs.readFileSync(TEMPLATE_PATH, "utf8");
	} catch {
		// Fall back to built-in template.
	}
	return DEFAULT_TEMPLATE;
}

function buildFeedbackMessage(feedback: PendingFeedback): string {
	const replacements: Record<string, string> = {
		app: APP_NAME,
		label: feedback.label,
		filePath: feedback.filePath,
		diff: formatDiffForDisplay(feedback.diff),
	};

	return getFeedbackTemplate().replace(/{{\s*(app|label|filePath|diff)\s*}}/g, (_, key: string) => replacements[key] ?? "").trim();
}

function expandFeedbackPlaceholder(text: string, message: string): string {
	// If the placeholder is alone on a line, replace the whole line so stray
	// indentation does not turn the feedback into goofy Markdown code blocks.
	const linePattern = new RegExp(`^[ \\t]*${escapeRegExp(PLACEHOLDER)}[ \\t]*$`, "gm");
	if (linePattern.test(text)) return text.replace(linePattern, message);
	return text.replaceAll(PLACEHOLDER, message);
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function handleSavedDiff(pi: ExtensionAPI, session: ReviewSession, nextContent: string) {
	const diff = createUnifiedDiff(session.label, session.baseline, nextContent);
	if (!diff.trim()) return;

	const feedback: PendingFeedback = {
		token: PLACEHOLDER,
		label: session.label,
		diff,
		filePath: session.filePath,
	};

	if (session.mode === "send") {
		const message = buildFeedbackMessage(feedback);
		try {
			pi.sendUserMessage(message, { deliverAs: "followUp" });
		} catch {
			pi.sendUserMessage(message);
		}
	} else {
		pendingFeedback.set(PLACEHOLDER, feedback);
		session.setEditorText?.(PLACEHOLDER);
		// setEditorText from an async file watcher can update editor state without an immediate repaint.
		// A notify event pokes the TUI so the placeholder shows up right away instead of after typing.
		session.notify?.(`${PLACEHOLDER} loaded from ${APP_NAME} save`, "info");
	}

	session.baseline = nextContent;
}

function startWatching(pi: ExtensionAPI, session: ReviewSession) {
	stopWatching(session.id, false);
	sessions.set(session.id, session);

	fs.watchFile(session.filePath, { interval: 500 }, () => {
		if (session.timer) clearTimeout(session.timer);
		session.timer = setTimeout(() => {
			try {
				const next = fs.readFileSync(session.filePath, "utf8");
				if (next === session.lastSeen) return;
				session.lastSeen = next;
				handleSavedDiff(pi, session, next);
			} catch (error) {
				// File may be mid-save or gone. Keep watcher alive; /feedback-stop can clean it up.
				console.error("pi-feedback watch error", error);
			}
		}, 350);
	});
}

function stopWatching(id: string, removeTemp = true): boolean {
	const session = sessions.get(id);
	if (!session) return false;
	if (session.timer) clearTimeout(session.timer);
	fs.unwatchFile(session.filePath);
	if (removeTemp && session.isTemp) fs.rmSync(session.filePath, { force: true });
	sessions.delete(id);
	return true;
}

function commandExists(command: string): boolean {
	return spawnSync("/bin/zsh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function openInReviewApp(filePath: string) {
	const cursorCli = process.env.PI_FEEDBACK_CURSOR_CLI || "cursor";

	if (APP_NAME.toLowerCase() === "cursor" && commandExists(cursorCli)) {
		// Hermit crab mode: a new Cursor window, no current workspace pollution,
		// but still using Joel's normal Cursor user settings/extensions.
		const child = spawn(cursorCli, ["--new-window", filePath], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
		return;
	}

	const child = spawn("open", ["-a", APP_NAME, filePath], {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
}

function parseArgs(args: string): { file?: string; list: boolean; send: boolean } {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const send = parts.includes("--send");
	const list = parts.includes("--list");
	const file = parts.filter((part) => part !== "--send" && part !== "--list").join(" ") || undefined;
	return { list, send, file };
}

export default function (pi: ExtensionAPI) {
	const reviewHandler = async (args: string, ctx: ExtensionCommandContext) => {
		const parsed = parseArgs(args);

		if (parsed.list) {
			const active = [...sessions.values()]
				.map((session) => `${session.id}: ${session.label}`)
				.join("\n");
			ctx.ui.notify(active || "No active feedback review sessions", "info");
			return;
		}

		let filePath: string;
		let isTemp = false;

		if (parsed.file) {
			filePath = resolveFilePath(parsed.file, ctx.cwd);
			if (!fs.existsSync(filePath)) {
				ctx.ui.notify(`Markdown file not found: ${filePath}`, "error");
				return;
			}
		} else {
			const text = getLastAssistantText(ctx.sessionManager.getBranch());
			if (!text) {
				ctx.ui.notify("Usage: /feedback, /feedback-file <path.md>, or run after a completed assistant message", "warning");
				return;
			}
			filePath = path.join(os.tmpdir(), `pi-feedback-${Date.now()}.md`);
			fs.writeFileSync(filePath, `${text}\n`, "utf8");
			isTemp = true;
		}

		const baseline = fs.readFileSync(filePath, "utf8");
		const id = path.resolve(filePath);
		const label = isTemp ? "last assistant message" : path.relative(ctx.cwd, filePath) || filePath;

		startWatching(pi, {
			id,
			filePath,
			label,
			baseline,
			lastSeen: baseline,
			isTemp,
			mode: parsed.send ? "send" : "placeholder",
			setEditorText: (text: string) => ctx.ui.setEditorText(text),
			notify: (message, type = "info") => ctx.ui.notify(message, type),
		});

		openInReviewApp(filePath);
		ctx.ui.notify(
			parsed.send
				? `Watching ${label}; save in ${APP_NAME} to send a diff back to the agent`
				: `Watching ${label}; save in ${APP_NAME} to place ${PLACEHOLDER} in the input box`,
			"info",
		);
	};

	pi.registerCommand("feedback", {
		description: `Open the last assistant response in ${APP_NAME}; on save, inject ${PLACEHOLDER} into the input box`,
		handler: reviewHandler,
	});

	pi.registerCommand("feedback-file", {
		description: `Open a Markdown file, or the last assistant response, in ${APP_NAME}; on save, inject ${PLACEHOLDER} into the input box`,
		handler: reviewHandler,
	});

	pi.on("input", async (event) => {
		if (!event.text.includes(PLACEHOLDER)) return { action: "continue" };
		const feedback = pendingFeedback.get(PLACEHOLDER);
		if (!feedback) return { action: "continue" };

		pendingFeedback.delete(PLACEHOLDER);
		return {
			action: "transform",
			text: expandFeedbackPlaceholder(event.text, buildFeedbackMessage(feedback)),
		};
	});

	pi.registerCommand("feedback-stop", {
		description: "Stop feedback watcher(s). Usage: /feedback-stop [all|path]",
		handler: async (args, ctx) => {
			const target = args.trim();
			if (!target || target === "all") {
				const count = sessions.size;
				for (const id of [...sessions.keys()]) stopWatching(id);
				ctx.ui.notify(`Stopped ${count} feedback review watcher(s)`, "info");
				return;
			}

			const id = resolveFilePath(target, ctx.cwd);
			ctx.ui.notify(stopWatching(id) ? `Stopped ${target}` : `No watcher for ${target}`, "info");
		},
	});

	pi.on("session_shutdown", () => {
		for (const id of [...sessions.keys()]) stopWatching(id);
	});
}
