import assert from "node:assert/strict";
import test from "node:test";
import { HTML_LIMITS, isValidHtmlRect, normalizeHtmlText, parseHtmlTarget } from "../src/html-target.js";

const point = { x: 1, y: 2, width: 30, height: 20 };
const rect = { viewport: point, document: point, viewportSize: { width: 1280, height: 720 } };
const boundary = { selector: "p", path: [0, 1], offset: 0 };

test("normalizes bounded HTML evidence without changing locator semantics", () => {
  assert.equal(normalizeHtmlText("  hello\n\tworld  "), "hello world");
  assert.equal(normalizeHtmlText("x".repeat(HTML_LIMITS.text + 20)).length, HTML_LIMITS.text);
  assert.deepEqual(parseHtmlTarget({ type: "html-element", selector: "#target", path: [0, 1], tag: "P", text: " hello ", rect }),
    { type: "html-element", selector: "#target", path: [0, 1], tag: "p", text: "hello", rect });
});

test("accepts every target kind and rejects malformed, ambiguous, or unbounded evidence", () => {
  assert.ok(parseHtmlTarget({ type: "html-element", selector: "#target", path: [], tag: "p", text: "text", rect }));
  assert.ok(parseHtmlTarget({ type: "html-text-range", selector: "#target", commonAncestorSelector: "#target", start: boundary, end: { ...boundary, offset: 4 }, text: "text", exactText: "text", rect }));
  assert.ok(parseHtmlTarget({ type: "mermaid-node", diagramId: "diagram", nodeId: "A", label: "Start", selector: "#A", rect }));
  const invalid = [null, [], {}, { type: "unknown", selector: "#x", rect },
    { type: "html-element", selector: "#x", path: [HTML_LIMITS.pathIndex], tag: "p", text: "x", rect },
    { type: "html-element", selector: "#x", path: [0], tag: "p", text: "x", rect: { ...rect, viewport: { ...point, width: -1 } } },
    { type: "html-text-range", selector: "#x", commonAncestorSelector: "#x", start: boundary, end: boundary, text: "x", exactText: "x", rect },
    { type: "mermaid-node", diagramId: "", nodeId: "A", label: "x", selector: "#A", rect },
    { type: "html-element", selector: "#x", path: [], tag: "p", text: "x", rect, unexpected: true },
    { type: "html-element", selector: "#x", path: [], tag: "p", text: "x".repeat(HTML_LIMITS.text + 1), rect }];
  invalid.forEach((value) => assert.equal(parseHtmlTarget(value), undefined));
});

test("rectangle validation requires finite non-negative dimensions and usable viewport", () => {
  assert.equal(isValidHtmlRect(rect), true);
  assert.equal(isValidHtmlRect({ ...rect, document: { ...point, height: -1 } }), false);
  assert.equal(isValidHtmlRect({ ...rect, viewport: { ...point, x: Number.NaN } }), false);
  assert.equal(isValidHtmlRect({ ...rect, viewportSize: { width: 0, height: 720 } }), false);
});
