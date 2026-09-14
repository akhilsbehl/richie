import type { HtmlBoundary, HtmlRect, HtmlTarget } from "./types.js";

/** Bounds shared by the HTTP validator and the artifact SDK. */
export const HTML_LIMITS = {
  selector: 1024,
  tag: 80,
  identity: 256,
  text: 2048,
  pathDepth: 64,
  pathIndex: 100_000,
  coordinate: 10_000_000,
  viewport: 100_000,
  offset: 10_000_000,
  selectorDepth: 16,
} as const;

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Normalises only display/evidence whitespace; it never invents locator data. */
export function normalizeHtmlText(value: string, max: number = HTML_LIMITS.text): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function boundedString(value: unknown, max: number, nonEmpty = true): string | undefined {
  if (typeof value !== "string" || value.length > max || (nonEmpty && value.length === 0)) return undefined;
  return value;
}

function validPath(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= HTML_LIMITS.pathDepth && value.every((part) => Number.isInteger(part) && part >= 0 && part < HTML_LIMITS.pathIndex);
}

function validRectPart(value: unknown): value is { x: number; y: number; width: number; height: number } {
  if (!isRecord(value)) return false;
  return ["x", "y", "width", "height"].every((key) => {
    const number = value[key];
    if (typeof number !== "number" || !Number.isFinite(number)) return false;
    return key === "x" || key === "y" ? Math.abs(number) < HTML_LIMITS.coordinate : number >= 0 && number < HTML_LIMITS.coordinate;
  });
}

export function isValidHtmlRect(value: unknown): value is HtmlRect {
  if (!isRecord(value) || !validRectPart(value.viewport) || !validRectPart(value.document) || !isRecord(value.viewportSize)) return false;
  const width = value.viewportSize.width;
  const height = value.viewportSize.height;
  return typeof width === "number" && Number.isFinite(width) && width > 0 && width < HTML_LIMITS.viewport
    && typeof height === "number" && Number.isFinite(height) && height > 0 && height < HTML_LIMITS.viewport;
}

function selectorDepth(selector: string): number {
  let depth = 1; let square = 0; let paren = 0; let quote = ""; let escaped = false;
  let pendingSpace = false; let compound = false;
  for (const character of selector) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (quote) { if (character === quote) quote = ""; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === "[") { square += 1; compound = true; continue; }
    if (character === "]") { square = Math.max(0, square - 1); continue; }
    if (character === "(") { paren += 1; compound = true; continue; }
    if (character === ")") { paren = Math.max(0, paren - 1); continue; }
    if (square || paren) continue;
    if (/\s/.test(character)) { pendingSpace = true; continue; }
    if (character === ">" || character === "+" || character === "~") { depth += 1; compound = false; pendingSpace = false; continue; }
    if (pendingSpace && compound) { depth += 1; compound = false; }
    pendingSpace = false; compound = true;
  }
  return depth;
}

function validSelector(value: unknown): value is string {
  const selector = boundedString(value, HTML_LIMITS.selector);
  if (selector === undefined || !selector.trim() || selector.includes(",") || /[\u0000-\u001f\u007f]/.test(selector)) return false;
  let quote = ""; let escaped = false; const stack: string[] = [];
  for (const character of selector) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (quote) { if (character === quote) quote = ""; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === "[" || character === "(") stack.push(character);
    else if (character === "]" || character === ")") { if (!stack.length || (character === "]" ? stack.pop() !== "[" : stack.pop() !== "(")) return false; }
  }
  if (quote || escaped || stack.length > 0 || selectorDepth(selector) > HTML_LIMITS.selectorDepth) return false;
  escaped = false;
  for (const character of selector) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (!/[A-Za-z0-9_*#.:>+~\-\[\]()='"\s]/.test(character)) return false;
  }
  return !escaped;
}

function validTag(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= HTML_LIMITS.tag && /^[a-z][a-z0-9-]*$/i.test(value);
}

function validBoundary(value: unknown): value is HtmlBoundary {
  if (!isRecord(value) || !validSelector(value.selector) || !validPath(value.path)) return false;
  return typeof value.offset === "number" && Number.isInteger(value.offset) && value.offset >= 0 && value.offset < HTML_LIMITS.offset;
}

const ownKeys = (value: RecordValue, expected: readonly string[]): boolean => Object.keys(value).every((key) => expected.includes(key));

/**
 * Parse an untrusted HTML locator into a known-key, bounded target. Returning a
 * copy is deliberate: callers never persist the object supplied by a browser.
 */
export function parseHtmlTarget(value: unknown): HtmlTarget | undefined {
  if (!isRecord(value) || typeof value.type !== "string" || !validSelector(value.selector) || !isValidHtmlRect(value.rect)) return undefined;
  if (value.type === "html-element") {
    if (!ownKeys(value, ["type", "selector", "path", "tag", "text", "rect"]) || !validPath(value.path) || !validTag(value.tag)) return undefined;
    const text = boundedString(value.text, HTML_LIMITS.text);
    if (text === undefined) return undefined;
    return { type: "html-element", selector: value.selector, path: [...value.path], tag: value.tag.toLowerCase(), text: normalizeHtmlText(text), rect: cloneRect(value.rect) };
  }
  if (value.type === "html-text-range") {
    if (!ownKeys(value, ["type", "selector", "commonAncestorSelector", "start", "end", "text", "exactText", "rect"])
      || !validSelector(value.commonAncestorSelector) || value.selector !== value.commonAncestorSelector || !validBoundary(value.start) || !validBoundary(value.end)) return undefined;
    const text = boundedString(value.text, HTML_LIMITS.text);
    const exactText = boundedString(value.exactText, HTML_LIMITS.text);
    if (text === undefined || exactText === undefined || exactText.length === 0) return undefined;
    const start = cloneBoundary(value.start);
    const end = cloneBoundary(value.end);
    if (start.selector === end.selector && JSON.stringify(start.path) === JSON.stringify(end.path) && end.offset <= start.offset) return undefined;
    return { type: "html-text-range", selector: value.selector, commonAncestorSelector: value.commonAncestorSelector, start, end, text: normalizeHtmlText(text), exactText, rect: cloneRect(value.rect) };
  }
  if (value.type === "mermaid-node") {
    if (!ownKeys(value, ["type", "diagramId", "nodeId", "label", "selector", "rect"])) return undefined;
    const diagramId = boundedString(value.diagramId, HTML_LIMITS.identity);
    const nodeId = boundedString(value.nodeId, HTML_LIMITS.identity);
    const label = boundedString(value.label, HTML_LIMITS.text);
    if (diagramId === undefined || nodeId === undefined || label === undefined) return undefined;
    return { type: "mermaid-node", diagramId, nodeId, label, selector: value.selector, rect: cloneRect(value.rect) };
  }
  return undefined;
}

function cloneBoundary(value: HtmlBoundary): HtmlBoundary { return { selector: value.selector, path: [...value.path], offset: value.offset }; }
function cloneRect(value: HtmlRect): HtmlRect {
  return {
    viewport: { ...value.viewport },
    document: { ...value.document },
    viewportSize: { ...value.viewportSize },
  };
}
