# Richie verification system: research and recommendation

Status: research only. No source, test, or config file was changed. This folder is not committed.

Companion files:

- [`feature-inventory.md`](feature-inventory.md): every user-visible behaviour for both document kinds, where it is tested today, and where it should be tested.
- [`examples.md`](examples.md): annotated code sketches for each layer, for Markdown and HTML.
- [`skill-draft/SKILL.md`](skill-draft/SKILL.md): draft of the `richie-qa` agent skill.

## 1. Executive summary

Richie reviews two document kinds through one service, one CLI, one shell UI, and one session lifecycle:

- **Markdown**: rendered with source ranges; output is `<name>-commented.md` with `<<ASB: …>>` markers.
- **HTML**: an immutable snapshot in a sandboxed, opaque-origin iframe; a dependency-free SDK in the frame captures DOM target evidence and talks to the shell by `postMessage`; output is `<name>-commented.json`.

**Finding.** The suite is green (54 Node tests, 7 Playwright tests, about 40 s) but does not protect a rewrite of either path.

| Problem | Markdown path | HTML path |
|---|---|---|
| Browser coverage | 1 smoke test | 6 tests, good scenarios, but the harness imports `RichieService` in-process and sets selections with `document.createRange()` instead of real mouse input |
| Implementation coupling | Most of the 137 regex assertions: shell CSS, page strings, client bundle text | `html-review.test.ts` (4) plus SDK bundle-string checks in `client-bundle.test.ts` (`/frameCapability/`, `/mermaid-node/`) |
| Manual-only behaviour | Most of `manual-test-plan-v01.md` (August 2026, first prototype) | Most of `manual-html-test-plan-v00.md` (September 2026, current): security matrix, CSP, token absence, decorations, Jump retry, keyboard-only use |
| Hidden dependencies | `/tmp/richie-review-jsons` shared with the live service | Same, plus a client deck at a fixed path under `~/warchives` |

**Recommendation.** One black-box verification system with a **shared core** run for both kinds, and a **kind-specific contract** for each. It talks to Richie only through what a user or agent touches: CLI, HTTP API, files on disk, and the rendered page (shell and artifact frame) by role and visible text. Any implementation must pass the same suite.

| Layer | Shared core (run twice: md and html) | Markdown-specific | HTML-specific |
|---|---|---|---|
| L1 Contract goldens | CLI JSON, poll outcomes, status codes, Finish/Abort/no-open, stale `409`, Reload | `-commented.md` text | `-commented.json` envelope and targets; artifact security matrix (paths, MIME, headers, CSP); token absence |
| L2 Invariants | Source bytes never change; API never returns 5xx | Removing markers gives back the source | Captured target resolves to the same node; any changed anchor gives Unresolved, never a different node; path fuzzing never escapes the root |
| L3 User journeys | Finish, Abort, stale banner, feedback cards, keyboard-only, 390 px | Range ops, tables, code, Mermaid source, math, images | Real drag across iframe text, element and Mermaid-node targets, decorations, Jump, Unresolved, blocked capabilities, frame reload |
| L4 Visual | Shell layout | Rendered document | Decorations, blue outline, Unresolved card |
| L5 Mutation | API handler, `paths.ts` | `store.ts` export, `render.ts` | `html-target.ts`, asset confinement, artifact injection |

A project-local `richie-qa` skill tells an agent which command to run, how to classify a failure, and what it may change to recover. The scripts decide pass or fail. The skill does not.

**Status of decisions (2026-10-06).** All decided. The three code seams (§6) are approved. The HTML delete trust gap (§5.4) is accepted; no fix, no test. The `c`/`r`/`d` shortcut defect (§4.7.1) is deferred to its own bug ticket; the owner will check it by hand first. Shell search will be removed entirely (owner will use browser search); the suite must not test search.

**Two findings from real-input probing (section 4.7.1).** I drove the new lighthouse deck with Playwright's real mouse and keyboard. A drag across `<strong>`/`<em>` produced the exact selection. But in HTML review the `c`/`r`/`d` shortcuts do nothing once the in-frame menu is open: the menu moves focus to its own Comment button, and the SDK ignores shortcut keys on buttons. The current tests cannot see this because they set the selection by script and click the menu.

## 2. Contract surfaces

These survive any rewrite. The suite tests only these.

| # | Surface | Markdown | HTML | Evidence |
|---|---|---|---|---|
| S1 | CLI | `review --json` → `{id,url}`; `poll` → `finished`+file or `aborted`; SIGINT exits 130, session survives | Identical | `src/cli.ts`, `skills/richie/SKILL.md` |
| S2 | HTTP API | `state`, `operations` (POST/PATCH/DELETE), `finish`, `abort`, `reload`; `range` payloads; `media` route | Same routes; `target` payloads; `/artifact/:id/index.html?n=`, `/artifact/:id/<asset>`, SDK asset gated by nonce | `src/service.ts` 377–548 |
| S3 | Output files | `-commented.md`, then `-commented-2.md` | Exactly one `-commented.json`, atomic (temp + rename), `0600` | `src/store.ts`, `src/service.ts` 516–533 |
| S4 | Source safety | Bytes unchanged; sidecar removed on finish/abort | Same; plus the shell keeps showing the captured snapshot when disk bytes change | spec §6, spec §HTML |
| S5 | Review UI | Shell + rendered Markdown | Shell + sandboxed iframe + in-frame menu and decorations | user guide, both manual plans |
| S6 | Artifact security policy | n/a | Sandbox `allow-scripts` only; CSP with `default-src 'none'`, `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`, `navigate-to 'none'`; `no-store`; `nosniff`; review token never in frame, SDK URL, or messages | `src/service.ts` 239–243, 396–411 |

Not contracts: CSS class names (`richie-html-kind-replace`, `.operation-card`), `data-md-range` attributes, the `postMessage` type names, module names, bundle contents. The shell and the SDK both live inside Richie, so a rewrite may change the message protocol freely. Its **security properties** are the contract (S6), not its message format.

## 3. Current state, measured

Measured on 2026-10-06 at `e247e7e`.

| Metric | Value |
|---|---|
| Node tests | 54 pass, 1.5 s, 25 s with build |
| Playwright tests | 7 pass, 12.5 s: 6 HTML, 1 Markdown |
| Regex-on-source assertions | 137 total: `service.test.ts` 50, `render.test.ts` 49, `client-bundle.test.ts` 34 (including SDK bundle checks), `html-review.test.ts` 4 |
| Test files that import internals | 13 of 14, including the Playwright spec |
| HTML manual checks with no automation | Security matrix (percent-encoded `..`, backslash, NUL, unknown extension, symlink swap during request), exact MIME and headers, CSP capture, token search in messages, decoration distinctness, Jump retry and timeout, keyboard Tab/Enter/Escape at 1440×900 |
| Markdown manual cases with no automation | MT-02 to MT-21 (search buttons, hover timing, tables, code, Mermaid source ops, dialogs, math) |
| Recent history | The last 15 commits are almost all HTML fixes: hover handoff, annotation sync after frame load, message delivery, selector and tag resolution, cursor alignment, viewport height. These are the regressions the HTML journeys must lock down. |

The HTML Playwright spec has the right scenarios. It needs a black-box harness, real input, and the manual-plan security checks. The Markdown path needs its journeys written.

## 4. Architecture

### 4.1 Principle

Test what a user or agent can observe, not how the code produces it. Playwright states this directly: avoid "the name of a function, whether something is an array, or the CSS class of some element" ([Playwright best practices](https://playwright.dev/docs/best-practices)). Characterization tests apply the same idea to existing code: record what the system does now; any change is a signal for a human to judge ([Wikipedia: Characterization test](https://en.wikipedia.org/wiki/Characterization_test)).

### 4.2 One runner

Playwright Test for L1 to L4. It already runs your HTML browser tests, it runs non-browser tests, and it has text and image snapshots, `--update-snapshots`, traces, and an HTML report ([Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)). It also drives iframes natively with `frameLocator`, which the HTML path needs ([Playwright frames](https://playwright.dev/docs/frames)). One command and one report is worth more to a non-JS maintainer than any single feature. Keep `node:test` only for pure unit tests until retired.

### 4.3 Black-box harness

The harness starts Richie as a separate process, as systemd does, with every path redirected into a temp root:

```text
node dist/src/service.js
  RICHIE_HTTP_PORT=<free port>
  RICHIE_CONTROL_SOCKET=<tmp>/control.sock
  RICHIE_REVIEW_DIR=<tmp>/reviews        # seam, §6
  RICHIE_OPEN_COMMAND=true               # seam, §6
```

It never imports `src/`. After a rewrite only the start command may change.

### 4.4 The kind matrix

Most lifecycle behaviour is identical for both kinds. Write those tests once and run them as two Playwright projects, `md` and `html`. Each project supplies one adapter with three functions:

| Adapter function | Markdown | HTML |
|---|---|---|
| `open(fixture)` | Copy `.md`, `review --json`, go to url | Copy `.html` + `assets/`, `review --json`, go to url, wait for frame ready |
| `addFeedback(kind, quoteOrTarget, text)` | Drag-select in `#document`, press key, confirm dialog | Drag-select inside the frame, or click an element, press key or use in-frame menu, confirm dialog |
| `readOutput(file)` | Text, scrubbed | JSON, scrubbed (`createdAt`, `rect` rounded to integers) |

Shared tests on top of the adapter: Finish with feedback, Finish with none, Abort, double Finish is idempotent, poll resume after SIGINT, tab close is not terminal, browser reload keeps the session, stale source blocks writes with `409` and keeps the sidecar, confirmed Reload clears operations and keeps the session id, feedback card edit and remove, open count, keyboard-only Finish and Abort.

This prevents the drift that produced this report's first draft: one kind gets deep tests, the other gets an appendix.

### 4.5 L1 Contract goldens

A corpus of inputs plus scripted operation lists. The harness posts operations through the API, finishes, and compares the output with an approved file in Git.

- **Markdown corpus**: fixture sections from `manual-test-plan-v01.md` and `manual-media-test-plan-v00.md`. Scenarios name ranges by quote text; the harness computes offsets.
- **Markdown real pairs (replay oracle)**: nine original and `-commented.md` pairs from `~/.richie/ephemeral/` (`fixtures/markdown/pairs/`). All nine strip back to the original byte for byte, so each is a valid golden. The harness parses the markers, recovers each operation's range, replays it through the API on the original, and requires the new output to equal the stored one. Real data has 0 replace, code, Mermaid, math, media, row or column operations, so synthetic scenarios cover those. See `fixtures/README.md`.
- **HTML corpus**: `tests/fixtures/html-review/` (report, malformed, no-body, assets) plus the new **lighthouse deck** (`fixtures/html/lighthouse-deck/`), made with the html-deck skill. It has script-driven slides, arrow keys, local fonts, a PNG, a table, repeated cards, Mermaid and nested inline text. It replaces the Unilever deck; that test and its hard-coded path are removed, not made optional. HTML targets are not hand-written. The L3 journey captures them once through the real SDK and saves them as scenario inputs. L1 then replays them through the API. This keeps L1 fast and the targets real.
- **HTML security matrix** (golden table of request → status, headers): wrong token, wrong host, wrong session, wrong `n` nonce, non-GET artifact request, missing file, directory, `../`, `%2e%2e/`, `..%2f`, backslash, NUL, absolute path, unknown extension, outside-root symlink, `.svg` asset. Valid assets: exact `content-type`, `cache-control: no-store`, `x-content-type-options: nosniff`, and the exact CSP string.
- **Token absence**: grep the artifact HTML, the SDK URL, and every captured `postMessage` payload for the review token. Count must be zero.
- **Scrubbing**: replace timestamps, UUIDs, temp paths; round `rect` numbers. A printer that scrubs volatile data is what makes approval tests usable ([Understand Legacy Code: approval tests](https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/)).

### 4.6 L2 Invariants

`fast-check` generates random inputs, runs many cases, and shrinks a failure to the smallest example with a reproducible seed ([fast-check](https://fast-check.dev/docs/introduction/what-is-property-based-testing/)).

| ID | Kind | Property |
|---|---|---|
| P1 | both | For any document and any valid operation set, source bytes after Finish equal bytes before |
| P2 | both | Any random JSON body to any API route returns 2xx or 4xx, never 5xx; a 4xx never changes `GET /api/state` |
| P3 | md | Removing every inserted `<<ASB: …>>` marker from `-commented.md` gives back the source exactly (`renderCommentedMarkdown` only inserts) |
| P4 | md | Every fenced block stays balanced in the output |
| P5 | html | **Round trip.** For a random generated DOM and a random element or text range, capturing a target and resolving it in a fresh load returns the same node or range |
| P6 | html | **Fail closed.** After any single mutation (change tag, text, sibling order, duplicate an id, insert a wrapper), resolution returns either the same node or Unresolved, never a different node |
| P7 | html | **Confinement.** Random relative paths (mixing `..`, `%2e`, `%2f`, `\`, NUL, Unicode dots, symlinks) never serve a file outside the source directory |
| P8 | html | `parseHtmlTarget` accepts every target the SDK emits and rejects every target over its bounds (`HTML_LIMITS`: selector depth 16, text 2048, path depth 64) |

P5 and P6 run in the browser: the property generates an HTML fixture, the test opens it through the harness, and the target capture and resolution happen through the real SDK. Use about 50 runs in `qa` and 1 000 in `qa:full`.

Hypothesis, not a known bug: a Markdown comment that contains `>>` may make a marker ambiguous for the agent reading `-commented.md`. P3 will find it if it exists.

### 4.7 L3 User journeys

One spec per feature area. Each test title carries its feature ID (`@HT-04`, `@MT-06B`).

Rules for both kinds:

- Locate by role, label, and text: `page.getByRole("button", { name: "Finish review" })` ([Playwright best practices](https://playwright.dev/docs/best-practices)).
- Select text with real mouse drags. Compute start and end points from `locator.boundingBox()`, then `page.mouse.down/move/up`. Inside the iframe the coordinates are page coordinates, so the same helper works. The current HTML spec calls `document.createRange()` and dispatches a synthetic `mouseup`. That skips the real input path where recent fixes lived.
- Prove each action three ways: UI changed, `GET /api/state` changed, output file correct after Finish. The Cursor verification skill sets the same standard: capture the action, the resulting state, and side effects ([cursor/plugins create-verification-skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md)).
- Use ARIA snapshots for structure: shell sidebars, feedback list, Unresolved status ([Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots)).
- Block all network except `127.0.0.1`. Serve "remote" image fixtures from a local route.

HTML-specific journeys (the important ones):

| Journey | Assertion |
|---|---|
| Frame readiness | Shell reaches "all resolved" for pre-existing operations after load and after a frame reload; no operation stays "pending" past the 3.5 s sync timeout |
| Text range across `strong`/`em` | Real drag; card shows `html-text-range`; only the exact range is highlighted |
| Repeated siblings | Click second card; saved selector is unique; Jump decorates only that sibling |
| Mermaid node | Node operation stores diagram id, node id, label; source fallback stays selectable |
| Unresolved | Mutate the fixture's DOM by script after load (tag, text, path, duplicate selector): card says **Unresolved target** with role `status`; no highlight, no scroll |
| Decorations | Comment, replace, and delete decorations differ by more than color (outline style or label) |
| Blocked capabilities | Submit form, `window.open`, `location =`, nested iframe, `fetch`, `new Worker`, download link: each is blocked; capture `securitypolicyviolation` events and the page's request log; shell URL never changes |
| Stale and Reload | Change disk bytes: banner shows, ops and Finish give `409`; confirmed Reload rotates the artifact nonce; requests with the old `n` return 404 |
| Keyboard only | Tab/Enter/Escape through menu, cards, dialogs, Finish, Abort at 1440×900 and 390×844 |
| Deck acceptance | Lighthouse deck: slide controls and arrow keys work in the frame; hash and size unchanged after Abort and after Finish |
| Keyboard shortcut after menu opens | Not in this plan. Tracked as a separate bug ticket; write the test when that bug is fixed |

#### 4.7.1 How real clicks, drags, and selections are simulated

Playwright provides this. Nothing else is needed.

- `page.mouse.move/down/up`, `locator.click()`, `locator.hover()`, `page.keyboard.press/type` send input through Chrome's own input pipeline (the DevTools protocol's input commands), not through JavaScript. The page receives the same event sequence a physical mouse produces (`pointerdown`, `mousedown`, `selectionchange`, `mouseup`, `click`), and every event has `isTrusted === true`. Page code cannot tell it apart from a human.
- A text selection is a press, a move across characters, and a release. The harness asks the browser for the screen position of the first and last character (`Range.getBoundingClientRect()`), then drags between them in 8–10 steps. Inside the HTML iframe the same helper works after adding the frame's offset.
- Demonstrated on 2026-10-06 (`fixtures/html/real-input-demo.mjs`): a drag from "Whale" to "scarce" across `<strong>` and `<em>` on slide 4 gave the exact selection `Whale oil burned clean but grew scarce`. The key event was trusted. The in-frame menu click opened "Add comment" with the right quote (screenshot `real-input-demo.png`).
- The same run found the shortcut defect above. `src/html-review-sdk.ts:214` focuses the first menu button; the SDK `keydown` handler returns early when focus is in a button. Reproduced in headless Chrome 154. Check it once in your normal browser before treating it as a bug.

What Playwright input does not cover:

| Gap | Mitigation |
|---|---|
| OS-level behaviour: WSLg window focus, native right-click menu, OS drag thresholds | 5-minute manual smoke per release (§5.5) |
| System clipboard in headless mode | Grant `clipboard-read`/`clipboard-write` permissions in the test context and read with `navigator.clipboard`; or check the copy button's success state |
| Pixel-exact selection edges with ligatures or wrapped lines | Assert on the saved quote text, not on coordinates |
| Hover timing (220 ms delay) | Playwright's clock API controls timers deterministically |

### 4.8 L4 Visual baselines

Eight to twelve screenshots: Markdown page, Markdown hover menu, Markdown replacement preview, HTML page with all three decoration kinds, HTML element menu with the blue outline, Unresolved card, stale banner, HTML at 390 px. Baselines are valid only on the machine that made them; Playwright notes that rendering varies by OS, browser version, and hardware ([Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)).

### 4.9 L5 Mutation testing

StrykerJS mutates code and checks that some test fails; it supports Node projects through a command runner with a `buildCommand` ([StrykerJS Node guide](https://stryker-mutator.io/docs/stryker-js/guides/nodejs/)). Targets: `store.ts`, `render.ts`, `paths.ts`, `html-target.ts`, the asset-confinement and artifact-injection functions in `service.ts`. Goal: 80 % or more before the rewrite. Do not gate on line coverage; it shows what ran, not what was checked.

The SDK (`html-review-sdk.ts`) runs only inside the browser. Stryker can mutate it only through the browser suite, which is slow. Run that once before the rewrite as a one-off audit, not weekly.

### 4.10 Feature map and commands

`qa/features.yaml` lists every ID in `feature-inventory.md` with its kind (`md`, `html`, `both`), surfaces, and required layers. `qa/check-map.ts` fails when a feature has no `@ID` test, a test has an unknown ID, a required layer is missing, or a `both` feature lacks either project. The Cursor skill uses the same idea: "a proof that drives one convenient entry point is incomplete when the map lists others" ([cursor/plugins create-verification-skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md)). When every manual case has a green test, retire both manual plans.

| Command | Contents | Target time |
|---|---|---|
| `npm run qa:doctor` | Node ≥ 22, Chrome path, free port, `dist` newer than `src`, no leftover temp roots, live service untouched | < 5 s |
| `npm run qa` | L0 + L1 + L2 (low runs) + L3 both projects + L4 + map check | < 4 min |
| `npm run qa:full` | `qa` + L2 high runs + L3 `--repeat-each=3` + L5 + external fixtures if set | < 60 min |
| `npm run qa:approve -- <id>` | Update one golden or screenshot, then print the diff | — |

Every run writes `qa-artifacts/<timestamp>/summary.json` (counts by project, failed IDs, flaky IDs), the HTML report, and traces. The skill reads `summary.json`.

### 4.11 Flake policy

Google reported that about 84 % of pass-to-fail transitions in its CI involved a flaky test, and that legitimate failures get ignored as a result ([Google Testing Blog](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)). The HTML path has real timing surfaces: frame load, handshake retries every 250 ms, annotation sync up to 3.5 s, Mermaid rendering. Rules:

- `retries: 0` in `qa`.
- No fixed waits. Wait on a condition: a card's status text, a decoration's presence, the shell's open count.
- `qa:full` repeats journeys three times. Pass-and-fail on the same code is flaky. Quarantine with reason and an expiry of 14 days at most; the map check fails after expiry.

## 5. Blind spots and risks

### 5.1 Visual baselines are local

They are tied to your WSL Chrome. Stay local: the remote has no CI workflow, and Zscaler makes container pulls unreliable.

### 5.2 Goldens freeze bugs too

A characterization test records current behaviour, defects included ([Wikipedia: Characterization test](https://en.wikipedia.org/wiki/Characterization_test)). File what you dislike during first approval. Do not approve it silently.

### 5.3 Agent self-approval

This is the main way the system decays. The hard limits in the skill block it. Audit `git log -- qa/` monthly.

### 5.4 The delete gap: artifact scripts can add a delete silently (ACCEPTED 2026-10-06, no action)

In plain terms: the HTML you review can contain its own JavaScript, and Richie lets it run so decks and interactive reports work. That JavaScript runs in the same frame as Richie's review script, so it can see the messages the shell sends into that frame. With what it sees, it can pretend to be Richie and say "the reviewer chose Delete on this element". For Comment and Replace, the shell still opens a dialog, so nothing is saved unless you type and confirm. For Delete there is no dialog, so the shell saves a delete operation straight away. You would see an extra card you did not create, and it would go into `-commented.json` on Finish.

Technical detail: the SDK and the artifact's own scripts run in the same window. The shell sends the handshake challenge and the operations message, which carries the frame capability, into that window by `postMessage`. Any artifact script can add its own `message` listener, read both values, and post a `richie-html-target` message that the shell accepts. For `comment` and `replace` the shell opens a dialog, so a human still confirms. For `delete` the shell posts the operation with no dialog (`src/client.ts`, the `richie-html-target` branch).

- What the capability protects against today: messages from a previous frame generation. That is tested.
- What it does not appear to protect against: a script inside the current artifact. Most artifacts you review are your own or agent-generated, so the practical risk is low. It is still a silent write path.
- Decision: accepted by the owner. Do not add a fix. Do not add test HT-22. Do not treat this as a regression if a future change happens to close it.

### 5.5 Selection fidelity

(See §4.7.1 for how real input works and what it does not cover.)

Headless Chromium drags are close to, but not identical to, WSLg Chrome. Keep a 5-minute manual smoke per release (one Markdown range op, one HTML range op, one HTML element op) until L3 has run 4 weeks with no escapes.

### 5.6 Dependency upgrades

Mermaid and KaTeX change rendered output. Pin them. Upgrade each in its own commit with L4 approval.

### 5.7 Effort (speculative)

Seams and harness: 1 day. Shared core plus HTML L1/L3: 2 to 3 days. Markdown L1/L3: 2 to 3 days. Properties: 1 to 2 days. Mutation pass: 1 day. This assumes no large bugs surface.

## 6. Required code seams (approved 2026-10-06)

| Seam | Change | Without it |
|---|---|---|
| `RICHIE_REVIEW_DIR` | Read sidecar directory from env, default unchanged | Tests write into the live service's sidecar directory |
| `RICHIE_OPEN_COMMAND` | Read the open command from env, default `xdg-open`; `true` disables it | Every CLI test opens a Windows browser tab |
| Accessible names | `aria-label` on icon-only shell buttons and in-frame menu buttons; accessible name on the dialog; `data-testid` only where no role and name exists | Locators fall back to CSS, which the rewrite breaks |

Also remove the Unilever deck test and its hard-coded path. The lighthouse deck (§4.5) replaces it. Drop the `RICHIE_EXTERNAL_FIXTURES` option from §4.7 and the inventory.

## 7. The agent skill

Draft: [`skill-draft/SKILL.md`](skill-draft/SKILL.md). It provides routing (which command for which change), fixed triage order, bounded self-repair, and a lessons file. It includes HTML-specific triage: frame never ready, a target stuck pending, Unresolved after a fixture change (expected) versus after a code change (regression).

Hard limits: it never edits a golden, screenshot, or ARIA snapshot without showing you the diff and naming the behaviour that changed. It never weakens or skips a test without a quarantine entry. It never reports pass from its own reading of a page.

## 8. Rollout

| Step | Work | Exit criterion |
|---|---|---|
| 1 | Seams; `qa:doctor`; black-box harness; kind matrix with both adapters | Live service and test run share no files |
| 2 | Shared core lifecycle tests on both projects | Green on `md` and `html` |
| 3 | Port the 6 HTML Playwright tests to the harness with real input; add HTML security matrix and token absence (L1) | Every check in `manual-html-test-plan-v00.md` maps to a test |
| 4 | Markdown L1 goldens and L3 journeys | Every MT and MI case maps to a test |
| 5 | P1 to P8 | High-run pass, or each counterexample filed as a bug or accepted |
| 6 | L4 baselines | Three consecutive runs with zero pixel diff |
| 7 | Stryker on the core files, then the one-off SDK audit | ≥ 80 % on core files; each survivor has a test or a written reason |
| 8 | Install the skill; `pre-push` hook runs `qa` | Agent dry run: one deliberate break per kind is found and classified correctly |
| 9 | Mark the 137 regex assertions and in-process tests `legacy`; delete each when a black-box test covers it | `npm test` holds only black-box or pure-unit tests |

HTML goes before Markdown in this order. It is the active development area, and its existing scenarios give a fast start.

## 9. How you maintain the loop

**Every change:** the agent runs `npm run qa`; the `pre-push` hook runs it again. If a golden or screenshot changed, the agent shows you the diff (`git diff qa/`, or `npx playwright show-report` for images). You answer "intended" or "regression". That is the only human gate.

**Weekly or before release:** run `npm run qa:full`. In `summary.json`, flaky count and expired quarantines must be zero, and mutation score must not drop.

**Bug found by hand:** the agent writes the failing test first, with a feature ID and kind. Then it fixes.

**New feature:** add it to `features.yaml` first, with its kind. The map check fails until both required projects have a test.

**Chrome or Playwright update:** expect L4 diffs. Approve them in a dedicated commit with no code change.

## 10. Next action

Implementation is ticketed. Start with [`HANDOFF.md`](HANDOFF.md), then work [`TICKETS.md`](TICKETS.md) in order.

## Sources

| Source | Used for |
|---|---|
| [Playwright: Best practices](https://playwright.dev/docs/best-practices) | User-visible testing, role locators, web-first assertions, isolation |
| [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots) | Text and image snapshots, environment sensitivity |
| [Playwright: ARIA snapshots](https://playwright.dev/docs/aria-snapshots) | Structure checks independent of CSS |
| [Playwright: Frames](https://playwright.dev/docs/frames) | Driving the HTML artifact iframe |
| [Wikipedia: Characterization test](https://en.wikipedia.org/wiki/Characterization_test) | Golden master method and its limits |
| [Understand Legacy Code: approval tests](https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/) | Scrubbing printer, snapshot misuse |
| [fast-check](https://fast-check.dev/docs/introduction/what-is-property-based-testing/) | Generated inputs, shrinking, seeds |
| [StrykerJS: Node guide](https://stryker-mutator.io/docs/stryker-js/guides/nodejs/) | Mutation testing with a build command |
| [Google Testing Blog: Flaky tests](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) | Flake cost and quarantine trade-offs |
| [cursor/plugins: create-verification-skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md) | Doctor, feature map, evidence standard |

## Revision log

- 2026-10-06 v1: First version, Markdown-weighted.
- 2026-10-06 v4: Decisions recorded (gap accepted; shortcut bug and search removal ticketed separately). Added `HANDOFF.md` and `TICKETS.md`.
- 2026-10-06 v3: Seams approved. Added real Markdown pairs from `~/.richie/ephemeral/` with a replay oracle, the lighthouse deck fixture (replaces the Unilever deck), §4.7.1 on real input with a working demo, the HTML shortcut defect found by it, a plain explanation of the delete gap, and inventory provenance (see `feature-inventory.md`).
- 2026-10-06 v2: Rebuilt around both document kinds. Added the shared-core kind matrix, the HTML contract surface (S6 security policy), the HTML security golden and token-absence checks, HTML properties P5–P8, HTML journeys, the deck-like fixture, and the frame-trust hypothesis (§5.4). Reordered the rollout so HTML goes first.
