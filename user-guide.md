# Richie user guide

Richie is a local visual review surface for Markdown and local HTML. Each source remains canonical. Markdown records ranges and exports a commented copy; HTML records DOM evidence in a temporary sidecar and exports only a structured JSON handoff.

## Before you start

The input must be a readable `.md`, `.html`, or `.htm` file. Build Richie before use:

```sh
npm install
npm run check
npm test
npm run build
```

Start the service, then open a draft:

```sh
npm start
npm run review -- path/to/draft-vNN.md
```

If installed, use `richie review path/to/draft-vNN.md`. The service listens only on `127.0.0.1:43173`; `richie status` checks it.

## Review a draft

1. Read the rendered document.
2. Select text and choose `Comment`, `Replace`, or `Delete`, or press `c`, `r`, or `d`.
3. Hover over a heading, paragraph, list item, blockquote, code block, table cell, Mermaid source, or Markdown image for scoped feedback. A list item also offers `Delete list` for the whole containing list.
4. Use `Document level note` for cross-cutting feedback. It appears at the top of the commented copy.
5. Use the left sidebar to navigate headings. The user guide and search controls stay fixed while a long outline scrolls. The right sidebar keeps its 3 review actions fixed while the feedback inventory scrolls.
6. Use the search control at the top of the left sidebar. `Previous match` and `Next match`, or `Shift+Enter` and `Enter`, move between results. `Escape` clears the search.

Richie saves every operation immediately to a hashed `.review.json` sidecar in `/tmp/richie-review-jsons`, keeping review state out of the source project. Each range operation retains the exact source quote and source range. Range highlighting applies only to the selection, not its containing paragraph or line.

Pending replacements show the original content struck through and the proposed replacement inline beside it. With a valid document selection active, Richie suppresses the browser context menu so `c`, `r`, and `d` remain available.

Click visible review markup to reveal its matching feedback card. The first matching card receives focus and overlapping matches flash together with a prominent outline.

### Math

Inline `$...$` expressions render as MathML. Starting a selection on rendered inline math switches it to its source text so TeX can be selected precisely; press `Escape` to restore the rendered form. Full inline-math actions remain available from the hover menu.

Display `$$...$$` blocks render as MathML and expose a collapsed `Math source` disclosure using the same interaction as Mermaid. Select individual source lines for Comment, Replace, or Delete, or use the rendered block for whole-block actions. Multiple aligned equations in one block remain a single Markdown math node.

### Tables, Mermaid, math, and images

Hover over a table cell to comment, replace, clear, delete its row, or delete its column. A column deletion highlights every cell in that column and exports a marker inside each affected table cell, preserving the Markdown table fences.

Mermaid diagrams render as SVG for reading and expose a source view for review. Select Mermaid source lines, not SVG elements. Review highlighting maps only to the source view, so a source selection cannot spread across generated SVG labels. If rendering fails, Richie opens the source automatically so it remains reviewable. Markers for Mermaid and ordinary fenced-code feedback are exported after the closing fence, so the source block continues to render. A code-block-level marker is aligned with that closing fence.

Richie renders direct, linked, and reference-style Markdown images. Hover an image and choose `Comment`, `Replace`, or `Delete`. The operation targets the complete image syntax. For a linked image, it also includes the outer link syntax. Replacement input is stored as Markdown text and is not rendered as active content in the review page.

Remote images load automatically only over HTTPS and use a no-referrer policy. Local images may use relative, parent-relative, or absolute WSL paths. Richie follows symlinks and serves authenticated PNG, JPEG, GIF, WebP, and AVIF files up to 25 MiB. A live session token can request any supported local raster image path. Do not share review URLs or tokens.

Missing, blocked, oversized, unsupported, and failed images show their original Markdown in a visible fallback. Richie does not render local SVG, `http:`, `file:`, `data:`, protocol-relative image URLs, raw HTML video, or raw HTML audio.

## Finish a review

Click `Finish review` when feedback is complete. Richie verifies the source hash, exports the next available `draft-vNN-commented.md`, and removes the temporary sidecar. If there is no open feedback, no commented copy is created.

Exported deletion markers quote the exact selected source text. Cell, row, column, block, and image deletions also identify their operation scope.

Click `Abort review` to discard open feedback without exporting a file.

Do not edit generated HTML as source. Do not treat the commented copy as canonical Markdown.

## Troubleshooting

If the service is unavailable, start it with `sudo systemctl start richie` and inspect `richie status` or `journalctl -u richie`.

If the source changes during a review, Richie blocks new feedback and export while retaining the sidecar. Restore the reviewed source or abort the review.

## WSL service installation

```sh
npm run build
sudo install -m 644 packaging/richie.service /etc/systemd/system/richie.service
sudo systemctl daemon-reload
sudo systemctl enable --now richie
```

The unit points to the current Node 22 path in `packaging/richie.service`. Update it if that installation moves.

## HTML artifacts

Run `richie review --json report.html` (or `.htm`) exactly as for Markdown. Richie captures an immutable snapshot and serves it only in an opaque-origin `sandbox="allow-scripts"` iframe. Self-contained scripts preserve local artifact navigation; same-directory regular CSS, JavaScript, image, and font assets are available through decoded lexical and realpath confinement. Forms, popups, downloads, top-level/nested frames, object/media/plugin content, workers, manifests, remote connections, cross-origin frames, privileged APIs, and shadow-DOM contents are blocked or outside the review target boundary.

Select rendered text spanning inline elements or choose an element, then Comment, Replace, or Delete. While its element feedback menu is open, Richie marks the target with a blue outline so the proposed feedback scope is visible. Element evidence includes selector, exact tag, document-root path, bounded normalized text, and viewport/document geometry. Text evidence includes common ancestor, both boundary selectors/child-node paths/offsets, bounded normalized and raw text, and geometry. Mermaid source remains a selectable fallback; rendered nodes use diagram ID, node ID, label, selector, and geometry. Selectors are bounded to 16 compound levels, and signed viewport coordinates are retained while dimensions remain bounded. Geometry is diagnostic evidence only. After refresh, a target resolves only when every identity anchor agrees. Ambiguous, missing, changed, delayed, rewritten, shadow-DOM, or cross-origin targets are shown in the card as **Unresolved target**, with selector/path evidence, and are never guessed or scrolled to.

The artifact token never leaves the trusted shell. Its SDK messages carry only the session correlation, a parent-issued per-load handshake challenge, and a per-frame capability plus validated candidate evidence. If the canonical file changes, the shell keeps showing the original snapshot and displays a stale banner; operations and Finish return `409` and leave the sidecar intact. Confirmed Reload intentionally adopts the new bytes, clears open operations, and rotates the frame capability.

Finish atomically writes `<source-basename>-commented.json` beside HTML only if open operations exist. It contains `schemaVersion`, `source`, `documentKind: "html"`, `sourceSha256`, `createdAt`, and open targets. Document notes are JSON operations, not HTML edits. Finish with no open operations and Abort remove only temporary state and produce no durable handoff. The canonical HTML bytes and hash remain unchanged.

### Redacted HTML handoff examples

```json
{"schemaVersion":1,"source":"/work/report.html","documentKind":"html","sourceSha256":"<64 hex chars>","createdAt":"<ISO timestamp>","operations":[
  {"id":"rvw_001","kind":"comment","status":"open","scope":"block","target":{"type":"html-element","selector":"#summary","path":[0,1,2],"tag":"p","text":"Summary text","rect":"<viewport/document/viewportSize>"}},
  {"id":"rvw_002","kind":"replace","status":"open","scope":"range","target":{"type":"html-text-range","selector":"#body","commonAncestorSelector":"#body","start":{"selector":"#body","path":[0,0],"offset":3},"end":{"selector":"strong","path":[0],"offset":8},"text":"selected words","exactText":"selected words","rect":"<viewport/document/viewportSize>"}},
  {"id":"rvw_003","kind":"delete","status":"open","scope":"block","target":{"type":"mermaid-node","diagramId":"diagram-1","nodeId":"node-a","label":"Start","selector":"#node-a","rect":"<viewport/document/viewportSize>"}}
]}
```

The Unilever acceptance fixture is external and must not be copied into this repository. Run `npm run browser:test` for maintained Playwright coverage. Record command exit status, browser/version, console and failed-network observations, screenshots for visual checks, the fixture byte count and SHA-256 before/after, and the parsed JSON handoff.

### Residual limitations

Shadow-DOM content and cross-origin iframe contents are not traversed or targetable. A source rewrite or script-generated DOM change that fails stored evidence remains unresolved; Reload discards pending operations by explicit confirmation. Forms, popups, downloads, navigation, nested frames, remote active content, and privileged API/filesystem access remain intentionally blocked.

Revision log: 2026-09-14 — documented immutable snapshots, strict target evidence and unresolved accessibility state, confined assets/CSP, Mermaid source/node behavior, HTML Finish/Abort, Playwright evidence, and residual limitations.
