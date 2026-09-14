# Richie HTML manual test plan v00

This plan covers local HTML review without copying the external acceptance deck.
The canonical HTML must remain byte-for-byte unchanged. Use a temporary copy for
experiments, except the supplied Unilever fixture, which may be opened directly
but must be hashed before and after.

## Setup and evidence

Run and record exact command, exit status, and output summary:

```sh
npm run check
npm test
npm run build
npm run browser:test
npm start
npm run review -- --json tests/fixtures/html-review/report.html
```

Keep browser console and network logs open. Record errors, warnings, failed
requests, screenshots for visual claims, viewport size, and before/after byte
count plus SHA-256. Do not copy
`/home/akhil/warchives/unilever-dt-workshop/project/deliverables/20260912-unilever-global-dt-agentic-foundations-deck/deck.html`
into this repository.

## Acceptance fixture and scripted behavior

1. Hash the Unilever deck before opening it. Open the review and verify the deck
   renders in the sandboxed artifact frame.
2. Use the artifact's next/previous controls and ArrowLeft/ArrowRight. Confirm
   the slide state changes and no shell navigation or privileged request occurs.
3. Hash and size the external file again after Abort and again after Finish in a
   separate run; the values must match exactly.

## Local fixture targets

Using `tests/fixtures/html-review/report.html`:

1. Load same-root stylesheet, script, and image. Confirm scripted slide controls
   work. Attempt forms, popups, downloads, top-level/nested navigation, media,
   and remote resources; each remains blocked or outside the artifact boundary.
2. Select from ordinary text into nested `strong`/`em` text. Create one Comment,
   Replace, and Delete operation using the menu and keyboard (`c`, `r`, `d`).
   Confirm the card says `html-text-range`, shows selectors, paths, offsets, and
   quote, and the artifact highlights only the exact range.
3. Click each repeated sibling. Confirm the saved element has a unique selector
   and document path. Refresh and use Jump to target; only the intended sibling
   receives the decoration.
4. Change a saved element's tag, text, path, or duplicate its selector in a
   temporary fixture. Refresh/sync. Confirm there is no highlight or guessed
   scroll and every affected card visibly and accessibly says **Unresolved
   target** with location evidence.
5. Use the rendered Mermaid node and source fallback. Confirm source text is
   selectable and a node operation is `mermaid-node` with diagram ID, node ID,
   label, selector, and geometry. Change the label and confirm fail-closed
   unresolved behavior.
6. Check comment, replacement, and deletion artifact decorations are visually
   distinct without relying on color alone. Edit replacement/comment, remove an
   operation, and confirm stale decoration cleanup. Click an annotation and
   confirm its card receives focus; Jump retries delayed targets and reports the
   operation ID on timeout.
7. Exercise keyboard-only Tab/Enter/Escape for menus, cards, dialogs, Finish,
   and Abort. Repeat at 1440x900 and a narrow 390x844 viewport. Confirm target
   rectangles include viewport dimensions and controls remain usable.

## Security and stale checks

Verify wrong token/host/session, wrong index nonce, non-GET artifact requests,
missing files, directories, lexical and percent-encoded `..`, backslashes,
NUL/absolute paths, unknown extensions, and outside-root symlinks all fail
closed. Valid CSS/JS/image/font assets have exact MIME, `Cache-Control:
no-store`, and `X-Content-Type-Options: nosniff`. Capture the artifact CSP and
confirm every blocked capability is explicit. Search artifact HTML, SDK URL,
and captured message payloads for the review token; it must be absent.

Mutate the canonical file after creating an operation. Confirm the shell still
shows the captured snapshot with a stale banner; operation and Finish return
409 and sidecar state is retained. Confirm Reload only after the destructive
prompt; it adopts new bytes, clears operations, and rotates the artifact
capability. Old artifact URL/messages must no longer apply.

## Finish, no-open, Abort, and Markdown smoke

With all three target kinds open, Finish and parse the one
`report-commented.json`: it must contain `schemaVersion`, canonical `source`,
`documentKind: "html"`, source SHA-256, `createdAt`, and open operation target
payloads. The temporary `.review.json` is removed and canonical bytes/hash are
unchanged. Finish with no open operations creates no JSON; Abort creates no
JSON and removes temporary state.

Repeat a compact Markdown review of images, Math, tables, Mermaid source,
search, Finish, Abort, and terminal polling. Confirm Markdown still writes only
`-commented.md`, preserves source ranges/markers, and never receives HTML SDK
bytes.

## Evidence and revision log

Attach command output, browser version, screenshots where requested, console and
failed-network observations, redacted element/text-range/mermaid JSON samples,
and external fixture pre/post hash and byte size. Record residual limitations:
shadow DOM and cross-origin iframe contents are not targets; source rewrites
that fail evidence stay unresolved; forms, navigation, popups, downloads,
remote active content, and privileged APIs/filesystem remain blocked.

Revision log: 2026-09-14 — added HTML snapshot, security, target identity,
Mermaid, accessibility, keyboard, stale/reload, Finish/Abort, fixture, and
external-fixture evidence cases.
