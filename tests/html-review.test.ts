import assert from "node:assert/strict";
import test from "node:test";
import { injectSdk, renderReviewPage } from "../src/service.js";
import { documentKindForPath, newState } from "../src/store.js";
import { htmlCommentedPath } from "../src/paths.js";

test("admits HTML and injects one SDK tag before body without changing source input", () => {
  const source = "<html><body><p>hello</p></body></html>";
  const output = injectSdk(source, "/assets/html-review-sdk.js?c=x");
  assert.equal(documentKindForPath("report.HTM"), "html");
  assert.equal(newState("report.html", source).documentKind, "html");
  assert.equal(output, "<html><body><p>hello</p><script src=\"/assets/html-review-sdk.js?c=x\"></script></body></html>");
  assert.equal(source, "<html><body><p>hello</p></body></html>");
  assert.equal(injectSdk("<p>x</p>", "/sdk.js"), "<p>x</p><script src=\"/sdk.js\"></script>");
  assert.equal(htmlCommentedPath("/work/report.htm"), "/work/report-commented.json");
});

test("HTML shell binds each artifact frame to a non-secret reload correlation value", () => {
  const html = renderReviewPage({ id: "session", token: "secret", sourcePath: "/work/report.html", documentKind: "html", artifactNonce: "fresh-frame" }, "<p>ignored</p>");
  assert.match(html, /sandbox="allow-scripts"/);
  assert.match(html, /index\.html\?n=fresh-frame/);
  assert.match(html, /artifactNonce":"fresh-frame"/);
  assert.doesNotMatch(html, /artifact\/session\/index\.html\?[^\"]*token/);
});
