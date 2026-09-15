---
name: richie
description: Always consult before using the richie command.
---

# Use Richie

Richie is the human review gate for canonical Markdown and local HTML artifacts. Apply only feedback the user authorises. Richie never edits either source file.
You MUST poll for human feedback after opening a file.

## Open and wait

1. Choose a readable `.md`, `.html`, or `.htm` file:
   - Put transient Markdown communication in `~/.richie/ephemeral/`.
   - Put durable source files in the appropriate project path.
   - Before reopening Markdown, check `<original-file-path>-commented.md` for earlier feedback. Apply authorised feedback to the canonical Markdown, then delete that commented file.
   - Before reopening HTML, inspect any `<original-file-path-without-.html-or-.htm>-commented.json` handoff. It contains structured feedback; do not treat it as an HTML rewrite or delete it until its feedback has been handled.
2. Run `richie review --json <file>`. Retain the returned JSON session `id`. For multiple files, open and track one session per file. The returned `url` is only the browser location, not a session ID.
3. Run `richie poll <session-id>` for each live session. Do not repeat the document content in chat while Richie is carrying it.
4. Handle the terminal JSON result:
   - `finished` with a Markdown `file` ending in `-commented.md`: apply authorised markers to the canonical Markdown, then delete the commented copy. If `file` is the source path, no feedback was recorded.
   - `finished` with an HTML `file` ending in `-commented.json`: read the structured handoff and apply only authorised feedback through the appropriate source workflow. It contains the canonical source path, SHA-256, creation metadata, and open operations with DOM target evidence. If `file` is the source path, no feedback was recorded.
   - `aborted`: stop. The source remains unchanged.

## HTML review boundaries

- HTML review captures an immutable snapshot in a sandboxed opaque-origin iframe. It can review rendered text, elements, and Mermaid nodes; it does not edit or round-trip HTML. An open element feedback menu marks its target with a blue outline.
- HTML targets are structured DOM evidence (selectors, paths, text or range boundaries, and geometry). Unresolved, ambiguous, changed, delayed, shadow-DOM, or cross-origin targets are never guessed.
- Same-root regular CSS, JavaScript, image, and font assets may load. Forms, popups, downloads, navigation, nested or cross-origin frames, media/object/plugin content, workers, manifests, remote connections, and privileged APIs are blocked.
- If the HTML source changes during review, operations and Finish are blocked. **Reload new draft** deliberately adopts the new bytes and clears existing operations. Finish writes `<name>-commented.json` only when open feedback exists; Abort or no-open Finish creates no handoff.

## Session lifecycle

- Background a poll immediately; do not block the thread.
- An interrupted poll stops only that wait. Resume with `richie poll <same-session-id>` while the session remains alive.
- Closing the browser tab is not terminal. The poll remains pending until the user finishes or aborts.
- Browser reload keeps the same session and poll.
- If Markdown source changes during review, Finish remains non-terminal and polling continues. The user may confirm **Reload new draft**; this keeps the session ID, loads the current source, clears prior review operations, and leaves the poll pending.
- Never substitute a file path or browser URL for a session ID, or reuse one file's session ID for another file.
