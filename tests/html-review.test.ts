import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { injectSdk, renderReviewPage } from "../src/service.js";
import { documentKindForPath, newState, normalizeReviewState, readState } from "../src/store.js";
import { htmlCommentedPath } from "../src/paths.js";

test("admits HTML and injects one SDK tag before body without changing source input", () => {
  const source = "<html><body><p>hello</p></body></html>";
  const output = injectSdk(source, "/assets/html-review-sdk.js?c=x");
  assert.equal(documentKindForPath("report.HTM"), "html");
  assert.equal(newState("report.html", source).documentKind, "html");
  assert.equal(output, "<html><body><p>hello</p><script src=\"/assets/html-review-sdk.js?c=x\"></script></body></html>");
  assert.equal(source, "<html><body><p>hello</p></body></html>");
  assert.equal(injectSdk("<p>x</p>", "/sdk.js"), "<p>x</p><script src=\"/sdk.js\"></script>");
  assert.equal(injectSdk("<html><body><script>const literal = '</body>';</script><p>x</p></body></html>", "/sdk.js"), "<html><body><script>const literal = '</body>';</script><p>x</p><script src=\"/sdk.js\"></script></body></html>");
  assert.equal(injectSdk("<body>x</body>", "/sdk.js").split('<script src="/sdk.js"></script>').length - 1, 1);
  assert.equal(htmlCommentedPath("/work/report.htm"), "/work/report-commented.json");
});

test("legacy Markdown sidecars normalize document identity and malformed state is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "richie-state-"));
  const sidecar = join(root, "draft.review.json");
  try {
    const legacy = { schemaVersion: 1, source: join(root, "draft.md"), sourceSha256: "a".repeat(64), createdAt: new Date().toISOString(), operations: [] };
    await writeFile(sidecar, JSON.stringify(legacy));
    assert.equal((await readState(sidecar))?.documentKind, "markdown");
    assert.equal(normalizeReviewState(legacy).documentKind, "markdown");
    await writeFile(sidecar, JSON.stringify({ ...legacy, documentKind: "html" }));
    await assert.rejects(() => readState(sidecar), /document kind/);
    assert.equal(documentKindForPath("report.md"), "markdown");
    assert.equal(documentKindForPath("report.html"), "html");
    assert.equal(documentKindForPath("report.HTM"), "html");
    assert.throws(() => documentKindForPath("report.txt"), /accepts/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("HTML shell binds each artifact frame to a non-secret reload correlation value", () => {
  const html = renderReviewPage({ id: "session", token: "secret", sourcePath: "/work/<report>.html", documentKind: "html", artifactNonce: "fresh-frame" }, "<p>ignored</p>");
  assert.match(html, /<title>Richie: \/work\/&lt;report&gt;\.html<\/title>/);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.match(html, /index\.html\?n=fresh-frame/);
  assert.match(html, /artifactNonce":"fresh-frame"/);
  assert.doesNotMatch(html, /artifact\/session\/index\.html\?[^\"]*token/);
});
