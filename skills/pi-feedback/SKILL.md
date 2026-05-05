---
name: pi-feedback
description: Use when the user wants to review a long assistant response externally, annotate feedback in Cursor or another editor, or use the /feedback workflow. Explains the pi-feedback extension commands and best practices.
---

# pi-feedback

Use `/feedback` when the assistant produced a long message and the user wants to review or annotate it outside Pi before continuing.

Workflow:

1. User runs `/feedback`.
2. The extension opens the last completed assistant message in Cursor by default.
3. User edits or annotates the Markdown file and saves.
4. Pi stages `[Review feedback]` in the input box.
5. User can type around the placeholder, submit it, or delete it to discard.
6. On submit, the placeholder expands into a template containing a unified diff.

Commands:

- `/feedback` opens the last assistant message for review.
- `/feedback-file <path.md>` reviews an existing Markdown file.
- `/feedback-file --send <path.md>` sends the diff immediately on save.
- `/feedback-file --list` lists active watchers.
- `/feedback-stop [all|path]` stops watchers.

Configuration:

- `PI_FEEDBACK_APP`, default `Cursor`.
- `PI_FEEDBACK_CURSOR_CLI`, default `cursor`.
- `PI_FEEDBACK_TEMPLATE`, default `~/.pi/agent/feedback-template.md`.

When responding to expanded review feedback, treat the diff as user intent. Infer meaning from additions, removals, rewrites, and comments. Do not mechanically copy edited text unless that is clearly the right next step.
