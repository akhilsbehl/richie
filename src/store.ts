import { createHash, randomUUID } from "node:crypto";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseHtmlTarget } from "./html-target.js";
import { constants } from "node:fs";
import { commentedPath, reviewSidecarPath } from "./paths.js";
import { parseMarkdown } from "./render.js";
import type { ReviewOperation, ReviewState } from "./types.js";

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  position?: { start: { offset: number }; end: { offset: number } };
};

export const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

export function documentKindForPath(sourcePath: string): "markdown" | "html" {
  const extension = extname(sourcePath).toLowerCase();
  if (extension === ".md") return "markdown";
  if (extension === ".html" || extension === ".htm") return "html";
  throw new Error("Richie accepts .md, .html, and .htm files");
}
export async function assertReviewFile(sourcePath: string): Promise<string> {
  documentKindForPath(sourcePath); await access(sourcePath, constants.R_OK); return readFile(sourcePath, "utf8");
}
export const assertMarkdownFile = assertReviewFile;

export async function readSourceSnapshot(sourcePath: string): Promise<{ source: string; sourceSha256: string }> {
  documentKindForPath(sourcePath);
  await access(sourcePath, constants.R_OK);
  const bytes = await readFile(sourcePath);
  return { source: bytes.toString("utf8"), sourceSha256: sha256(bytes) };
}

export function newState(sourcePath: string, source: string, sourceSha256 = sha256(source)): ReviewState {
  return { schemaVersion: 1, source: sourcePath, documentKind: documentKindForPath(sourcePath), sourceSha256, createdAt: new Date().toISOString(), operations: [] };
}

export function hasOpenOperations(state: ReviewState): boolean {
  return state.operations.some((operation) => operation.status === "open");
}

type UnknownRecord = Record<string, unknown>;
const operationKinds = new Set<ReviewOperation["kind"]>(["comment", "replace", "delete"]);
const operationStatuses = new Set<ReviewOperation["status"]>(["open", "applied", "rejected", "needs-review", "superseded"]);
const operationScopes = new Set<ReviewOperation["scope"]>(["range", "block", "section", "document", "cell", "row", "column", "media"]);
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const boundedText = (value: unknown, max = 16_384): value is string => typeof value === "string" && value.length <= max;
const position = (value: unknown): value is { line?: number; column?: number; offset: number } => isRecord(value)
  && Number.isInteger(value.offset) && Number(value.offset) >= 0
  && (value.line === undefined || Number.isInteger(value.line) && Number(value.line) >= 0)
  && (value.column === undefined || Number.isInteger(value.column) && Number(value.column) >= 0);

function normalizeOperation(value: unknown, documentKind: ReviewState["documentKind"]): ReviewOperation {
  if (!isRecord(value) || !boundedText(value.id, 128) || !value.id || !operationKinds.has(value.kind as ReviewOperation["kind"])
    || !operationStatuses.has(value.status as ReviewOperation["status"]) || !operationScopes.has(value.scope as ReviewOperation["scope"])
    || !boundedText(value.createdAt, 128)) throw new Error("Invalid review operation in sidecar");
  const operation: ReviewOperation = {
    id: value.id as string,
    kind: value.kind as ReviewOperation["kind"],
    status: value.status as ReviewOperation["status"],
    scope: value.scope as ReviewOperation["scope"],
    createdAt: value.createdAt as string,
  };
  if (value.updatedAt !== undefined && !boundedText(value.updatedAt, 128)) throw new Error("Invalid review operation timestamp");
  if (value.updatedAt !== undefined) operation.updatedAt = value.updatedAt as string;
  if (value.range !== undefined) {
    if (documentKind === "html" || !isRecord(value.range) || !position(value.range.start) || !position(value.range.end)
      || (value.range.start as { offset: number }).offset >= (value.range.end as { offset: number }).offset) throw new Error("Invalid review operation range");
    operation.range = { start: { offset: value.range.start.offset, line: value.range.start.line ?? 0, column: value.range.start.column ?? 0 }, end: { offset: value.range.end.offset, line: value.range.end.line ?? 0, column: value.range.end.column ?? 0 } };
  }
  if (value.target !== undefined) {
    if (documentKind !== "html") throw new Error("HTML target in Markdown sidecar");
    const target = parseHtmlTarget(value.target);
    if (!target) throw new Error("Invalid HTML target in sidecar");
    operation.target = target;
  }
  if (documentKind === "html") {
    if (operation.scope === "document") {
      if (operation.kind !== "comment" || operation.target !== undefined || operation.range !== undefined) throw new Error("Invalid HTML document operation");
    } else if (!operation.target) throw new Error("HTML operation is missing its target");
    else if ((operation.target.type === "html-text-range" && operation.scope !== "range") || (operation.target.type !== "html-text-range" && operation.scope !== "block")) throw new Error("HTML target scope mismatch");
  }
  for (const [key, max] of [["quote", 16_384], ["comment", 16_384], ["replacement", 16_384]] as const) {
    if (value[key] !== undefined && !boundedText(value[key], max)) throw new Error(`Invalid ${key} in review operation`);
    if (value[key] !== undefined) (operation as unknown as UnknownRecord)[key] = value[key];
  }
  if (value.headingPath !== undefined && (!Array.isArray(value.headingPath) || !value.headingPath.every((item) => boundedText(item, 1024)))) throw new Error("Invalid heading path in review operation");
  if (value.headingPath !== undefined) operation.headingPath = [...value.headingPath as string[]];
  if (value.blockId !== undefined && !boundedText(value.blockId, 1024)) throw new Error("Invalid block ID in review operation");
  if (value.blockId !== undefined) operation.blockId = value.blockId as string;
  if (value.placement !== undefined && value.placement !== "start" && value.placement !== "end") throw new Error("Invalid operation placement");
  if (value.placement !== undefined) operation.placement = value.placement as "start" | "end";
  if (operation.kind === "comment" && (typeof operation.comment !== "string" || !operation.comment.trim())) throw new Error("Comment operation is missing its comment");
  if (operation.kind === "replace" && (typeof operation.replacement !== "string" || !operation.replacement.trim())) throw new Error("Replace operation is missing its replacement");
  if (operation.kind === "delete" && (operation.comment !== undefined || operation.replacement !== undefined)) throw new Error("Delete operation contains unsupported payload");
  return operation;
}

/** Normalize old sidecars at the persistence boundary, never by unchecked casting. */
export function normalizeReviewState(value: unknown, expectedSourcePath?: string): ReviewState {
  if (!isRecord(value) || value.schemaVersion !== 1 || !boundedText(value.source, 4096) || !value.source
    || !/^[a-f0-9]{64}$/.test(String(value.sourceSha256)) || !boundedText(value.createdAt, 128)
    || !Array.isArray(value.operations)) throw new Error("Invalid review sidecar");
  const source = value.source;
  const documentKind = value.documentKind === undefined ? "markdown" : value.documentKind;
  if (documentKind !== "markdown" && documentKind !== "html") throw new Error("Invalid document kind in review sidecar");
  if (expectedSourcePath && source !== expectedSourcePath) throw new Error("Review sidecar targets a different source path");
  const derived = documentKindForPath(expectedSourcePath ?? source);
  if (derived !== documentKind) throw new Error("Review sidecar document kind does not match its source path");
  const operations = value.operations.map((operation) => normalizeOperation(operation, documentKind));
  return { schemaVersion: 1, source, documentKind, sourceSha256: value.sourceSha256 as string, createdAt: value.createdAt as string, operations };
}

export async function readState(sidecarPath: string, expectedSourcePath?: string): Promise<ReviewState | undefined> {
  try { return normalizeReviewState(JSON.parse(await readFile(sidecarPath, "utf8")), expectedSourcePath); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeState(sidecarPath: string, state: ReviewState): Promise<void> {
  const temporary = `${sidecarPath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, sidecarPath);
}

export async function nextCommentedPath(sourcePath: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const candidate = commentedPath(sourcePath, attempt);
    try { await access(candidate); } catch { return candidate; }
  }
}

function marker(operation: ReviewOperation): string {
  const id = `[${operation.id}]`;
  const quote = JSON.stringify(operation.quote ?? "selected text");
  if (operation.scope === "document") return `<<ASB: ${id} ${operation.comment ?? "Document note."}>>`;
  if (operation.scope === "row") return `<<ASB: ${id} Delete the table row selected from ${quote}.>>`;
  if (operation.scope === "column") return `<<ASB: ${id} Delete the table column selected from ${quote}.>>`;
  if (operation.scope === "cell" && operation.kind === "delete") return `<<ASB: ${id} Clear the table cell ${quote}.>>`;
  if (operation.scope === "media" && operation.kind === "replace") return `<<ASB: ${id} Replace image ${quote} with ${JSON.stringify(operation.replacement ?? "")}.>>`;
  if (operation.scope === "media" && operation.kind === "delete") return `<<ASB: ${id} Delete image ${quote}.>>`;
  if (operation.scope === "media") return `<<ASB: ${id} Comment on image ${quote}: ${operation.comment ?? "Review this image."}>>`;
  if (operation.kind === "replace") return `<<ASB: ${id} Replace ${quote} with ${JSON.stringify(operation.replacement ?? "")}.>>`;
  if (operation.kind === "delete") return `<<ASB: ${id} Delete ${operation.scope === "block" ? "the block " : ""}${quote}.>>`;
  if (operation.quote) return `<<ASB: ${id} Comment on ${operation.scope === "range" ? "" : `${operation.scope} `}${quote}: ${operation.comment ?? "Review this."}>>`;
  return `<<ASB: ${id} ${operation.comment ?? "Review this."}>>`;
}

function walk(node: MarkdownNode, type: string, matches: MarkdownNode[] = []): MarkdownNode[] {
  if (node.type === type) matches.push(node);
  for (const child of node.children ?? []) walk(child, type, matches);
  return matches;
}

function contains(node: MarkdownNode, operation: ReviewOperation): boolean {
  return Boolean(node.position && operation.range && node.position.start.offset <= operation.range.start.offset && node.position.end.offset >= operation.range.end.offset);
}

function codeMarkerPlacement(source: string, node: MarkdownNode, operation: ReviewOperation): { offset: number; text: string } {
  const start = node.position!.start.offset;
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = source.indexOf("\n", start);
  const openingLine = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
  const fence = openingLine.search(/[`~]{3,}/);
  const prefix = fence < 0 ? "" : openingLine.slice(0, fence);
  return { offset: node.position!.end.offset, text: `\n${prefix}${marker(operation)}` };
}

function columnMarkerPlacements(source: string, root: MarkdownNode, operation: ReviewOperation): Array<{ offset: number; text: string }> {
  const table = walk(root, "table").find((candidate) => contains(candidate, operation));
  if (!table) return [];
  const rows = (table.children ?? []).filter((candidate) => candidate.type === "tableRow");
  const column = rows.find((row) => (row.children ?? []).some((cell) => contains(cell, operation)))?.children?.findIndex((cell) => contains(cell, operation));
  if (column === undefined || column < 0) return [];
  return rows.flatMap((row) => {
    const cell = row.children?.[column];
    if (!cell?.position) return [];
    const closingFence = source.lastIndexOf("|", cell.position.end.offset - 1);
    return [{ offset: closingFence >= cell.position.start.offset ? closingFence : cell.position.end.offset, text: ` ${marker(operation)}` }];
  });
}

export function renderCommentedMarkdown(source: string, state: ReviewState): string {
  const root = parseMarkdown(source) as MarkdownNode;
  const codeBlocks = walk(root, "code");
  const insertions = state.operations.filter((operation) => operation.status === "open" && operation.range).flatMap((operation) => {
    if (operation.scope === "column") {
      const placements = columnMarkerPlacements(source, root, operation);
      if (placements.length) return placements;
    }
    const codeBlock = codeBlocks.find((candidate) => contains(candidate, operation));
    if (codeBlock) return [codeMarkerPlacement(source, codeBlock, operation)];
    return [{ offset: operation.range!.end.offset, text: ` ${marker(operation)}` }];
  }).sort((a, b) => b.offset - a.offset);
  let output = source;
  for (const insertion of insertions) {
    output = `${output.slice(0, insertion.offset)}${insertion.text}${output.slice(insertion.offset)}`;
  }
  const opening = state.operations.filter((operation) => operation.status === "open" && operation.scope === "document" && operation.placement === "start").map(marker);
  return [...opening, output].filter(Boolean).join("\n\n");
}

export { reviewSidecarPath };
