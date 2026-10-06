# Richie feature inventory and coverage map

Seed for `qa/features.yaml`. One row per user-visible behaviour. IDs reuse the manual-plan IDs where they exist.

- **Kind**: `both` runs in the `md` and `html` Playwright projects through the kind adapter; `md` or `html` runs in one.
- **Today**: `Auto-B` black-box (CLI, HTTP, file, browser by role/text); `Auto-I` internals or source regex, which a rewrite breaks; `Manual`; `None`.
- **Target**: L1 contract golden, L2 invariant, L3 journey, L4 visual.

## Where the rows come from

Three sources, cross-checked. Each has blind spots the others cover.

| Source | What it gives | Blind spot |
|---|---|---|
| Documentation: `spec.md`, `user-guide.md`, `README.md`, `skills/richie/SKILL.md` | Intended behaviour and contracts | Lags the code; says nothing about error paths |
| Test plans: `~/.richie/ephemeral/richie-html-markdown-manual-test-plan.md` (2026-09-15, newest, covers both kinds), `manual-html-test-plan-v00.md` (2026-09-14), `manual-test-plan-v01.md` and `manual-media-test-plan-v00.md` (August, first prototype), existing tests | What you checked by hand | Only what someone thought to check |
| Code audit (2026-10-06): every route in `service.ts`, every event listener, key handler, dialog title, button label and `data-action` in `client.ts` and `html-review-sdk.ts` | What the product actually does, including error and edge paths | Cannot say whether a behaviour is intended |

The code audit found 19 event types in the shell and 10 in the SDK, 7 API routes plus the artifact, asset, media, guide and page routes, 9 confirm labels, and 14 dialog titles. Rows marked **(code)** came only from that audit; no document mentions them.

The list is complete against these three sources. It is not proven complete. The map check (`qa/check-map.ts`) keeps it honest from here: a new listener, route or dialog title in the code with no feature ID is a prompt to add a row. Step 2 of the skill's "Adding a feature" enforces this.

## Shared core (both kinds)

| ID | Behaviour | Kind | Today | Target |
|---|---|---|---|---|
| CO-01 | `review --json` prints `{id,url}`; plain `review` prints url; bad args exit 1 with usage; non-`.md/.html/.htm` rejected | both | Auto-B (md only) | L1 |
| CO-02 | Same file twice returns same session | both | Auto-I | L1 |
| CO-03 | `poll` blocks until terminal; SIGINT exits 130, session survives; poll resumes | both | Auto-B (md only) | L1 |
| CO-04 | Tab close and browser reload are not terminal | both | Manual | L3 |
| CO-05 | Wrong Host → 421; wrong token or session → 404 | both | Auto-I | L1 |
| CO-06 | Finish with open feedback writes the kind's output, removes sidecar, poll returns file | both | Auto-B (html), Auto-I (md) | L1, L3 |
| CO-07 | Finish with no open feedback returns source path, writes nothing | both | Auto-I | L1 |
| CO-08 | Abort removes sidecar, writes nothing, poll returns aborted | both | Auto-B (html) | L1, L3 |
| CO-09 | Double Finish or Finish after Abort returns the first outcome | both | Auto-I | L1 |
| CO-10 | Source changed on disk: stale banner; ops and Finish → 409; sidecar kept; poll stays pending | both | Auto-I | L1, L3, L4 |
| CO-11 | Confirmed Reload adopts new bytes, clears ops, keeps session id | both | Auto-I | L1, L3 |
| CO-12 | Existing sidecar resumes after service restart; sidecar for another source version refuses to start | both | Auto-I | L1 |
| CO-13 | Feedback card: jump, edit, remove with confirm, open count, clicking markup focuses card | both | Manual (md), Auto-B partial (html) | L3 |
| CO-14 | Dialog: cancel, empty value rejected, keyboard confirm, drag to move | both | Auto-I | L3 |
| CO-15 | Document-level note: md marker at top; html JSON operation, not an HTML edit | both | Auto-I | L1, L3 |
| CO-16 | Keyboard-only use of menus, cards, dialogs, Finish, Abort at 1440×900 and 390×844 | both | Auto-B (html, 390 px only) | L3, L4 |
| CO-17 | Shell: navigation toggle and user guide link (search is out of scope; it is being removed) | both | Auto-B partial (md) | L3 |
| CO-18 | Source bytes unchanged after any review | both | Auto-B (html), Auto-I (md) | L2 (P1) |
| CO-19 | API never 5xx on malformed input; 4xx never changes state | both | Auto-I partial | L2 (P2) |
| CO-20 | Service unavailable prints the systemd hint | both | None | L1 |
| CO-21 | Remove marks the operation `superseded` (history kept), not deleted; only open ops can be edited or removed (409 otherwise) **(code)** | both | Auto-I | L1 |
| CO-22 | Delete operations have no Edit control; edit keeps the operation id | both | Manual | L3 |
| CO-23 | Every failed API call shows a named error dialog ("Richie could not save the review", "…update the feedback", "…remove the feedback", "…reload the draft", "…complete the action") and leaves state unchanged **(code)** | both | None | L3 |
| CO-24 | Cancel on Finish, Abort, Reload and Remove changes nothing | both | Manual | L3 |
| CO-25 | After Finish or Abort the completion dialog is shown, then the tab tries to close (`window.close`) **(code)** | both | Auto-B partial | L3 |
| CO-26 | Dialog: Ctrl/Cmd+Enter confirms, Escape cancels without saving, focus returns sensibly | both | Manual | L3 |
| CO-27 | Native context menu is suppressed over the document while a selection exists **(code)** | both | Auto-I (bundle regex) | L3 |
| CO-28 | REMOVED: shell search is being deleted (separate ticket). Do not test search. | — | — | — |
| CO-29 | REMOVED: see CO-28 | — | — | — |

## HTML review

| ID | Behaviour | Today | Target |
|---|---|---|---|
| HT-01 | Immutable snapshot in `sandbox="allow-scripts"` iframe; disk changes do not change the displayed artifact | Auto-I | L1, L3 |
| HT-02 | Same-root CSS, JS, image, font assets load; scripted controls (slides, arrow keys) work | Auto-B partial | L3 |
| HT-03 | Artifact headers: exact MIME, `no-store`, `nosniff`, exact CSP string | Auto-I | L1 golden |
| HT-04 | Path confinement: `..`, `%2e%2e`, `..%2f`, backslash, NUL, absolute, unknown extension, directory, missing file, outside-root symlink, symlink swap during request | Auto-I (symlink only) | L1 matrix, L2 (P7) |
| HT-05 | Wrong `n` nonce, non-GET, wrong session on `/artifact/*` fail closed | Auto-I | L1 |
| HT-06 | Blocked: form submit, popup, download, top-level and nested navigation, nested and cross-origin frames, media/object, workers, manifest, `fetch`/XHR | Manual | L3 (CSP violations + request log) |
| HT-07 | Review token absent from artifact HTML, SDK URL, and all `postMessage` payloads | Auto-I (bundle regex) | L1 |
| HT-08 | SDK injected exactly once before `</body>`; handles no-body and malformed HTML; ignores script literals | Auto-I | L1 golden of served HTML |
| HT-09 | Frame handshake: shell reaches ready; existing ops resolve after load and after frame reload | Auto-B | L3 |
| HT-10 | Previous-generation frame messages ignored after reload | Auto-B | L3 |
| HT-11 | Text-range target across nested `strong`/`em` by real drag; menu and `c`/`r`/`d` keys | Auto-B (scripted selection) | L1 replay, L3 real drag |
| HT-12 | Element target: hover, blue outline while menu open, unique selector on repeated siblings | Auto-B | L3, L4 |
| HT-13 | Mermaid node target with diagram id, node id, label; source fallback selectable | Auto-B | L3 |
| HT-14 | Decorations for comment, replace, delete are distinct without color alone; edit and remove clean up stale decoration | Manual | L3, L4 |
| HT-15 | Jump to target decorates only the intended node; retries delayed targets; reports operation id on timeout | Auto-B partial | L3 |
| HT-16 | Any changed anchor (tag, text, path, duplicate selector, label) → **Unresolved target** card with role `status`, no highlight, no scroll | Auto-B | L2 (P6), L3, L4 |
| HT-17 | Capture-then-resolve round trip for random DOM and random target | None | L2 (P5) |
| HT-18 | Target bounds: selector depth 16, text 2048, path depth 64, signed coords, finite dims; malformed rejected | Auto-I | L2 (P8) |
| HT-19 | Stale HTML: Reload rotates artifact nonce; old `n` returns 404 | Auto-I | L1, L3 |
| HT-20 | `-commented.json`: one file, atomic, mode `0600`, envelope fields, open ops only | Auto-B | L1 golden |
| HT-21 | Shadow DOM and cross-origin iframe content are not targetable | None | L3 |
| HT-22 | ACCEPTED GAP: artifact script can add a delete without a dialog (README §5.4). No test. | — | — | — |
| HT-23 | Lighthouse deck: slide buttons, Arrow and PageUp/PageDown keys, fonts, PNG, table, repeated cards, Mermaid all work in the frame; bytes unchanged after Abort and Finish | None (replaces the Unilever test) | L3 |
| HT-25 | DEFERRED: `c`/`r`/`d` after the in-frame menu opens do nothing. Separate bug ticket; add the L3 test with the fix. | — | — | — |
| HT-26 | Reverse-direction selection stores source order and saves without error | Manual | L3 |
| HT-27 | Shortcuts ignored in a text field or with Ctrl/Cmd/Alt held, inside the frame | Manual | L3 |
| HT-28 | Blocked also: WebSocket, EventSource, shared and service workers, access to `parent`, the shell DOM, `window.__RICHIE__`; Windows drive paths in asset requests | Manual | L3, L1 |
| HT-29 | "Target resolution pending…" shows while resolving, then becomes resolved or Unresolved within the 3.5 s sync window **(code)** | Auto-B partial | L3 |
| HT-30 | Mermaid render failure in the frame shows "Mermaid preview unavailable; source retained below." and the source stays reviewable **(code)** | Manual | L3 |
| HT-31 | Mermaid source-line selection gives `html-text-range` operations with source quotes, never SVG text | Manual | L3 |

## Markdown review

| ID | Behaviour | Today | Target |
|---|---|---|---|
| MT-01 | Baseline render: headings, lists, tables, quotes, code, Mermaid, math, frontmatter | Auto-I, 1 Auto-B smoke | L3 ARIA, L4 |
| MT-02 | Outline links scroll to section | Manual | L3 |
| MT-04 | Hover menu: 220 ms delay, handoff, flip near bottom, follow scroll, Escape | Manual | L3 (Playwright clock) |
| MT-05A–F | Range comment: word, phrase across formatting, line, multi-line, reverse, cross-block | Auto-I (export) | L1, L3 |
| MT-06A–E | Range replace: inline, across emphasis, link text, inline code, multi-line | Auto-I (export) | L1, L3 |
| MT-07A–E | Delete: word, sentence, paragraph, heading block, list block | Auto-I | L1, L3 |
| MT-08 | Keys `c`/`r`/`d`, Escape, modifiers ignored, selection beats hover | Manual | L3 |
| MT-09A–D | Table cell comment, replace, clear, empty-cell validation | Auto-I | L1, L3 |
| MT-10A–B | Table row delete; column delete marks every cell | Auto-I | L1, L3 |
| MT-11 | List item, checklist, quote, heading, section controls | Manual | L3 |
| MT-12A–D | Code: line ops and whole block; markers after closing fence | Auto-I | L1, L2 (P4), L3 |
| MT-13A–D | Mermaid: SVG, source disclosure, source-line ops, invalid diagram keeps source | Auto-I | L1, L3, L4 |
| MT-20 | Output differs from source only by markers | Auto-I | L2 (P3) |
| MT-21 | Math: inline switches to source on select, display source lines, aligned block | Auto-I | L1, L3 |
| MT-22 | Second export becomes `-commented-2.md` | Auto-I | L1 |
| MI-01 | Remote HTTPS image: comment, replace, delete whole syntax | Auto-I | L1, L3 (local route) |
| MI-02 | Missing and blocked (`http:`, `data:`, SVG, `file:`) images show fallback with source | Auto-I | L3, L4 |
| MI-03 | Reference-style image resolves | Auto-I | L1, L3 |
| MI-04 | Linked image target expands to outer link | Auto-I | L1 |
| MI-05 | Local raster via authenticated media URL; no token → no image | Auto-I | L1 |
| MI-06 | Local image over 25 MiB returns 413 and shows the fallback **(code)** | None | L1 |
| MI-07 | Image that fails to load in the browser switches to the fallback (`error` listener) **(code)** | Auto-I | L3 |
| MT-23 | Real past reviews replay exactly: 9 pairs from `~/.richie/ephemeral/` | None | L1 |
| MT-24 | Inline math: selection switches to source, Escape restores rendered form | Manual | L3 |
| MT-25 | Hover menu repositions on scroll and hides when target leaves the viewport (`scroll` listener) | Manual | L3 |
| MD-01 | Copy buttons: code, Mermaid, math, frontmatter, path | Auto-I | L3 (clipboard) |

## Totals

| Group | Rows | Black-box today (fully or partly) |
|---|---|---|
| Shared core | 29 | 9, mostly one kind only |
| HTML | 30 | 10 |
| Markdown | 26 | 1 |

My classification from reading the tests, the plans, and the code. Treat it as approximate until `check-map` computes it.
