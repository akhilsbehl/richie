# Implementation tickets

Each ticket below is mirrored as a GitHub issue on `akhilsbehl/richie`. References like `{{QA-03}}` are replaced by issue numbers in the GitHub copies; the table in [§ Sequence](#sequence) maps keys to numbers.

Read [`HANDOFF.md`](HANDOFF.md) before starting any ticket.

## Sequence

Work top to bottom. Tickets in the same wave have no dependency on each other and may be done in either order. Do not start a ticket until every ticket in its **Depends on** column is merged.

| Wave | Key | Title | Depends on | GitHub |
|---|---|---|---|---|
| — | QA-00 | Epic: black-box verification system | — | {{QA-00}} |
| 1 | B-2 | Remove shell search entirely | — | {{B-2}} |
| 1 | QA-01 | Isolation seams and removal of the client-deck test | — | {{QA-01}} |
| 1 | QA-02 | Accessible names for shell and in-frame controls | — | {{QA-02}} |
| 2 | QA-03 | QA scaffold: runner, harness, doctor, summary, corpus | QA-01 | {{QA-03}} |
| 3 | QA-04 | Feature map and map check (warn mode) | QA-03 | {{QA-04}} |
| 3 | QA-06 | HTML contract: security matrix, headers, token absence, envelope | QA-03 | {{QA-06}} |
| 3 | QA-08 | Markdown contract: replay of real pairs plus synthetic scenarios | QA-03 | {{QA-08}} |
| 4 | QA-05 | Kind adapters, real-input helper, shared-core lifecycle tests | B-2, QA-02, QA-03, QA-04 | {{QA-05}} |
| 5 | QA-07 | HTML journeys with real input | QA-05, QA-06 | {{QA-07}} |
| 5 | QA-09 | Markdown journeys with real input | QA-05, QA-08 | {{QA-09}} |
| 6 | QA-10 | Property tests P1–P8 | QA-06, QA-07, QA-08 | {{QA-10}} |
| 6 | QA-11 | Visual baselines | QA-07, QA-09 | {{QA-11}} |
| 7 | QA-12 | Mutation testing | QA-06, QA-08, QA-10 | {{QA-12}} |
| 8 | QA-13 | Strict map, richie-qa skill, pre-push hook | QA-04 … QA-12 | {{QA-13}} |
| 9 | QA-14 | Retire legacy tests and manual plans | QA-13 | {{QA-14}} |
| — | B-1 | Bug: HTML `c`/`r`/`d` shortcuts inert once the in-frame menu opens | — (owner verifies by hand first) | {{B-1}} |

B-1 is not part of the epic. Do not work it in the implementation session unless the owner asks.

---

<!-- TICKET: QA-00 -->
## QA-00 — Epic: black-box verification system for Richie

**Why.** The current suite (54 Node tests, 7 Playwright tests) is green but implementation-coupled: 137 regex assertions on CSS and bundle text, and 13 of 14 test files import internals. It will not protect the planned rearchitecture. Markdown review has one browser test; much of the HTML manual plan is not automated.

**Goal.** A verification system that talks to Richie only through what a user or agent can observe: the CLI, the HTTP API, files on disk, and the rendered shell and HTML artifact frame, found by role and visible text. Any implementation, current or rewritten, must pass the same suite.

**Design.** `verification-research/README.md` (on branch `qa/verification-plan`, then `master` once merged). Layers L0–L5, shared-core kind matrix (§4.4), contract surfaces S1–S6 (§2).

**Scope.** Child tickets in the sequence table in `verification-research/TICKETS.md`:
{{CHILD_LIST}}

**Out of scope (owner decisions, 2026-10-06).**
- HTML delete trust gap (README §5.4): accepted. No fix, no test.
- `c`/`r`/`d` shortcut defect: separate bug {{B-1}}.
- Shell search: removed by {{B-2}}; never test it.

**Done when.** QA-14 is closed, `npm run qa` is the documented gate in `AGENTS.md`, and the pre-push hook runs it.
<!-- END -->

<!-- TICKET: B-2 -->
## B-2 — Remove shell search entirely

**Why.** Owner decision (2026-10-06): the reviewer will use browser-level search (Ctrl+F). Shell search duplicates it, and it cannot search HTML artifacts, because their text is inside the iframe (`collectDocumentText` walks only `#document`). Remove it, so the verification suite never encodes it.

**Change.**
- `src/service.ts` `renderReviewPage`: delete the `<div class="search-box" role="search">…</div>` block (label, `#document-search` input, `#search-count` output, `search-previous` and `search-next` buttons).
- `src/service.ts` styles: delete the `.search-box*`, `#navigation .search-box*`, `.search-match`, `.search-current`, `::highlight(richie-search)` and `::highlight(richie-search-current)` rules. Remove `#navigation .search-box` from the `#toolbar,#guide-link,… {flex:none}` selector list.
- `src/client.ts`: delete `searchMatches`, `searchIndex`, `clearSearchHighlights`, the search-highlight function, `collectDocumentText` and its helper (the offset-mapping function around lines 300–316) if nothing else uses them, `updateSearch`, the step function, and the listeners at lines 673–678. Run `grep -n "search\|collectDocumentText" src/client.ts` after the edit; only URL `searchParams` uses may remain.
- Do not touch `url.searchParams` uses in `service.ts`, `html-review-sdk.ts`, or tests; those are URL parsing, not the search feature.
- Docs: remove search from `README.md` ("…and document search" and "The user guide and search controls remain fixed…" in § CLI review workflow), `user-guide.md` (line 31: drop "and search controls"; delete step 6 at line 32 and renumber), and `spec.md` line 275 ("fixed guide and search controls" becomes "a fixed guide link"). Leave `spec.md` line 356; that is re-anchoring, not UI search. Keep the guide link and outline.
- Tests: in `tests/service.test.ts` remove `#navigation \.search-box` from the regex at line 53, and delete the search-button sizing assertion (`#navigation \.search-box button…`). In `tests/html-review.browser.spec.ts`, "Markdown review keeps its rendered reading and search surface": delete the two search lines (`#document-search` fill, `#search-count` assert) and rename the test to "Markdown review keeps its rendered reading surface".

**Acceptance.**
- `npm run check`, `npm test`, and `npm run browser:test` pass.
- `grep -rn "document-search\|search-count\|search-next\|search-previous\|richie-search" src tests` returns nothing.
- Manual: open a Markdown and an HTML review; the left sidebar shows the guide link and outline only; Ctrl+F in the browser finds Markdown text.

**Notes.** One commit. The verification inventory already marks search rows CO-28 and CO-29 as removed.
<!-- END -->

<!-- TICKET: QA-01 -->
## QA-01 — Isolation seams and removal of the client-deck test

**Why.** Tests share `/tmp/richie-review-jsons` with the live systemd service, and the CLI always launches `xdg-open`. A test run can collide with a real review and opens Windows browser tabs. One browser test reads a client deck at a fixed path. Owner approved these seams on 2026-10-06 (README §6).

**Change.**
1. `src/paths.ts`: `reviewDirectory` reads `process.env.RICHIE_REVIEW_DIR`, default `/tmp/richie-review-jsons`. Keep the exported name. Resolve it at call time (function or getter), not at import time, so tests can set it per process.
2. `src/cli.ts` line 63: the open command comes from `process.env.RICHIE_OPEN_COMMAND`, default `xdg-open`. If the value is `true` or empty, skip spawning. Keep `detached`, `stdio: "ignore"`, `unref()`.
3. `tests/html-review.browser.spec.ts`: delete the test "the supplied Unilever acceptance fixture opens, navigates, and remains byte-identical" and its hard-coded `/home/akhil/warchives/...` path. The lighthouse deck replaces it in QA-07.
4. Docs: remove the Unilever references from `README.md` ("…and the supplied external Unilever deck…"), `user-guide.md` (the "Unilever acceptance fixture is external…" paragraph), `spec.md` §HTML (the external-fixture hash sentence), and `manual-html-test-plan-v00.md` §"Acceptance fixture". Document both env variables in `README.md` § Development.
5. `packaging/richie.service`: no change; defaults preserve behaviour.

**Acceptance.**
- `RICHIE_REVIEW_DIR=$(mktemp -d) npm test` passes, and `/tmp/richie-review-jsons` gains no new files during the run (compare `ls` before and after).
- `RICHIE_OPEN_COMMAND=true node dist/src/cli.js review --json <file>` prints `{id,url}` and opens no browser (needs a running service; or cover it with a unit test that stubs `PATH`, like `tests/cli.test.ts`).
- `grep -rni "unilever\|warchives" .` in the repo returns nothing outside `verification-research/`.
- `npm run check`, `npm test`, `npm run browser:test` pass.
<!-- END -->

<!-- TICKET: QA-02 -->
## QA-02 — Accessible names for shell and in-frame controls

**Why.** The suite must find controls by role and accessible name (Playwright best practice; README §4.7). CSS-selector locators break under a rewrite. This is also an accessibility improvement. Owner approved (README §6).

**Change.** No visible change. Audit with Playwright's `page.accessibility` or `getByRole` in a scratch script, then fix:
- Every icon-only button has an `aria-label`: copy buttons (`.copy-block`, copy-path in the breadcrumb), any close or remove icon.
- `#richie-dialog` has an accessible name: `aria-labelledby="richie-dialog-title"`; the textarea is labelled by `#richie-dialog-field span`.
- The feedback list `#operations` is a labelled region (`role="region" aria-label="Review feedback"`), and each card is an `article` or `listitem` whose name includes the operation id.
- Unresolved and pending status lines keep `role="status"` (they already have it; check).
- In-frame SDK menu (`src/html-review-sdk.ts`, `.richie-html-ui`): `role="menu"` or `role="toolbar"` with `aria-label="Review actions"`; its buttons are named Comment, Replace, Delete.
- Markdown hover and block menus in `src/client.ts`: the same pattern.
- Add `data-testid` only where no role plus name can be unique. List each one in the PR description with the reason.

**Acceptance.**
- A scratch Playwright script (not committed) lists every `button`, `dialog`, `textbox`, `region`, and `status` in a Markdown review and an HTML review, each with a non-empty accessible name. Paste the list into the PR.
- Existing tests pass. Update the bundle-string tests only where a label string changed.
- No visual change at 1440×900: before and after screenshots match by eye.
<!-- END -->

<!-- TICKET: QA-03 -->
## QA-03 — QA scaffold: runner, harness, doctor, summary, corpus

**Why.** Every later ticket needs one way to start Richie as a black box in isolation and one report format. README §4.2, §4.3, §4.10; sketches in `examples.md` §1–§3.

**Change.**
1. Folder `qa/` with the layout in `examples.md` §1.
2. `playwright.qa.config.ts`: `testDir: "qa"`, `retries: 0`, `workers: 1` to start, Chromium at `process.env.RICHIE_CHROME ?? "/usr/bin/google-chrome"`, viewport 1440×900, `trace: "retain-on-failure"`, HTML reporter to `qa-artifacts/<timestamp>/report`, plus a small custom reporter that writes `qa-artifacts/<timestamp>/summary.json` (shape in `examples.md` §9). Projects: `md`, `html`, `md-only`, `html-only` (`examples.md` §2), plus `contract` for API-only tests.
3. `qa/harness/richie.ts`: `startRichie()` spawns `node dist/src/service.js` with `RICHIE_HTTP_PORT` (free port), `RICHIE_CONTROL_SOCKET`, `RICHIE_REVIEW_DIR` (temp root), and `RICHIE_OPEN_COMMAND=true`. Wait on `GET /status` over the socket with exponential backoff, capped at 10 s. Helpers: `review(file)` and `poll(id)` run the real CLI (`node dist/src/cli.js`) with the same env; `api(method, path, token, body)` sends the correct `Host` header; `copyFixture(name)` copies from `qa/corpus/` into the temp root; `stop()` kills only the spawned child. Expose it as a Playwright fixture so each test gets its own instance.
4. **Never import from `src/`** anywhere under `qa/`. Add a check in `qa/doctor.ts` that greps `qa/` for `from "../src` or `/src/` imports and fails.
5. `qa/harness/scrub.ts`: replace ISO timestamps, UUIDs, the temp root path, and 64-hex hashes with stable placeholders; round numbers inside any `rect` object to integers.
6. `qa/doctor.ts`: Node ≥ 22; Chrome binary exists; `dist/` exists and is newer than every file in `src/`; no leftover `richie-qa-*` dirs under `os.tmpdir()`; the import rule above; prints one line per check and exits non-zero on failure. It must not touch `/run/richie` or the systemd service.
7. Corpus: copy `verification-research/fixtures/markdown/pairs/` to `qa/corpus/md/pairs/`, `fixtures/markdown/render/` to `qa/corpus/md/render/`, `fixtures/html/lighthouse-deck/` to `qa/corpus/html/lighthouse-deck/`, and `tests/fixtures/html-review/*` to `qa/corpus/html/`. Extract the Markdown fixture sections of `manual-test-plan-v01.md` (from "## Executive summary" to before "## Case index", plus the "## Fixture:" sections and MT-21 math) into `qa/corpus/md/railway.md`, and the fixture sections of `manual-media-test-plan-v00.md` into `qa/corpus/md/media.md`.
8. `package.json` scripts: `qa:doctor`, `qa` (`npm run build && npm run check && npm run qa:doctor && playwright test -c playwright.qa.config.ts`), `qa:approve` (runs the given `--grep` with `--update-snapshots`, then prints `git diff --stat qa/`). Add `qa-artifacts/` to `.gitignore`.
9. One smoke test `qa/core/smoke.spec.ts`: start Richie, `review --json` on `qa/corpus/md/railway.md`, abort through the API, and assert that `poll` returns `{"status":"aborted"}` and the source bytes are unchanged.

**Acceptance.**
- `npm run qa` passes with the smoke test, writes `summary.json`, and leaves no `richie-qa-*` temp dirs.
- Running `npm run qa` while the systemd `richie` service is active neither changes `/tmp/richie-review-jsons` nor interferes with a live review.
- `npm test` and `npm run browser:test` still pass. Legacy suites are untouched.
<!-- END -->

<!-- TICKET: QA-04 -->
## QA-04 — Feature map and map check (warn mode)

**Why.** The feature map replaces the manual plans as the list of what must be proven. README §4.10; inventory `verification-research/feature-inventory.md`.

**Change.**
1. `qa/features.yaml`: one entry per row in `feature-inventory.md` that is not marked REMOVED, ACCEPTED GAP, or DEFERRED. Fields: `id`, `title`, `kind` (`md`, `html`, `both`), `surfaces` (S1–S6), `layers` (L1–L4), and optional `notes`. Keep the inventory's IDs exactly.
2. `qa/quarantine.yaml`: an empty list; schema `{ id, test, reason, expires: YYYY-MM-DD }`.
3. `qa/check-map.ts`: runs `playwright test -c playwright.qa.config.ts --list --reporter=json`, extracts `@ID` tags from test titles and their project names, and reports (a) features with no test, (b) tags not in the map, (c) `both` features missing the `md` or `html` project, (d) required layers with no test in the matching folder (L1 `contract/`, L2 `properties/`, L3 `journeys/` or `core/`, L4 any test calling `toHaveScreenshot`), (e) expired quarantine entries.
4. Mode: `QA_MAP_STRICT=1` exits non-zero on any finding; otherwise print findings and a coverage percentage, and exit 0. QA-13 turns strict on.
5. Add `qa:map` to `package.json` and call it at the end of `npm run qa`.

**Acceptance.**
- `npm run qa:map` prints a coverage table: features, tested, missing, per kind.
- A test titled `@NOPE-01 …` is reported as unknown.
- With `QA_MAP_STRICT=1` the command fails today, which is expected until QA-13.
<!-- END -->

<!-- TICKET: QA-05 -->
## QA-05 — Kind adapters, real-input helper, shared-core lifecycle tests

**Why.** Markdown and HTML share the CLI, lifecycle, stale handling, and feedback cards. Testing these once per kind through one adapter keeps the two paths at equal depth. README §4.4; `examples.md` §2 and §4; inventory rows CO-01 … CO-27.

**Change.**
1. `qa/harness/adapters/types.ts`: the `KindAdapter` interface from `examples.md` §2. `markdown.ts` and `html.ts` implement it. The HTML adapter waits for frame readiness by observing the shell UI (no card reads "Target resolution pending…", or the frame heading is visible through `page.frameLocator("#html-artifact")`). It must not inspect `postMessage` internals.
2. Basic fixtures: `basic` is `qa/corpus/md/railway.md` or `qa/corpus/html/report.html`; `stale` is a copy that the test edits on disk.
3. `qa/harness/select.ts`: `dragSelect(page, scope, fromText, toText)`. Find the first character of `fromText` and the last character of `toText` with `Range.getBoundingClientRect()` evaluated inside `scope` (works inside the frame). Add the iframe's `boundingBox()` offset when `scope` is in a frame. Then `page.mouse.move`, `down`, `move` in 10 steps, `up`. Return `String(getSelection())` from the right document. Reference implementation: `verification-research/fixtures/html/real-input-demo.mjs`.
4. **Use the in-frame menu or shell menu buttons to create feedback, not the `c`/`r`/`d` keys.** The HTML shortcut path has a known defect ({{B-1}}). Markdown keyboard shortcuts are covered separately in QA-09.
5. `qa/core/*.spec.ts` tests, each run in projects `md` and `html`: CO-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27. Each test: one `@ID` tag; three-way proof (UI by role and text, `GET /api/state`, file on disk); source bytes unchanged. For CO-23, induce failures by changing the source on disk (409) or stopping the service, never by mocking.
6. Text snapshots of outputs go under `qa/core/*-snapshots/` with names that include the project (`CO-06.md.txt`, `CO-06.html.txt`).

**Acceptance.**
- `npx playwright test -c playwright.qa.config.ts qa/core` passes in both projects, three times in a row (`--repeat-each=3`), with 0 flaky.
- `npm run qa:map` shows every listed CO row covered for both kinds (CO-18 and CO-19 arrive with QA-10).
- No locator in `qa/core` uses a CSS class or `data-md-*` attribute. Allowed id selectors: `#html-artifact` only.
<!-- END -->

<!-- TICKET: QA-06 -->
## QA-06 — HTML contract: security matrix, headers, token absence, envelope

**Why.** The HTML artifact security policy is a contract (README §2, surface S6). It is fully specified in `manual-html-test-plan-v00.md` § "Security and stale checks", in `~/.richie/ephemeral/richie-html-markdown-manual-test-plan.md` §5, and in `src/service.ts` lines 239–243 (CSP) and 396–411 (artifact routes). Sketch: `examples.md` §5.

**Change.** `qa/contract/html/*.spec.ts`, API-only (no browser):
1. **Security matrix** (HT-03, HT-04, HT-05, HT-28 path part): the probe list in `examples.md` §5 plus Windows drive paths (`C:/x`, `C:%5Cx`), double-encoded traversal, a trailing-dot extension, and an outside-root symlink created in the temp root. For each, record status, `content-type`, `cache-control`, `x-content-type-options`, and `content-security-policy` into one text table. Snapshot it as `artifact-security.txt`.
2. **Symlink swap** (HT-04): replace an allowed asset with a symlink to an outside file between two requests; the second must fail.
3. **Injection golden** (HT-08): the served `index.html` for `report.html`, `malformed.html`, and `no-body.html`, scrubbed of nonce values. Assert the SDK script tag appears exactly once, before `</body>` when one exists.
4. **Token absence** (HT-07, API part): the served artifact HTML and the SDK URL never contain the session token. The message-payload part comes in QA-07.
5. **Envelope golden** (HT-20, CO-15): create operations through `POST /api/operations/:id`, using hand-written targets that pass `parseHtmlTarget` (one of each type) plus a document note. Finish, then snapshot the scrubbed `-commented.json`. Assert one file exists, its mode is `0600`, and no `*.tmp` is left.
6. **Target validation** (HT-18, API part): table-driven 400 cases: selector depth over 16, text over 2048, path depth over 64, non-finite rect, zero viewport, unknown keys, wrong scope for the type.
7. **Stale and Reload** (HT-19, API part): edit disk bytes, then ops and Finish return 409; `POST /api/reload` rotates the artifact nonce, and the old `n` returns 404.

**Acceptance.**
- All tests pass; snapshots are committed and reviewed by the owner (show the `artifact-security.txt` table in the PR).
- Deliberately weaken the CSP string locally (remove `connect-src 'none'`): the security golden fails. Revert.
<!-- END -->

<!-- TICKET: QA-07 -->
## QA-07 — HTML journeys with real input

**Why.** The last 15 commits are HTML interaction fixes (hover handoff, annotation sync, message delivery, selector resolution). The existing HTML browser tests set selections by script and import `RichieService` in-process. README §4.7; `examples.md` §7; inventory HT-01 … HT-31 (except accepted, deferred, and removed rows).

**Change.** `qa/journeys/html/*.spec.ts` on the black-box harness:
1. Port the scenarios in `tests/html-review.browser.spec.ts` (except the deleted Unilever test): precise selection, element actions, Mermaid nodes, resolution state, repeated siblings, fail-closed shell actions, previous-generation capability, narrow viewport, Finish and Abort. Replace `document.createRange()` + synthetic `mouseup` with `dragSelect`. Replace `RichieService` imports with the harness.
2. New journeys on `qa/corpus/html/lighthouse-deck/deck.html` (HT-23): slide controls and Arrow and PageUp/PageDown keys change the visible slide inside the frame, and the shell URL never changes. The fonts and `assets/beam.png` load (check `naturalWidth > 0` and `document.fonts.check`). Text range across `<strong>Whale oil</strong> … <em>scarce` on `#fuel-whale`. Repeated `article.pattern` siblings: choose the second, and Jump decorates only it. Mermaid `#keeper-night` node target. Table cell element target on `#lens-orders`. Bytes unchanged after Abort and after Finish.
3. Blocked capabilities (HT-06, HT-28): add `qa/corpus/html/capabilities.html`, whose buttons try form submit, `window.open`, `location.href=`, nested iframe, `fetch`, XHR, WebSocket, EventSource, `new Worker`, `navigator.serviceWorker.register`, a download link, and access to `parent.document` and `window.__RICHIE__`. Click each with the real mouse. Assert on `securitypolicyviolation` events recorded inside the frame, `page.on("request")` showing no non-127.0.0.1 request, an unchanged shell URL, and errors written to an on-page log.
4. Token absence in messages (HT-07, browser part): `examples.md` §5, second test.
5. Unresolved (HT-16, HT-29, HT-30, HT-31): mutate the live frame DOM through `frameLocator(...).evaluate` after the targets are saved, then Jump. The card shows the Unresolved text with role `status`, and no element in the frame gains a decoration.
6. Save one captured target of each type to `qa/scenarios/html/*.json` for reuse by QA-10.
7. Use in-frame menu buttons, not `c`/`r`/`d` keys ({{B-1}}). HT-27 (keys ignored in text fields and with modifiers) may be tested because it asserts no action.

**Acceptance.**
- Every HT row in `feature-inventory.md` that is not REMOVED, ACCEPTED, or DEFERRED and lists L3 has a passing `@HT-xx` test.
- `--repeat-each=3` gives 0 flaky.
- No `waitForTimeout` anywhere; all waits are on conditions.
<!-- END -->

<!-- TICKET: QA-08 -->
## QA-08 — Markdown contract: replay of real pairs plus synthetic scenarios

**Why.** The `-commented.md` format is the agent-facing contract. Nine real reviews exist as original and commented pairs, and each strips back to its original byte for byte (`verification-research/fixtures/README.md`). Real data has no replace, code, Mermaid, math, media, row, or column operations, so those need synthetic scenarios.

**Change.**
1. `qa/harness/markers.ts`: parse `<<ASB: [rvw_NNN] …>>` markers (format in `src/store.ts` `marker()`). Return id, inferred kind and scope from the marker phrase (`Comment on block`, `Comment on cell`, `Delete the block`, `Delete`, `Replace … with`, `Clear the table cell`, `Delete the table row…`, `Delete the table column…`, image variants), quote (a JSON string), and comment or replacement.
2. Range recovery: walk markers in order. The range end is the marker's offset in the commented text minus the length of all earlier insertions; the start is end minus the quote length, after `JSON.parse(quote)`. Assert `source.slice(start, end) === quote`. Leading document notes (`placement: "start"`) have no range. Code-fence markers sit after the closing fence; recover their range by searching for the quote inside the fence that precedes the marker.
3. `qa/contract/md/replay.spec.ts` (MT-23): for each pair in `qa/corpus/md/pairs/`, start a session on the original, post the recovered operations through the API, Finish, and assert the new output equals the stored `-commented.md` exactly. If a pair cannot be recovered unambiguously, list it in the test output and fail; do not skip it silently.
4. `qa/scenarios/md/*.json` (format in `examples.md` §8) and `qa/contract/md/scenarios.spec.ts`, one golden per scenario for: MT-05 A–F, MT-06 A–E (replace), MT-07 A–E, MT-09 A–D, MT-10 A–B (row and column), MT-12 A–D (code), MT-13 C (Mermaid source lines), MT-21 (math source lines), MI-01, MI-03, MI-04 (images), CO-15 (document note), MT-22 (`-commented-2.md`). Quote text comes from `qa/corpus/md/railway.md` and `media.md`.
5. API edge goldens: invalid range (start ≥ end, end past the source length) gives 400; the media route without a token gives 404; an image over 25 MiB gives 413 (MI-06; create a sparse file in the temp root).

**Acceptance.**
- 9/9 pairs replay exactly.
- Every scenario's golden is committed and reviewed by the owner.
- Deliberately change one marker phrase in `src/store.ts` locally: replay and scenario tests fail. Revert.
<!-- END -->

<!-- TICKET: QA-09 -->
## QA-09 — Markdown journeys with real input

**Why.** Markdown review is the primary product and has one browser test. Behaviour comes from `manual-test-plan-v01.md` (MT-01 … MT-21), `manual-media-test-plan-v00.md` (MI-01 … MI-04), and `~/.richie/ephemeral/richie-html-markdown-manual-test-plan.md` §13 (MD-01 … MD-08, newest).

**Change.** `qa/journeys/md/*.spec.ts` on `qa/corpus/md/railway.md` and `media.md`:
- One test per MT, MI, and MD row in `feature-inventory.md` that lists L3 (MT-01, 02, 04, 05 A–F, 06 A–E, 07 A–E, 08, 09 A–D, 10 A–B, 11, 12 A–D, 13 A–D, 21, 24, 25, MI-01, 02, 03, 07, MD-01).
- Selections with `dragSelect`; reverse selections drag right to left (MT-05E).
- MT-04 hover timing: use Playwright's clock (`page.clock.install()`, then `runFor(219)` gives no menu and `runFor(2)` shows it).
- MT-08 keyboard shortcuts **in Markdown** are in scope: the defect {{B-1}} is HTML-only. If a Markdown shortcut also fails after a real drag, stop and report it; do not work around it.
- Clipboard (MD-01): create the browser context with `permissions: ["clipboard-read", "clipboard-write"]`, click the copy button, then read `navigator.clipboard.readText()`.
- Three-way proof per action; at least one Finish per spec file, compared with a golden from QA-08 where the scenario matches.
- Search is out of scope (removed by {{B-2}}).

**Acceptance.**
- Every listed row has a passing `@ID` test; `--repeat-each=3` gives 0 flaky.
- No CSS-class or `data-md-*` locators. Allowed: role, label, and text locators, plus `#document` as a scope.
<!-- END -->

<!-- TICKET: QA-10 -->
## QA-10 — Property tests P1–P8

**Why.** Invariants catch cases nobody wrote an example for. README §4.6; `examples.md` §4 (Markdown markers) and §6 (HTML fail-closed).

**Change.**
1. Add dev dependency `fast-check` (approved with this ticket; if Zscaler blocks `npm install`, stop and tell the owner).
2. `qa/properties/*.spec.ts`, each with a `@ID` tag and `numRuns` from `QA_RUNS` (default 50 for browser properties, 100 for API ones); print the seed on failure; honour `QA_SEED`.
   - P1 (CO-18): source bytes unchanged after Finish, for random documents of both kinds and random valid operations.
   - P2 (CO-19): random JSON bodies to every API route give 2xx or 4xx, never 5xx, and `GET /api/state` is unchanged after any 4xx.
   - P3 (MT-20): removing markers from the output gives the source (reuse the QA-08 parser). This also probes whether comment text containing `>>` breaks parsing; if it does, record the counterexample in the PR and ask the owner. Do not change product code in this ticket.
   - P4 (MT-12): fences stay balanced in the output.
   - P5 (HT-17): capture-then-resolve round trip on generated HTML (generator in `examples.md` §6).
   - P6 (HT-16): after one mutation, Jump resolves to the same node or shows Unresolved, never a different node.
   - P7 (HT-04): random relative asset paths never return bytes from outside the temp root (place a canary file outside it and search responses for its content).
   - P8 (HT-18): every target the SDK emits in P5 is accepted by the API; every generated over-bound target is rejected with 400.
3. `qa:full` script: `QA_RUNS=1000` for API properties and 200 for browser properties, plus `--repeat-each=3`.

**Acceptance.**
- `npm run qa` stays under 4 minutes overall.
- `npm run qa:full` passes, or each counterexample is filed as an issue and linked in the PR.
<!-- END -->

<!-- TICKET: QA-11 -->
## QA-11 — Visual baselines

**Why.** Layout and decoration regressions are visible but not semantic. README §4.8.

**Change.** `qa/journeys/visual.spec.ts` with `toHaveScreenshot` at 1440×900 (and 390×844 where listed): Markdown page top; Markdown hover menu open; Markdown replacement preview; Markdown stale banner; HTML page with one comment, one replace, and one delete decoration (HT-14); HTML element menu with the blue outline (HT-12); HTML Unresolved card (HT-16); HTML at 390×844 (CO-16). Mask the Mermaid SVG if three runs disagree. Use `animations: "disabled"`. Store baselines under `qa/journeys/visual.spec.ts-snapshots/`.

**Acceptance.**
- Three consecutive runs give zero pixel diff.
- Changing one colour token in `src/service.ts` locally fails at least one baseline. Revert.
- The PR includes the baseline images for owner approval.
<!-- END -->

<!-- TICKET: QA-12 -->
## QA-12 — Mutation testing

**Why.** Coverage shows what ran; mutation score shows what was checked. README §4.9.

**Change.**
1. Dev dependencies `@stryker-mutator/core` (approved with this ticket; stop and tell the owner if the install is blocked).
2. `stryker.config.json`: `testRunner: "command"`, `commandRunner.command: "npm run build && npx playwright test -c playwright.qa.config.ts --project=contract --project=md-only --project=html-only qa/contract qa/properties"`, `mutate`: `src/store.ts`, `src/render.ts`, `src/paths.ts`, `src/html-target.ts`, and in `src/service.ts` the asset-confinement function, the artifact-injection function, and the API handler block (use line ranges). `coverageAnalysis: "off"`, `concurrency: 2`, `timeoutMS` generous.
3. Script `qa:mutate`. Report to `qa-artifacts/mutation/`.
4. Triage survivors: for each, add a test or write a one-line reason in `qa/MUTATION-NOTES.md`.
5. One-off (not scripted weekly): run the same tool on `src/html-review-sdk.ts` with the `html-only` journeys as the command, and record the score in `MUTATION-NOTES.md`.

**Acceptance.**
- Score ≥ 80 % on the listed core files, or the gap is explained per survivor in `MUTATION-NOTES.md`.
- The score is recorded in `summary.json` when `qa:full` runs mutation.
<!-- END -->

<!-- TICKET: QA-13 -->
## QA-13 — Strict map, richie-qa skill, pre-push hook

**Why.** The system must stay honest without the owner reading TypeScript. README §6–§9; draft skill `verification-research/skill-draft/SKILL.md`.

**Change.**
1. Turn on `QA_MAP_STRICT=1` in `npm run qa`. Fix or explicitly quarantine every finding.
2. Install the skill: copy `verification-research/skill-draft/SKILL.md` to `skills/richie-qa/SKILL.md`. Update its commands and paths to the real ones built in QA-03 … QA-12, and add the HTML triage table as written. Keep the hard limits verbatim.
3. `qa/LESSONS.md` with a header and one example line.
4. Git hook: `.githooks/pre-push` runs `npm run qa`; `npm run qa:install-hooks` sets `git config core.hooksPath .githooks`. Document it in `AGENTS.md`.
5. `AGENTS.md`: add a "Verification" section. `npm run qa` is the gate before every commit that touches `src/`; use the `richie-qa` skill; never update snapshots without owner approval.
6. Dry run: on a scratch branch, break one thing per kind (for example, change a Markdown marker phrase, and make the SDK skip one decoration class). Run the skill's triage. Paste the summary and classification into the PR. Delete the scratch branch.

**Acceptance.**
- `npm run qa` passes in strict mode.
- The dry run classified both breaks as regressions and named the failing feature IDs.
<!-- END -->

<!-- TICKET: QA-14 -->
## QA-14 — Retire legacy tests and manual plans

**Why.** The 137 regex-on-source assertions and in-process tests block a rewrite and duplicate the new suite. README §8, step 9.

**Change.**
1. For each test in `tests/*.test.ts` and `tests/html-review.browser.spec.ts`: find the `qa/` test(s) covering the same behaviour (by feature ID). If covered, delete it. If not, keep it and add a `// legacy: no qa equivalent for <behaviour>` comment, or write the missing `qa/` test first.
2. Keep pure unit tests of functions whose contract is stable and that need no internals beyond their module (for example `source-offset.test.ts`), if any remain useful. List the kept tests in the PR.
3. Delete `tests/client-bundle.test.ts` and `tests/manual-plan.test.ts` once covered.
4. Move `manual-test-plan-v00.md`, `manual-test-plan-v01.md`, `manual-media-test-plan-v00.md`, and `manual-html-test-plan-v00.md` to `docs/archive/`, with a note pointing to `qa/features.yaml`. Update `README.md` § Development and `AGENTS.md` commands: `npm run qa` replaces `npm test` and `npm run browser:test` as the gate. Keep `npm test` working if anything still uses it, or alias it to `qa`.
5. Re-run `npm run qa:full`, including mutation, and confirm the score did not drop compared with QA-12.

**Acceptance.**
- No remaining test imports from `src/` except the listed pure unit tests.
- `grep -c "assert.match(" tests/*.ts` shows no CSS or bundle regex.
- `npm run qa:full` is green with a mutation score ≥ the QA-12 value.
<!-- END -->

<!-- TICKET: B-1 -->
## B-1 — Bug: HTML `c`/`r`/`d` shortcuts are inert once the in-frame menu opens

**Status.** Reproduced in headless Chrome 154 on 2026-10-06. The owner will check it in a normal browser before any fix. Low priority: the owner rarely uses shortcuts.

**Steps.**
1. `richie review --json verification-research/fixtures/html/lighthouse-deck/deck.html`.
2. On slide 4, drag with the mouse from "Whale" to "scarce".
3. The in-frame menu (Comment, Replace, Delete) appears.
4. Press `c`.

**Expected.** The "Add comment" dialog opens for the selection (as the user guide, `manual-html-test-plan-v00.md` step 2, and the 2026-09-15 acceptance plan §6.1 state).
**Actual.** Nothing happens. Clicking Comment works.

**Cause (from code).** `src/html-review-sdk.ts:214` focuses the menu's first button when the menu opens. The SDK `keydown` handler (around line 376) returns early when `event.target` is inside `input, textarea, select, [contenteditable=true], button, a`. So the key goes to the focused Comment button and is ignored.

**Evidence.** `verification-research/fixtures/html/real-input-demo.mjs` and `real-input-demo.png`. The probe printed: selection `"Whale oil burned clean but grew scarce"`, key event trusted, focused element `BUTTON` "Comment" inside `.richie-html-ui`, dialog not open.

**Why tests missed it.** `tests/html-review.browser.spec.ts` sets the selection with `document.createRange()` and clicks the menu button; it never presses the shortcut with the menu open.

**Fix options (decide at fix time).** Do not move focus to the menu on selection menus (keep focus in the document), or let the handler accept shortcut keys when the focused button is inside `.richie-html-ui`. Check the Markdown shell for the same pattern.

**Test to add with the fix.** Inventory row HT-25: a real drag, wait for the menu, press `c`, and the dialog opens. Use `dragSelect` from the QA harness ({{QA-05}}).
<!-- END -->
