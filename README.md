# Richie

Richie is a local visual review layer for versioned Markdown and local HTML artifacts. Markdown and HTML are always canonical source files: review state is temporary JSON, and only Markdown exports a `-commented.md` copy using `<<ASB: ...>>` markers.

See the [user guide](user-guide.md) for installation, review, and handoff instructions.

The review surface has document navigation on the left, review actions and feedback inventory on the right, inline range highlights, Markdown image review, math review, and document search. Replacements show the original struck through with the proposal inline. Clicking review markup reveals and highlights its matching feedback cards. The user guide and search controls remain fixed while the outline scrolls. The review actions remain fixed while the feedback inventory scrolls.

Richie renders inline, linked, and reference-style Markdown images. Hover an image to comment on, replace, or delete its complete Markdown syntax. Remote images load directly over HTTPS. Local PNG, JPEG, GIF, WebP, and AVIF files load through the authenticated review session, including absolute and parent-relative paths. SVG and raw HTML media remain disabled.

## Development

From the monorepo root:

```sh
cd ~/configs/richie
npm install
npm run check
npm test
npm run build
npm start
npm run review -- path/to/draft-v03.md
# or: npm run review -- report.html
```

The service binds only to `127.0.0.1:43173`. The CLI asks its Unix control socket to create a review session and opens the resulting tab with `xdg-open`.

## Install as a WSL service

Build first, then install the supplied system unit:

```sh
sudo install -m 644 packaging/richie.service /etc/systemd/system/richie.service
sudo systemctl daemon-reload
sudo systemctl enable --now richie
```

The unit uses the currently installed Node 22 binary under Akhil's NVM installation. It intentionally shares the host `/tmp` namespace so drafts and local media there are reviewable. Update `ExecStart` in `packaging/richie.service` when that Node installation moves.

Check it with `systemctl status richie` and inspect logs with `journalctl -u richie`. Stop it with `sudo systemctl disable --now richie`.

The service keeps WSL running while enabled. Review JSON files are ignored by Git and are deleted only after a successful `Finish review` action. Richie asks for confirmation before finishing, closes the review tab after the response, and does not export a file when there is no open feedback. The agent reviews and commits the resulting `draft-vNN-commented.md` file.

## HTML review

`richie review [--json] report.html` also reviews local `.html` and `.htm` artifacts without modifying them. The service captures one immutable source snapshot and renders it in an opaque-origin `sandbox="allow-scripts"` iframe. The iframe may execute self-contained scripts and load regular same-root CSS, JavaScript, image, and font assets, but the artifact policy blocks forms, popups, downloads, top-level or nested navigation, media/object/plugin content, workers, manifests, network connections, cross-origin frames, and privileged Richie APIs. Paths are decoded once, rejected on traversal, and confined by both lexical and resolved-realpath checks.

A target is structured evidence, not an HTML source offset. Element targets include a unique selector, exact tag, document path, bounded text, and geometry. Text-range targets include the common ancestor, both boundary selectors/child-node paths/offsets, bounded raw and normalized text, and geometry. Mermaid node targets include diagram ID, node ID, label, and selector. Selectors are bounded to 16 compound levels and coordinates retain legitimate signed viewport positions while dimensions remain bounded. On refresh the artifact resolves every identity anchor; ambiguity, mismatch, delayed resolution timeout, shadow DOM, or a source/DOM rewrite is shown as **Unresolved target** and is never guessed or highlighted.

Finish writes exactly one atomic `<name>-commented.json` handoff beside the HTML only when open operations exist. It contains `schemaVersion`, canonical source path, `documentKind: "html"`, source SHA-256, creation metadata, and open structured operations. A document note is stored in that JSON; it is not inserted into HTML. No-open Finish and Abort remove the temporary `.review.json` without creating a handoff. If disk bytes change, the shell keeps displaying the captured snapshot, shows a stale banner, and blocks operations and Finish with `409`; confirmed Reload adopts the new snapshot, clears operations, and rotates the artifact capability.

The artifact URL, SDK, and postMessage payloads contain only the generated correlation, parent-issued per-load handshake challenge, and frame capability; the review token stays in the trusted shell/API boundary. `npm run browser:test` runs the maintained Playwright suite against repository fixtures and the supplied external Unilever deck without copying or mutating it. Known limitations are shadow-DOM content and cross-origin iframe contents; source rewrites intentionally require re-review, while blocked active capabilities remain blocked.

Revision log: 2026-09-14 — added immutable HTML snapshot, strict target evidence, confined assets, Mermaid fallback/node support, unresolved accessibility state, browser validation, and JSON handoff details.
