# pi-feedback

Review long Pi assistant messages in Cursor, edit/annotate them like a civilized mammal, then send the saved diff back to the model as feedback.

## Install

From GitHub:

```bash
pi install git:github.com/joelhooks/pi-feedback
```

For local development:

```bash
pi install /Users/joel/Code/joelhooks/pi-feedback
```

Then reload Pi:

```text
/reload
```

## Commands

### `/feedback`

Opens the last completed assistant message in a new Cursor window.

When you save changes, Pi stages a placeholder in the input box:

```text
[Review feedback]
```

Type around it, submit it as-is, or delete it to discard. On submit, the placeholder expands into a clean template containing the unified diff.

### `/feedback-file <path.md>`

Reviews an existing Markdown file instead of the last assistant message.

### `/feedback-file --send <path.md>`

Direct mode. On save, immediately sends the diff back as a user turn instead of staging a placeholder.

### `/feedback-file --list`

Lists active feedback watchers.

### `/feedback-stop [all|path]`

Stops feedback watchers. Defaults to all.

## Configuration

### Review app

Defaults to Cursor:

```bash
PI_FEEDBACK_APP="Cursor"
```

Use another macOS app:

```bash
PI_FEEDBACK_APP="Markdown Pro"
```

When `PI_FEEDBACK_APP=Cursor`, the extension uses the Cursor CLI if available:

```bash
cursor --new-window <file.md>
```

That opens a standalone window without adding the file to your current workspace, while keeping your normal Cursor settings and extensions.

Override the Cursor CLI command:

```bash
PI_FEEDBACK_CURSOR_CLI="cursor"
```

### Feedback template

Default template path:

```bash
~/.pi/agent/feedback-template.md
```

Override it:

```bash
PI_FEEDBACK_TEMPLATE="/path/to/template.md"
```

Available tokens:

```text
{{app}}
{{label}}
{{filePath}}
{{diff}}
```

The diff is formatted with `│ ` line prefixes so nested Markdown fences inside the reviewed message cannot explode the prompt formatting. Diff noise like `\\ No newline at end of file` is stripped.

Example:

```md
## Review feedback from {{app}}

I edited {{label}}. Treat the changed lines as feedback on that response. Infer my intent from additions, removals, rewrites, and comments.

Diff:
{{diff}}
```

## Package shape

This is a Pi package. `package.json` declares:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*"
  }
}
```

That follows Pi publishing guidance: package resources are declared under `pi`, Pi core imports are peer dependencies, and runtime dependencies would go in `dependencies` if added later.
