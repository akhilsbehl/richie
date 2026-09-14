import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RichieService } from "../src/service.js";
import { test, expect } from "@playwright/test";

let service: RichieService;
let server: Server;
const roots: string[] = [];
const port = Number(process.env.RICHIE_HTTP_PORT ?? 43174);

test.beforeAll(async () => {
  service = new RichieService();
  server = createServer((request, response) => { void service.handle(request, response).catch((error: Error) => { response.writeHead(500); response.end(error.message); }); });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; source: string; token: string; id: string }> {
  const root = await mkdtemp(join(tmpdir(), "richie-browser-html-")); roots.push(root);
  const source = join(root, "fixture.html");
  await writeFile(source, `<!doctype html><html><head><style>body{font:16px sans-serif}</style></head><body>
    <h1 id="heading">Browser fixture</h1>
    <p id="selection">A <strong>nested</strong> selection target.</p>
    <div id="cards"><article class="card"><span>Repeated one</span></article><article class="card"><span>Repeated two</span></article></div>
    <div id="diagram" class="mermaid">flowchart LR\n A[Start] --> B[Finish]</div>
  </body></html>`);
  const created = await service.createSession(source);
  const token = new URL(created.url).searchParams.get("token")!;
  return { root, source, token, id: created.id };
}
async function api(page: import("@playwright/test").Page, path: string, token: string): Promise<unknown> {
  const response = await page.request.get(`http://127.0.0.1:${port}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`);
  assert.equal(response.status(), 200);
  return response.json();
}
async function artifactFrame(page: import("@playwright/test").Page): Promise<import("playwright").Frame> {
  await page.locator("#html-artifact").waitFor();
  await expect.poll(() => page.frames().filter((frame) => frame.url().includes("/artifact/")).length).toBe(1);
  return page.frames().find((frame) => frame.url().includes("/artifact/"))!;
}

test("HTML artifact supports precise selection, element actions, Mermaid nodes, and visible resolution state", async ({ page }) => {
  const { source, token, id } = await fixture();
  await page.goto(`http://127.0.0.1:${port}/s/${id}?token=${encodeURIComponent(token)}`);
  let frame = await artifactFrame(page);
  await expect(frame.locator("#heading")).toHaveText("Browser fixture");

  await frame.evaluate(() => {
    const paragraph = document.querySelector("#selection")!;
    const range = document.createRange(); range.setStart(paragraph.firstChild!, 0); range.setEnd(paragraph.querySelector("strong")!.firstChild!, 6);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await frame.locator(".richie-html-ui button", { hasText: "Comment" }).click();
  await page.locator("#richie-dialog-input").fill("Review nested selection");
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator(".operation-card")).toContainText("html-text-range");
  let state = await api(page, `/api/state/${id}`, token) as { operations: Array<{ id: string; target?: { type: string; start?: unknown; end?: unknown } }> };
  assert.equal(state.operations.length, 1); assert.equal(state.operations[0].target?.type, "html-text-range");
  assert.ok(state.operations[0].target?.start && state.operations[0].target?.end);

  await frame.evaluate(() => { getSelection()?.removeAllRanges(); (document.querySelector("#heading") as HTMLElement).click(); });
  await frame.locator(".richie-html-ui button", { hasText: "Replace" }).click();
  await page.locator("#richie-dialog-input").fill("Updated heading");
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator(".operation-card")).toHaveCount(2);
  state = await api(page, `/api/state/${id}`, token) as typeof state;
  assert.equal(state.operations[1].target?.type, "html-element");
  await expect(frame.locator("#heading")).toHaveClass(/richie-html-kind-replace/);

  await frame.locator("#A").click();
  await frame.locator(".richie-html-ui button", { hasText: "Delete" }).click();
  await expect(page.locator(".operation-card")).toHaveCount(3);
  state = await api(page, `/api/state/${id}`, token) as typeof state;
  assert.equal(state.operations[2].target?.type, "mermaid-node");
  await expect(frame.locator("#A")).toHaveClass(/richie-html-kind-delete/);

  await frame.evaluate(() => parent.postMessage({ type: "richie-html-target", correlation: "stale", frameCapability: "stale-capability", kind: "comment", target: null }, "*"));
  await expect(page.locator(".operation-card")).toHaveCount(3);
  await frame.evaluate(() => document.querySelector("#heading")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(page.locator("#feedback-rvw_002")).toBeFocused();

  await frame.evaluate(() => { (document.querySelector("#heading") as HTMLElement).textContent = "Changed by fixture"; });
  await expect(page.locator(".html-resolution-status").filter({ hasText: "Unresolved target" })).toBeVisible({ timeout: 5_000 });
  assert.equal(await readFile(source, "utf8").then((value) => value.includes("Changed by fixture")), false);
  await page.request.post(`http://127.0.0.1:${port}/api/abort/${id}?token=${encodeURIComponent(token)}`);
});

test("the supplied Unilever acceptance fixture opens without mutating its bytes", async ({ page }) => {
  const source = "/home/akhil/warchives/unilever-dt-workshop/project/deliverables/20260912-unilever-global-dt-agentic-foundations-deck/deck.html";
  try { await access(source); } catch { test.skip(); return; }
  const before = await readFile(source);
  const created = await service.createSession(source);
  const token = new URL(created.url).searchParams.get("token")!;
  await page.goto(created.url);
  const frame = await artifactFrame(page);
  await expect(frame.locator("body")).not.toBeEmpty();
  await frame.locator("body").press("ArrowRight");
  await expect(frame.locator("body")).not.toBeEmpty();
  assert.deepEqual(await readFile(source), before);
  await page.request.post(`http://127.0.0.1:${port}/api/abort/${created.id}?token=${encodeURIComponent(token)}`);
});

test("HTML Finish and Abort are exposed through the shell without touching source bytes", async ({ page }) => {
  const finished = await fixture(); const before = await readFile(finished.source);
  await page.goto(`http://127.0.0.1:${port}/s/${finished.id}?token=${encodeURIComponent(finished.token)}`);
  await page.locator('[data-action="finish"]').click();
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator("#richie-dialog-message")).toContainText(finished.source);
  await page.locator("#richie-dialog [value=confirm]").click();
  assert.deepEqual(await readFile(finished.source), before);

  const aborted = await fixture(); const abortBefore = await readFile(aborted.source);
  await page.goto(`http://127.0.0.1:${port}/s/${aborted.id}?token=${encodeURIComponent(aborted.token)}`);
  await page.locator('[data-action="abort"]').click();
  await page.locator("#richie-dialog [value=confirm]").click();
  assert.deepEqual(await readFile(aborted.source), abortBefore);
});
