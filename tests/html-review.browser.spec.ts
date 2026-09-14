import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlCommentedPath } from "../src/paths.js";
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
    <div id="plain-diagram" class="mermaid">graph LR\n U --> V</div>
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
function bytesSha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }

test("HTML artifact supports precise selection, element actions, Mermaid nodes, and visible resolution state", async ({ page }) => {
  const { source, token, id } = await fixture();
  await page.goto(`http://127.0.0.1:${port}/s/${id}?token=${encodeURIComponent(token)}`);
  let frame = await artifactFrame(page);
  await expect(frame.locator("#heading")).toHaveText("Browser fixture");
  await expect(frame.locator("#U")).toBeVisible();

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

  await frame.evaluate(() => {
    const pre = document.querySelector(".richie-html-mermaid-source pre")!;
    const range = document.createRange(); range.setStart(pre.firstChild!, 0); range.setEnd(pre.firstChild!, Math.min(12, pre.textContent!.length));
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    pre.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
  });
  await page.locator("#richie-dialog-input").fill("Review Mermaid source");
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator(".operation-card")).toHaveCount(4);
  state = await api(page, `/api/state/${id}`, token) as typeof state;
  assert.equal(state.operations[3].target?.type, "html-text-range");

  await frame.evaluate(() => parent.postMessage({ type: "richie-html-target", correlation: "stale", frameCapability: "stale-capability", kind: "comment", target: null }, "*"));
  await expect(page.locator(".operation-card")).toHaveCount(4);
  await frame.evaluate(() => document.querySelector("#heading")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(page.locator("#feedback-rvw_002")).toBeFocused();

  await frame.evaluate(() => { (document.querySelector("#heading") as HTMLElement).textContent = "Changed by fixture"; });
  await expect(page.locator(".html-resolution-status").filter({ hasText: "Unresolved target" })).toBeVisible({ timeout: 5_000 });
  assert.equal(await readFile(source, "utf8").then((value) => value.includes("Changed by fixture")), false);
  await page.request.post(`http://127.0.0.1:${port}/api/abort/${id}?token=${encodeURIComponent(token)}`);
});

test("HTML target identity restores repeated siblings and all shell actions fail closed", async ({ page }) => {
  const { source, token, id } = await fixture();
  await page.goto(`http://127.0.0.1:${port}/s/${id}?token=${encodeURIComponent(token)}`);
  const frame = await artifactFrame(page);
  const cards = frame.locator("article.card");
  await cards.nth(1).click();
  await frame.locator(".richie-html-ui button", { hasText: "Comment" }).click();
  await page.locator("#richie-dialog-input").fill("Second card only");
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator(".operation-card")).toHaveCount(1);
  const state = await api(page, `/api/state/${id}`, token) as { operations: Array<{ target?: { selector?: string; path?: number[] } }> };
  assert.ok(state.operations[0].target?.selector);
  assert.ok(state.operations[0].target?.path?.length);
  await expect(cards.nth(1)).toHaveClass(/richie-html-kind-comment/);
  await expect(cards.nth(0)).not.toHaveClass(/richie-html-kind-comment/);

  await page.locator(".operation-card button", { hasText: "Jump to target" }).click();
  await expect.poll(() => cards.nth(1).evaluate((element) => element.classList.contains("richie-html-jump-target"))).toBe(true);
  await page.locator(".operation-card button", { hasText: "Edit" }).click();
  await page.locator("#richie-dialog-input").fill("Edited second card");
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator(".operation-card")).toContainText("Edited second card");
  await page.locator(".operation-card button", { hasText: "Remove" }).click();
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator(".operation-card")).toHaveCount(0);

  await cards.nth(0).click();
  await frame.locator(".richie-html-ui button", { hasText: "Comment" }).click();
  await page.locator("#richie-dialog-input").fill("Will become unresolved");
  await page.locator("#richie-dialog [value=confirm]").click();
  await cards.nth(0).evaluate((element) => { const replacement = document.createElement("div"); replacement.className = element.className; replacement.textContent = element.textContent; element.replaceWith(replacement); });
  await expect(page.locator(".html-resolution-status")).toContainText("Unresolved target", { timeout: 5_000 });
  assert.equal(await readFile(source, "utf8").then((value) => value.includes("Will become unresolved")), false);
  await page.request.post(`http://127.0.0.1:${port}/api/abort/${id}?token=${encodeURIComponent(token)}`);
});

test("reloaded artifact frames reject a previous generation capability", async ({ page }) => {
  const { token, id } = await fixture();
  await page.addInitScript(() => {
    window.addEventListener("message", (event) => {
      const iframe = document.querySelector<HTMLIFrameElement>("#html-artifact");
      if (iframe && event.source === iframe.contentWindow && event.data?.type === "richie-html-ready") (window as Window & { __firstFrameCapability?: string }).__firstFrameCapability = event.data.frameCapability;
    });
  });
  await page.goto(`http://127.0.0.1:${port}/s/${id}?token=${encodeURIComponent(token)}`);
  let frame = await artifactFrame(page);
  const oldCapability = await page.evaluate(() => (window as Window & { __firstFrameCapability?: string }).__firstFrameCapability ?? "");
  assert.ok(oldCapability);
  await frame.goto(frame.url());
  await expect(frame.locator("body")).not.toBeEmpty();
  await page.waitForTimeout(100);
  await frame.evaluate((capability) => {
    const sdk = Array.from(document.scripts).find((script) => script.src.includes("html-review-sdk.js"));
    const correlation = sdk ? new URL(sdk.src).searchParams.get("c") : "";
    const rect = { viewport: { x: 1, y: 1, width: 20, height: 20 }, document: { x: 1, y: 1, width: 20, height: 20 }, viewportSize: { width: innerWidth, height: innerHeight } };
    const target = { type: "html-element", selector: "#heading", path: [1, 1], tag: "h1", text: "Browser fixture", rect };
    parent.postMessage({ type: "richie-html-ready", correlation, frameCapability: capability }, "*");
    parent.postMessage({ type: "richie-html-target", correlation, frameCapability: capability, kind: "comment", target }, "*");
  }, oldCapability);
  await expect(page.locator("#richie-dialog")).not.toBeVisible();
  await expect(page.locator(".operation-card")).toHaveCount(0);
  await page.request.post(`http://127.0.0.1:${port}/api/abort/${id}?token=${encodeURIComponent(token)}`);
});

test("the supplied Unilever acceptance fixture opens, navigates, and remains byte-identical", async ({ page }) => {
  const source = "/home/akhil/warchives/unilever-dt-workshop/project/deliverables/20260912-unilever-global-dt-agentic-foundations-deck/deck.html";
  try { await access(source); } catch { test.skip(); return; }
  const before = await readFile(source); const beforeSize = (await stat(source)).size; const beforeSha = bytesSha256(before);
  const created = await service.createSession(source);
  const token = new URL(created.url).searchParams.get("token")!;
  await page.goto(created.url);
  const frame = await artifactFrame(page);
  await expect(frame.locator("body")).not.toBeEmpty();
  const start = await frame.evaluate(() => scrollY);
  await frame.locator("[data-action=next]").click();
  await expect.poll(() => frame.evaluate(() => scrollY)).toBeGreaterThan(start);
  await frame.evaluate(() => scrollTo(0, 0));
  await frame.locator("body").press("ArrowRight");
  await expect.poll(() => frame.evaluate(() => scrollY)).toBeGreaterThan(start);
  const beforePrevious = await frame.evaluate(() => { scrollTo(0, document.body.scrollHeight); return scrollY; });
  await frame.locator("[data-action=previous]").click();
  await expect.poll(() => frame.evaluate(() => scrollY)).toBeLessThan(beforePrevious);
  const after = await readFile(source); assert.deepEqual(after, before); assert.equal((await stat(source)).size, beforeSize); assert.equal(bytesSha256(after), beforeSha);
  await page.request.post(`http://127.0.0.1:${port}/api/abort/${created.id}?token=${encodeURIComponent(token)}`);
});

test("HTML review remains keyboard-usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { token, id } = await fixture();
  await page.goto(`http://127.0.0.1:${port}/s/${id}?token=${encodeURIComponent(token)}`);
  const frame = await artifactFrame(page);
  await expect.poll(() => frame.evaluate(() => innerWidth)).toBeLessThanOrEqual(390);
  await frame.evaluate(() => {
    const heading = document.querySelector("#heading")!; const range = document.createRange(); range.selectNodeContents(heading);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    heading.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
  });
  await expect(page.locator("#richie-dialog")).toBeVisible();
  await page.keyboard.type("Keyboard-only comment");
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(page.locator(".operation-card")).toContainText("Keyboard-only comment");
  await frame.locator("#heading").click(); await frame.locator("body").press("Escape");
  await expect(frame.locator(".richie-html-ui")).toHaveCount(0);
  await page.locator(".operation-card").focus(); await expect(page.locator(".operation-card")).toBeFocused();
  await page.request.post(`http://127.0.0.1:${port}/api/abort/${id}?token=${encodeURIComponent(token)}`);
});

test("Markdown review keeps its rendered reading and search surface", async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), "richie-browser-markdown-")); roots.push(root);
  const source = join(root, "smoke.md");
  await writeFile(source, "# Markdown smoke\n\nSearchable text with $x^2$.\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```mermaid\ngraph TD; A-->B\n```\n");
  const created = await service.createSession(source); const token = new URL(created.url).searchParams.get("token")!;
  await page.goto(created.url);
  await expect(page.locator("#html-artifact")).toHaveCount(0);
  await expect(page.locator("#document h1")).toHaveText("Markdown smoke");
  await expect(page.locator("#document table")).toBeVisible();
  await expect(page.locator(".math-rendered")).toBeVisible();
  await expect(page.locator(".mermaid")).toBeVisible();
  await page.locator("#navigation-toggle").click();
  await page.locator("#document-search").fill("Searchable");
  await expect(page.locator("#search-count")).toHaveText("1/1");
  await page.request.post(`http://127.0.0.1:${port}/api/abort/${created.id}?token=${encodeURIComponent(token)}`);
});

test("HTML Finish and Abort are exposed through the shell without touching source bytes", async ({ page }) => {
  const finished = await fixture(); const before = await readFile(finished.source);
  await page.goto(`http://127.0.0.1:${port}/s/${finished.id}?token=${encodeURIComponent(finished.token)}`);
  const finishedFrame = await artifactFrame(page);
  await finishedFrame.locator("#heading").click();
  await finishedFrame.locator(".richie-html-ui button", { hasText: "Comment" }).click();
  await page.locator("#richie-dialog-input").fill("Persist this HTML operation");
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator(".operation-card")).toHaveCount(1);
  await page.locator('[data-action="finish"]').click();
  await page.locator("#richie-dialog [value=confirm]").click();
  await expect(page.locator("#richie-dialog-message")).toContainText("-commented.json");
  await page.locator("#richie-dialog [value=confirm]").click();
  const outputPath = htmlCommentedPath(finished.source);
  const output = JSON.parse(await readFile(outputPath, "utf8")) as { documentKind: string; source: string; operations: unknown[] };
  assert.equal(output.documentKind, "html"); assert.equal(output.source, finished.source); assert.equal(output.operations.length, 1);
  assert.deepEqual(await readFile(finished.source), before); await rm(outputPath, { force: true });

  const aborted = await fixture(); const abortBefore = await readFile(aborted.source);
  await page.goto(`http://127.0.0.1:${port}/s/${aborted.id}?token=${encodeURIComponent(aborted.token)}`);
  await page.locator('[data-action="abort"]').click();
  await page.locator("#richie-dialog [value=confirm]").click();
  assert.deepEqual(await readFile(aborted.source), abortBefore);
});
