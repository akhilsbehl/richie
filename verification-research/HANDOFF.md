# Agent handoff: build Richie's verification system

You are implementing a black-box verification system for Richie. You have no context from the research session. This file and the files it links are enough. Read all of it before your first change.

## 1. What Richie is (two minutes)

Richie is a local review tool. An agent runs `richie review --json <file>` on a `.md` or `.html` file. A human reviews it in the browser and adds Comment, Replace, or Delete feedback. The agent runs `richie poll <id>` and receives either a `-commented.md` copy with `<<ASB: [rvw_NNN] …>>` markers (Markdown) or a `-commented.json` handoff (HTML). Richie never changes the source file.

- Service: `src/service.ts` (HTTP on `127.0.0.1:43173`, control socket `/run/richie/control.sock`, systemd unit `packaging/richie.service`).
- CLI: `src/cli.ts`. Shell UI: `src/client.ts`. HTML in-frame SDK: `src/html-review-sdk.ts`. Markdown render: `src/render.ts`. Export and sidecar: `src/store.ts`. Target validation: `src/html-target.ts`.
- Contracts: `README.md`, `user-guide.md`, `spec.md` (§HTML at the end), `skills/richie/SKILL.md`.
- Project rules: `AGENTS.md` (Node ≥ 22; `npm run check`, `npm test`, `npm run build`; submodule workflow).

## 2. What you are building

Read in this order:

1. [`README.md`](README.md): the design. §2 contract surfaces S1–S6. §4 layers L1–L5, the kind matrix (§4.4), real input (§4.7.1). §5 risks and owner decisions. §6 seams.
2. [`feature-inventory.md`](feature-inventory.md): every behaviour with an ID (CO-, HT-, MT-, MI-, MD-). Rows marked REMOVED, ACCEPTED GAP, or DEFERRED are out of scope.
3. [`TICKETS.md`](TICKETS.md): the tickets, in order, with dependencies and acceptance criteria. Each is also a GitHub issue on `akhilsbehl/richie`: epic #27, tickets #28–#42 in sequence order, bug B-1 is #43 (not in scope).
4. [`examples.md`](examples.md): code sketches. They are illustrations, not tested code; adapt them.
5. [`fixtures/README.md`](fixtures/README.md): the test documents and how they were checked.
6. [`skill-draft/SKILL.md`](skill-draft/SKILL.md): the operator skill you install in QA-13.

## 3. Owner decisions (final; do not reopen)

| Topic | Decision |
|---|---|
| Isolation seams `RICHIE_REVIEW_DIR`, `RICHIE_OPEN_COMMAND`, accessible names | Approved (QA-01, QA-02) |
| Unilever client deck test | Remove it and its hard-coded path. The lighthouse deck replaces it. Never read `~/warchives`. |
| HTML delete trust gap (README §5.4) | Accepted. No fix, no test. |
| HTML `c`/`r`/`d` shortcut defect | Separate bug B-1. Not in this work. Use menu buttons in HTML tests. |
| Shell search | Remove entirely (B-2). Never test search. |
| Test runner | Playwright Test for all new layers. No Jest or Vitest. |
| New dev dependencies | `fast-check` (QA-10) and `@stryker-mutator/core` (QA-12) are approved. Install nothing else without asking the owner. |

## 4. Rules that make or break this work

1. **Black box only.** Nothing under `qa/` imports from `src/`. Tests drive Richie through the CLI, HTTP API, files, and the browser. The harness starts `node dist/src/service.js` as a child process.
2. **Locators by role, label, or visible text.** No CSS classes, no `data-md-*` attributes. `#html-artifact` and `#document` are allowed as scopes only.
3. **Real input.** Select text with `dragSelect` (mouse down, move, up) and click with `locator.click()`. Never set selections with `document.createRange()` plus synthetic events. Reference: `fixtures/html/real-input-demo.mjs`.
4. **Three-way proof.** UI changed, `GET /api/state` changed, file on disk correct. Source bytes unchanged.
5. **No fixed waits, no retries.** Wait on conditions. `retries: 0`.
6. **Snapshots are approved by the owner.** You may create a new golden or baseline in a PR for review. You may never update an existing one to make a test pass without showing the diff and stating the behaviour change.
7. **Isolation.** Never touch the systemd `richie` service, `/run/richie`, or `/tmp/richie-review-jsons`. Kill only processes you started. Clean up temp roots.
8. **Do not fix product bugs inside QA tickets.** If a test exposes a defect, stop and file an issue with steps, expected, actual, and a pointer to the failing test. Mark that test `test.fail()` with the issue number in the title, and add it to `qa/quarantine.yaml` with a 14-day expiry. Then continue.
9. **Environment.** Ubuntu on WSL2. Zscaler may block `npm install`; if it does, stop and tell the owner. Do not bypass TLS.

## 5. Git workflow

- This repo is a submodule of `~/configs`. Work in a separate worktree on a named branch, never on the parent's detached pin. Suggested: `git worktree add ~/.worktrees/richie-qa -b qa/implementation master` (once `qa/verification-plan` is merged), or branch from `qa/verification-plan` if it is not merged yet.
- One branch and one PR per ticket, in sequence order. PR title `QA-NN: <title>`; body `Closes #<issue>`, plus the acceptance evidence the ticket asks for.
- Commit and push in the child repo. Updating the parent `~/configs` submodule pin is a separate commit, done by the owner or on request.

## 6. Commands you will have after QA-03

| Command | Use |
|---|---|
| `npm run qa:doctor` | Before anything else, and whenever something looks off |
| `npm run qa` | The gate. Build, typecheck, doctor, all fast layers, map check |
| `npx playwright test -c playwright.qa.config.ts --grep @HT-11` | One feature |
| `npm run qa:approve -- --grep @MT-06B` | Write snapshots for review, then print the diff |
| `npm run qa:map` | Coverage against `qa/features.yaml` |
| `npm run qa:full` | Long properties, repeat-each 3, mutation (after QA-12) |

Keep `npm test` and `npm run browser:test` green until QA-14 retires them.

## 7. Current baseline (2026-10-06, `master` at `e247e7e`)

- `npm test`: 54 pass, about 25 s including the build.
- `npm run browser:test`: 7 pass, about 14 s (one of them is the Unilever test removed in QA-01).
- Chrome at `/usr/bin/google-chrome` (154). Playwright `^1.63`.

## 8. When you finish a ticket

Report in the PR: the command run, the `summary.json` counts, new feature IDs covered, any snapshots awaiting approval, and any issue you filed under rule 8. Then start the next ticket in the sequence table.
