# pi-feedback Vision

## Intent

`pi-feedback` is a Pi package for reviewing long assistant messages in a real editor and sending the saved diff back to Pi as focused feedback.

Its job is to make feedback precise when inline chat editing is too cramped. The extension opens the last assistant message or a Markdown file, watches the saved edit, then stages or sends a clean review template containing the unified diff.

## Who It Serves

- Operators who need to give detailed feedback on long Pi assistant responses.
- Pi users who prefer Cursor or another macOS editor for review work.
- Agents that benefit from receiving structured edit diffs instead of vague follow-up prompts.

## Product Bet

Long feedback is better when the operator can edit the response itself. A diff preserves intent better than a paragraph saying "make this more like what I meant."

## Priorities

1. **Editor-native review.** Keep Cursor/macOS editor review as the primary workflow.
2. **Diff clarity.** Send feedback as a clean, bounded unified diff with prompt-safe formatting.
3. **Operator control.** Stage feedback by default; direct send remains explicit.
4. **Watcher hygiene.** Make active watchers visible and easy to stop.
5. **Pi package fit.** Keep package resources declared through Pi's extension/skill shape.

## Non-Goals

- Do not become a general document editor or file synchronization tool.
- Do not silently send feedback when the staged workflow was requested.
- Do not require Cursor specifically when another configured macOS app is enough.
- Do not store reviewed content as durable memory by default.

## Merge By Default

Merge small, tested changes that:

- make watcher lifecycle safer or clearer;
- improve diff formatting and prompt safety;
- add focused tests around template expansion or file watching;
- clarify installation, commands, and configuration;
- preserve the staged-feedback default.

## Needs Owner Sign-Off

Stop for explicit approval before:

- changing direct-send behavior;
- adding networked storage or telemetry;
- changing default template semantics;
- expanding beyond Pi feedback review into broad editor automation.

## Evidence Of Progress

The package is working when:

- `/feedback` opens the last completed assistant message in the configured app;
- saved edits produce a clean diff in the Pi input box;
- direct-send mode works only when explicitly requested;
- watcher listing and stopping are reliable;
- the README install path remains enough to get started.
