# Annotated examples

Sketches of each layer, for both document kinds. They are not tested code. Comments starting `// WHY:` explain the idea for a reader who does not write TypeScript.

## 1. Folder layout

```text
qa/
  features.yaml            # feature map: ID -> kind, surfaces, layers
  quarantine.yaml          # flaky tests: reason + expiry
  LESSONS.md               # one line per new failure class
  harness/
    richie.ts              # start/stop Richie; CLI + HTTP helpers
    adapters/markdown.ts   # open / addFeedback / readOutput for .md
    adapters/html.ts       # same three functions for .html
    select.ts              # real mouse drag selection (page or frame)
    scrub.ts               # remove timestamps, uuids, temp paths; round rects
  corpus/
    md/railway.md  md/media.md
    html/report.html  html/malformed.html  html/no-body.html  html/lighthouse-deck/  html/assets/...
    md/pairs/*.md + *-commented.md   # real past reviews, replayed
  scenarios/
    md/*.json              # operations by quote text
    html/*.json            # operations with targets captured once by a journey
  core/*.spec.ts           # shared lifecycle, runs in both projects
  contract/*.spec.ts       # L1, kind-specific
  properties/*.spec.ts     # L2
  journeys/{md,html}/*.spec.ts   # L3 + L4
  check-map.ts
  doctor.ts
playwright.qa.config.ts
```

## 2. Two projects, one adapter interface

```ts
// playwright.qa.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "qa",
  retries: 0,                                 // WHY: a retry hides a race
  use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
  projects: [
    { name: "md",   use: { kind: "markdown" } },   // core/*.spec.ts run here...
    { name: "html", use: { kind: "html" } },       // ...and again here
    { name: "md-only",   testMatch: /(contract|journeys)\/md\// },
    { name: "html-only", testMatch: /(contract|journeys)\/html\// },
  ],
});
```

```ts
// qa/harness/adapters/types.ts
// WHY: shared tests talk to this interface, so one test covers both kinds.
export interface KindAdapter {
  open(fixture: "basic" | "stale"): Promise<{ id: string; token: string; source: string }>;
  addFeedback(kind: "comment" | "replace" | "delete", text?: string): Promise<void>;
  readOutput(file: string): Promise<string>;   // scrubbed text or scrubbed JSON
}
```

```ts
// qa/core/finish.spec.ts  — runs in both "md" and "html" projects
test("@CO-06 finish with feedback writes output and leaves source untouched", async ({ page, adapter, richie }) => {
  const { id, source } = await adapter.open("basic");
  const before = await readFile(source);
  await adapter.addFeedback("comment", "Tighten this.");
  await page.getByRole("button", { name: "Finish review" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  const outcome = JSON.parse(await richie.poll(id));
  expect(outcome.status).toBe("finished");
  expect(await adapter.readOutput(outcome.file)).toMatchSnapshot(`CO-06.${test.info().project.name}.txt`);
  expect(await readFile(source)).toEqual(before);
});
```

## 3. Harness: Richie as a black box

```ts
// qa/harness/richie.ts
const START = ["node", "dist/src/service.js"];   // WHY: the only line a rewrite may change

export async function startRichie(port: number) {
  const root = await mkdtemp(join(tmpdir(), "richie-qa-"));
  const env = { ...process.env,
    RICHIE_HTTP_PORT: String(port),
    RICHIE_CONTROL_SOCKET: join(root, "control.sock"),
    RICHIE_REVIEW_DIR: join(root, "reviews"),     // seam 1
    RICHIE_OPEN_COMMAND: "true" };                // seam 2
  const child = spawn(START[0], START.slice(1), { env, stdio: "pipe" });
  await waitForStatus(env.RICHIE_CONTROL_SOCKET); // short backoff, 10 s cap
  return { root, env, review, poll, api, copyFixture, stop: () => child.kill("SIGTERM") };
}
```

## 4. Real selection, page or frame

```ts
// qa/harness/select.ts
// WHY: drag like a person. Works for the Markdown document and for text inside
// the HTML iframe, because boundingBox() returns page coordinates in both cases.
export async function dragSelect(page: Page, scope: Locator, from: string, to: string) {
  const start = await charBox(scope, from, "first");
  const end = await charBox(scope, to, "last");
  await page.mouse.move(start.x + 1, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width - 1, end.y + end.height / 2, { steps: 8 });
  await page.mouse.up();
}
```

## 5. HTML L1: security matrix golden

```ts
// qa/contract/html/artifact-security.spec.ts
const probes = [
  "index.html?n=WRONG", "assets/style.css", "assets/pixel.png", "assets/missing.css", "assets/",
  "../secret.txt", "%2e%2e/secret.txt", "..%2fsecret.txt", "assets\\style.css", "assets/%00.css",
  "/etc/passwd", "assets/file.exe", "assets/link-outside.css", "assets/icon.svg",
];

test("@HT-03 @HT-04 @HT-05 artifact responses", async ({ richie }) => {
  const { id, nonce } = await openHtml(richie, "report.html");
  const rows = [];
  for (const path of probes) {
    const res = await fetch(`http://127.0.0.1:${richie.port}/artifact/${id}/${path.replace("WRONG", "x")}`);
    rows.push([path, res.status, res.headers.get("content-type"), res.headers.get("cache-control"),
               res.headers.get("x-content-type-options"), res.headers.get("content-security-policy")].join(" | "));
  }
  rows.push(["POST index.html", (await fetch(artifactUrl(id, nonce), { method: "POST" })).status].join(" | "));
  // WHY: one readable table in Git. Any change to status, MIME, or CSP shows as a diff.
  expect(rows.join("\n")).toMatchSnapshot("artifact-security.txt");
});

test("@HT-07 review token never reaches the frame", async ({ page, richie }) => {
  const { token, url } = await openHtml(richie, "report.html");
  const seen: string[] = [];
  await page.exposeFunction("__qaRecord", (s: string) => seen.push(s));
  // Record every message the frame receives and every message the shell receives.
  await page.addInitScript(() => addEventListener("message", (e) => (window as any).__qaRecord?.(JSON.stringify(e.data)), true));
  await page.goto(url);
  await createOneOfEachTarget(page);
  const frameHtml = await (await fetch(frameIndexUrl(page))).text();
  expect([frameHtml, ...seen].filter((s) => s.includes(token))).toEqual([]);
});
```

## 6. HTML L2: fail-closed resolution

```ts
// qa/properties/html-resolution.spec.ts
// WHY: generate small random pages, save a target, change the page once,
// and check Richie never "finds" a different element.
const page$ = fc.array(fc.record({ tag: fc.constantFrom("p", "section", "article", "h2", "li"),
                                   text: fc.lorem({ maxCount: 4 }), id: fc.option(fc.stringMatching(/^[a-z]{3,6}$/)) }),
                       { minLength: 3, maxLength: 12 });
const mutation$ = fc.constantFrom("retag", "retext", "swap-siblings", "duplicate-id", "wrap");

test("@HT-16 P6 any changed anchor is unresolved, never misresolved", async ({ page, richie }) => {
  await fc.assert(fc.asyncProperty(page$, fc.nat(), mutation$, async (blocks, pick, mutation) => {
    const { url, id, token } = await openGenerated(richie, blocks);
    await page.goto(url);
    const frame = page.frameLocator("#html-artifact");
    const chosen = frame.locator("body > *").nth(pick % blocks.length);
    await saveElementComment(page, chosen);                      // through the real SDK menu
    const before = await targetIdentity(page, id, token);        // selector, path, tag, text
    await mutateFrameDom(frame, mutation, pick);                 // change the live DOM once, in-frame
    const outcome = await jumpAndObserve(page);                  // "resolved:<path>" or "unresolved"
    expect(outcome === "unresolved" || outcome === `resolved:${before.path}`).toBe(true);
  }), { numRuns: Number(process.env.QA_RUNS ?? 50) });
});
```

## 7. HTML L3: journey through the iframe

```ts
// qa/journeys/html/text-range.spec.ts
test("@HT-11 text range across nested inline by real drag", async ({ page, richie }) => {
  const { id, token } = await openHtmlPage(page, richie, "report.html");
  const frame = page.frameLocator("#html-artifact");
  await expect(frame.getByRole("heading", { name: "HTML review fixture" })).toBeVisible();

  await dragSelect(page, frame.locator("#nested-inline"), "Select", "inline");
  await page.keyboard.press("c");
  await page.getByRole("dialog").getByRole("textbox").fill("Review nested selection");
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();

  // 1. UI: one card, resolved, shows the target kind
  await expect(page.getByText("1 open")).toBeVisible();
  await expect(page.getByRole("complementary")).toContainText("html-text-range");
  // 2. State
  const state = await getState(page, id, token);
  expect(state.operations[0].target).toMatchObject({ type: "html-text-range", exactText: "Select nested inline" });
  // 3. Save the captured target as an L1 replay scenario (first run only, human approves)
  await saveScenario("html/HT-11.json", state.operations[0]);
});

test("@HT-22 artifact script cannot add feedback silently", async ({ page, richie }) => {
  // Fixture script listens for the shell's messages, copies challenge + capability,
  // then posts a forged delete target. Expected today (hypothesis): 1 operation appears.
  const { id, token } = await openHtmlPage(page, richie, "forger.html");
  await expect(page.frameLocator("#html-artifact").getByText("forger: posted")).toBeVisible(); // fixture reports it acted
  await expect.poll(async () => (await getState(page, id, token)).operations.length).toBe(0);
});
```

## 8. Markdown L1 golden and L2 marker invariant

Scenario, readable without code:

```json
{ "id": "MT-06B", "source": "railway.md", "operations": [
  { "kind": "replace", "quote": "well-timed decisions", "replacement": "timely judgement" },
  { "kind": "comment", "scope": "document", "placement": "start", "comment": "Tighten the summary." } ] }
```

```ts
// qa/properties/md-markers.spec.ts
test("@MT-20 P3 removing markers restores the source", async () => {
  await fc.assert(fc.asyncProperty(markdown$, fc.string(), async (source, comment) => {
    const output = await reviewAndFinish(source, comment);   // random range, real API
    expect(stripMarkers(output)).toBe(source);
  }), { numRuns: Number(process.env.QA_RUNS ?? 100) });
});
```

On failure fast-check prints the smallest input and a seed. Re-run with `QA_SEED=<seed>`.

## 9. Feature map entry and summary

```yaml
- id: CO-10
  title: Stale source blocks writes
  kind: both            # check-map fails unless md AND html projects have an @CO-10 test
  layers: [L1, L3, L4]
- id: HT-22
  title: Artifact script cannot add feedback silently
  kind: html
  layers: [L3]
```

```json
{ "command": "qa", "durationSec": 201,
  "projects": { "md": { "passed": 64, "failed": 0 }, "html": { "passed": 71, "failed": 1 } },
  "failedIds": ["HT-15"], "flaky": 0, "approvalCandidates": [], "doctor": "ok",
  "artifacts": "qa-artifacts/2026-10-06T10-12-00/" }
```
