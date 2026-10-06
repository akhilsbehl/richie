---
name: richie-qa
description: Run, read, and repair Richie's automated verification suite. Use before every Richie commit, after any change under src/, when a qa command fails, or when asked to prove a Richie behaviour works.
---

# Richie QA operator

The scripts decide pass or fail. You run them, read their output, and recover from known degradations. You never decide that something works by looking at it yourself.

## 0. Ground truth

- Pass means `qa-artifacts/<latest>/summary.json` has `"failed": 0` and `"flaky": 0`, and `npm run qa:map` exits 0.
- The feature map is `qa/features.yaml`. Every user-visible behaviour has an ID there.
- Richie has two document kinds, Markdown and HTML, with one shared lifecycle. Shared tests run in the `md` and `html` Playwright projects. A shared feature is not proven until both projects pass.
- Contract surfaces: CLI, HTTP API, output files (`-commented.md`, `-commented.json`), source-byte safety, review UI by role and text, and the HTML artifact security policy (sandbox, CSP, headers, path confinement, token absence). Tests must not use CSS classes, `data-md-*` attributes, `postMessage` type names, or imports from `src/`.

## 1. Pick the command

| Change | Run |
|---|---|
| Docs only | nothing |
| `src/client.ts`, styles, page markup | `npm run qa` (both projects) |
| `src/html-review-sdk.ts` | `npm run qa -- --project=html --project=html-only`, then full `qa` before commit |
| `src/render.ts`, `src/store.ts` export code | `npm run qa -- --project=md --project=md-only`, then full `qa`, then `npx stryker run --mutate <file>` |
| `src/html-target.ts`, asset confinement, artifact injection, CSP | full `qa`, then `npx stryker run --mutate <file>` |
| `src/paths.ts`, API handler, CLI | full `qa`, then `npx stryker run --mutate <file>` |
| Dependency or Chrome update | `npm run qa:full` in its own commit |
| Before a release, or weekly | `npm run qa:full` |
| "Does feature X work?" | `npx playwright test -c playwright.qa.config.ts --grep @X` |

Always run `npm run qa:doctor` first. If doctor fails, fix the environment before anything else.

## 2. Triage a failure, in this order

1. **Environment.** Re-run doctor. Typical causes: stale `dist/` (run `npm run build`), busy port, leftover `richie-qa-*` temp dir, wrong Chrome path, the live systemd service holding the control socket. Fix and re-run. Do not touch tests.
2. **Reproduce once.** Re-run only the failed ID with trace: `--grep @ID --trace on --repeat-each=5`. For a property failure, re-run with the printed `QA_SEED`.
3. **Classify.**
   - Fails 5/5, and the diff matches a change you made on purpose → **intended change**. Go to §4.
   - Fails 5/5, and you did not intend the change → **regression**. Fix the product code. Do not edit the test.
   - Fails 1–4 of 5 → **flake**. Go to §5.
   - Fails only in a locator step, and the element still exists with the same role and name in the trace's ARIA snapshot → **locator drift**. Go to §3.
4. Record the class and one-line cause in `qa/LESSONS.md` if the cause is new.

### HTML-specific signals

| Symptom | Likely class | First check |
|---|---|---|
| Frame never reaches ready; all cards stay pending | Environment or regression | Is `/assets/html-review-sdk.js?c=<nonce>` 200 in the trace? Is `dist/public/html-review-sdk.js` built? |
| One card Unresolved after you changed a fixture | Intended | The fixture changed an anchor. Update the fixture or the scenario, with approval. |
| Card Unresolved after you changed product code only | Regression | Compare the saved target with the live DOM in the trace. Never loosen resolution to make it pass. |
| A target resolves to a different element | Severe regression | Stop. This breaks the fail-closed rule. Report before any other work. |
| Security golden diff (status, MIME, CSP, header) | Intended or regression; never self-approve | Show the diff row by row. |
| Review token found in a frame payload | Severe regression | Stop and report. |
| Passes in `md`, fails in `html` (or the reverse) for a `core` test | Regression in one adapter path | Do not mark the test kind-specific to make it pass. |

## 3. What you may repair alone

- Rebuild, free a port, delete `richie-qa-*` temp dirs you created, restart a Richie process you started.
- Locator drift: change a locator only to another role, label, or text locator that the trace shows on the same element. Never to CSS. Never to a broader match.
- Selection drift in `dragSelect` by at most the width of one character. Record it in `LESSONS.md`.
- Add a missing test for a feature ID that has none.

## 4. What needs the human (stop and ask)

- Any change to a golden file, screenshot, or ARIA snapshot. Show the diff (`git diff qa/` or `npx playwright show-report`), name the behaviour that changed, and name the commit that changed it. Wait for "approve".
- Removing, weakening, or skipping any assertion or test.
- Adding an entry to `qa/quarantine.yaml`.
- Any change to `qa/features.yaml` that removes an ID.

Never change a test and the product code it covers in the same commit, except when adding a new feature together with its first test.

## 5. Flakes

- Do not add retries. Do not add fixed waits.
- Look for the race in the trace: an assertion that ran before a network call finished, a hover timer, a Mermaid render. Replace it with a web-first assertion on the condition.
- If you cannot fix it in one attempt, ask to quarantine it with a reason and an expiry date at most 14 days out.

## 6. Adding a feature

1. Add the ID to `qa/features.yaml` with its surfaces and required layers.
2. Write the failing L1 or L3 test with `@ID` in the title.
3. Implement. Run `npm run qa`.
4. Show the human any new golden for first approval.

## 7. Report

End every QA task with: command run, `summary.json` counts, failed IDs with their class, artifacts path, and any approval waiting on the human. Keep it under ten lines.

## 8. Safety

- Never start, stop, or restart the systemd `richie` service. Never write into `/tmp/richie-review-jsons` or `/run/richie`. The suite uses its own temp root.
- Never read or copy client files. The HTML acceptance deck is `qa/corpus/html/lighthouse-deck/deck.html`.
- Never weaken the artifact CSP, sandbox, or path checks to make a test pass.
- Kill only processes you started.
