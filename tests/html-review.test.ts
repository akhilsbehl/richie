import assert from "node:assert/strict";
import test from "node:test";
import { injectSdk } from "../src/service.js";
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
