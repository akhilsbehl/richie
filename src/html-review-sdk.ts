import type { HtmlBoundary, HtmlRect, HtmlTarget } from "./types.js";

// This file is deliberately dependency-free at runtime. It executes in an
// opaque-origin iframe and never receives the Richie review token.
const script = document.currentScript as HTMLScriptElement | null;
const scriptUrl = new URL(script?.src ?? location.href, location.href);
const correlation = scriptUrl.searchParams.get("c") ?? "";
const randomCapability = (): string => {
  try { return globalThis.crypto.randomUUID(); } catch { return `frame-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
};
const frameCapability = randomCapability();
const cap = (value: string, max: number = 2048): string => value.slice(0, max);
const normalizeHtmlText = (value: string, max = 2048): string => value.replace(/\s+/g, " ").trim().slice(0, max);
const evidence = (value: string, max = 2048): string => normalizeHtmlText(cap(value, max), max);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validPath = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 64 && value.every((part) => Number.isInteger(part) && part >= 0 && part < 100000);
const validRect = (value: unknown): value is HtmlRect => {
  if (!isRecord(value) || !isRecord(value.viewport) || !isRecord(value.document) || !isRecord(value.viewportSize)) return false;
  const part = (candidate: Record<string, unknown>) => ["x", "y", "width", "height"].every((key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key]) && Number(candidate[key]) >= 0 && Number(candidate[key]) < 10000000);
  return part(value.viewport) && part(value.document) && typeof value.viewportSize.width === "number" && value.viewportSize.width > 0 && typeof value.viewportSize.height === "number" && value.viewportSize.height > 0;
};
const parseHtmlTarget = (value: unknown): HtmlTarget | undefined => {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.selector !== "string" || !value.selector || value.selector.length > 1024 || !validRect(value.rect)) return undefined;
  const allowed = (keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
  if (value.type === "html-element" && allowed(["type", "selector", "path", "tag", "text", "rect"]) && validPath(value.path) && typeof value.tag === "string" && /^[a-z][a-z0-9-]*$/i.test(value.tag) && typeof value.text === "string" && value.text.length <= 2048 && value.text) return { type: "html-element", selector: value.selector, path: [...value.path], tag: value.tag.toLowerCase(), text: evidence(value.text), rect: value.rect };
  if (value.type === "html-text-range" && allowed(["type", "selector", "commonAncestorSelector", "start", "end", "text", "exactText", "rect"]) && typeof value.commonAncestorSelector === "string" && value.commonAncestorSelector.length > 0 && value.commonAncestorSelector.length <= 1024 && typeof value.text === "string" && typeof value.exactText === "string" && value.text.length <= 2048 && value.exactText.length <= 2048 && value.exactText && isRecord(value.start) && isRecord(value.end)) {
    const parseBoundary = (candidate: Record<string, unknown>): HtmlBoundary | undefined => typeof candidate.selector === "string" && candidate.selector.length > 0 && candidate.selector.length <= 1024 && validPath(candidate.path) && Number.isInteger(candidate.offset) && Number(candidate.offset) >= 0 && Number(candidate.offset) < 10000000 ? { selector: candidate.selector, path: [...candidate.path as number[]], offset: Number(candidate.offset) } : undefined;
    const start = parseBoundary(value.start); const end = parseBoundary(value.end); if (!start || !end || start.selector === end.selector && JSON.stringify(start.path) === JSON.stringify(end.path) && end.offset <= start.offset) return undefined;
    return { type: "html-text-range", selector: value.selector, commonAncestorSelector: value.commonAncestorSelector, start, end, text: evidence(value.text), exactText: value.exactText, rect: value.rect };
  }
  if (value.type === "mermaid-node" && allowed(["type", "diagramId", "nodeId", "label", "selector", "rect"]) && [value.diagramId, value.nodeId, value.label].every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 2048)) return { type: "mermaid-node", diagramId: value.diagramId as string, nodeId: value.nodeId as string, label: value.label as string, selector: value.selector, rect: value.rect };
  return undefined;
};
const post = (message: Record<string, unknown>): void => parent.postMessage({ ...message, correlation, frameCapability }, "*");

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}
function selectorFor(element: Element): string {
  if (element.id) return `#${cssEscape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && parts.length < 8) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children).filter((candidate) => candidate.tagName === current!.tagName);
    const tag = current.tagName.toLowerCase();
    parts.unshift(`${tag}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""}`);
    const candidate = parts.join(" > ");
    try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch { /* continue toward the root */ }
    current = parent;
  }
  return parts.join(" > ") || "html";
}
function pathFor(node: Node, root: Node): number[] {
  const path: number[] = [];
  for (let current: Node | null = node; current && current !== root; current = current.parentNode) {
    if (!current.parentNode) return [];
    path.unshift(Array.prototype.indexOf.call(current.parentNode.childNodes, current));
  }
  return path;
}
function nodeAt(root: Node, path: number[]): Node | undefined {
  let current: Node | undefined = root;
  for (const index of path) {
    if (index < 0 || index >= current.childNodes.length) return undefined;
    current = current.childNodes[index];
  }
  return current;
}
function rectFor(bounds: DOMRect): HtmlRect {
  return {
    viewport: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    document: { x: bounds.x + window.scrollX, y: bounds.y + window.scrollY, width: bounds.width, height: bounds.height },
    viewportSize: { width: window.innerWidth, height: window.innerHeight },
  };
}
function ignored(element: Element | null | undefined): boolean {
  return !element || element.closest(".richie-html-ui,button,input,textarea,select,option,audio,video,iframe,object,embed,a,[contenteditable],form") !== null;
}
function nearestElement(node: Node): Element | null { return node instanceof Element ? node : node.parentElement; }
function withinDocument(node: Node | null): boolean { return Boolean(node && (node === document || document.documentElement.contains(node))); }

function boundary(node: Node, offset: number): HtmlBoundary | undefined {
  const owner = nearestElement(node);
  if (!owner || ignored(owner)) return undefined;
  const path = pathFor(node, owner);
  return { selector: selectorFor(owner), path, offset };
}
function textRangeTarget(selection: Selection): HtmlTarget | undefined {
  if (selection.isCollapsed || selection.rangeCount === 0 || !withinDocument(selection.anchorNode) || !withinDocument(selection.focusNode)) return undefined;
  const range = selection.getRangeAt(0);
  const ancestor = nearestElement(range.commonAncestorContainer);
  if (!ancestor || ignored(ancestor) || ignored(nearestElement(range.startContainer)) || ignored(nearestElement(range.endContainer))) return undefined;
  const start = boundary(range.startContainer, range.startOffset);
  const end = boundary(range.endContainer, range.endOffset);
  const raw = selection.toString();
  if (!start || !end || !raw) return undefined;
  const target: HtmlTarget = {
    type: "html-text-range", selector: selectorFor(ancestor), commonAncestorSelector: selectorFor(ancestor),
    start, end, text: evidence(raw), exactText: cap(raw), rect: rectFor(range.getBoundingClientRect()),
  };
  return parseHtmlTarget(target) as HtmlTarget | undefined;
}
function elementTarget(element: Element): HtmlTarget | undefined {
  if (ignored(element)) return undefined;
  const target: HtmlTarget = { type: "html-element", selector: selectorFor(element), path: pathFor(element, document), tag: element.tagName.toLowerCase(), text: evidence(element.textContent ?? ""), rect: rectFor(element.getBoundingClientRect()) };
  return parseHtmlTarget(target) as HtmlTarget | undefined;
}

function mermaidTarget(element: Element): HtmlTarget | undefined {
  const node = element.closest<SVGElement>("svg .node, svg [data-node-id]");
  if (!node) return undefined;
  const svg = node.closest("svg");
  const diagram = node.closest<HTMLElement>("[data-diagram-id], .mermaid, [id^=mermaid]");
  const diagramId = diagram?.dataset.diagramId || diagram?.id || svg?.id;
  const nodeId = node.getAttribute("data-node-id") || node.id;
  const label = evidence(node.textContent ?? "", 2048);
  if (!diagramId || !nodeId || !label) return undefined;
  const target: HtmlTarget = { type: "mermaid-node", diagramId: cap(diagramId, 256), nodeId: cap(nodeId, 256), label, selector: selectorFor(node), rect: rectFor(node.getBoundingClientRect()) };
  return parseHtmlTarget(target) as HtmlTarget | undefined;
}

function installStyles(): void {
  if (document.getElementById("richie-html-review-styles")) return;
  const style = document.createElement("style");
  style.id = "richie-html-review-styles";
  style.textContent = `
    .richie-html-annotated-target { outline: 3px solid #b4637a !important; outline-offset: 3px !important; }
    .richie-html-kind-comment { background: rgb(86 148 159 / 22%) !important; text-decoration: underline !important; text-decoration-color: #56949f !important; text-decoration-thickness: 2px !important; }
    .richie-html-kind-replace { background: rgb(234 157 52 / 28%) !important; text-decoration: line-through !important; text-decoration-color: #ea9d34 !important; text-decoration-thickness: 2px !important; }
    .richie-html-kind-delete { background: repeating-linear-gradient(135deg, rgb(180 99 122 / 10%), rgb(180 99 122 / 10%) 8px, rgb(180 99 122 / 26%) 8px, rgb(180 99 122 / 26%) 13px) !important; text-decoration: line-through !important; text-decoration-color: #b4637a !important; text-decoration-thickness: 2px !important; }
    .richie-html-jump-target { outline: 3px solid #ea9d34 !important; outline-offset: 4px !important; }
    .richie-html-ui { display: flex; gap: 4px; position: fixed; z-index: 2147483647; padding: 4px; border: 1px solid #dfd6cc; border-radius: 7px; background: #fffaf3; box-shadow: 0 4px 14px rgb(87 82 121 / 18%); }
    .richie-html-ui button { min-height: 36px; padding: 7px 11px; border: 1px solid #dfd6cc; border-radius: 7px; background: #f2e9de; color: #575279; font: .9rem/1.2 system-ui, sans-serif; cursor: pointer; }
    .richie-html-ui button:hover, .richie-html-ui button:focus-visible { border-color: #d7827e; background: #eadfd2; }
  `;
  document.head.append(style);
}

let hoveredTarget: Element | undefined;
let menuElement: HTMLElement | undefined;
let hideTimer: number | undefined;
let showTimer: number | undefined;
let pendingTarget: Element | undefined;
const clearHover = (): void => { hoveredTarget?.classList.remove("richie-html-hover-target"); hoveredTarget = undefined; };
const closeMenu = (): void => { window.clearTimeout(hideTimer); window.clearTimeout(showTimer); hideTimer = undefined; showTimer = undefined; pendingTarget = undefined; clearHover(); menuElement?.remove(); menuElement = undefined; };
function placeMenu(element: HTMLElement, bounds: DOMRect): void {
  const left = Math.max(4, Math.min(bounds.left, window.innerWidth - 240));
  const top = Math.max(4, Math.min(bounds.bottom + 6, window.innerHeight - 48));
  Object.assign(element.style, { left: `${left}px`, top: `${top}px` });
}
function showMenu(target: HtmlTarget, bounds: DOMRect, highlighted?: Element): void {
  closeMenu();
  if (highlighted) { hoveredTarget = highlighted; highlighted.classList.add("richie-html-hover-target"); }
  const menu = document.createElement("div");
  menu.className = "richie-html-ui";
  menu.setAttribute("role", "toolbar"); menu.setAttribute("aria-label", "Add feedback to highlighted content");
  for (const kind of ["comment", "replace", "delete"] as const) {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = kind[0].toUpperCase() + kind.slice(1);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); post({ type: "richie-html-target", kind, target }); });
    menu.append(button);
  }
  menu.addEventListener("pointerenter", () => window.clearTimeout(hideTimer));
  menu.addEventListener("pointerleave", () => { hideTimer = window.setTimeout(closeMenu, 150); });
  document.body.append(menu); menuElement = menu; placeMenu(menu, bounds);
  menu.querySelector<HTMLButtonElement>("button")?.focus();
}
function showElementMenu(element: Element): void {
  const target = mermaidTarget(element) ?? elementTarget(element);
  if (!target) return;
  showMenu(target, element.getBoundingClientRect(), element);
}
function currentSelectionMenu(): void {
  const selection = window.getSelection();
  const target = selection && textRangeTarget(selection);
  if (target && selection?.rangeCount) showMenu(target, selection.getRangeAt(0).getBoundingClientRect(), nearestElement(selection.anchorNode! ) ?? undefined);
}

function resolveSelector(value: unknown): Element | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try { const matches = Array.from(document.querySelectorAll(value)); return matches.length === 1 ? matches[0] : undefined; } catch { return undefined; }
}
function resolveTarget(target: HtmlTarget): { element?: Element; range?: Range } | undefined {
  const element = resolveSelector(target.selector);
  if (!element) return undefined;
  if (target.type === "html-element") {
    if (element.tagName.toLowerCase() !== target.tag || JSON.stringify(pathFor(element, document)) !== JSON.stringify(target.path)) return undefined;
    if (evidence(element.textContent ?? "") !== target.text) return undefined;
    return { element };
  }
  if (target.type === "mermaid-node") {
    const node = element.closest<SVGElement>("svg .node, svg [data-node-id]");
    const svg = node?.closest("svg");
    const diagram = node?.closest<HTMLElement>("[data-diagram-id], .mermaid, [id^=mermaid]");
    if (!node || node !== element || node.getAttribute("data-node-id") !== target.nodeId && node.id !== target.nodeId) return undefined;
    if ((diagram?.dataset.diagramId || diagram?.id || svg?.id) !== target.diagramId || evidence(node.textContent ?? "") !== target.label) return undefined;
    return { element: node };
  }
  const commonAncestor = resolveSelector(target.commonAncestorSelector);
  if (!commonAncestor) return undefined;
  const startRoot = resolveSelector(target.start.selector);
  const endRoot = resolveSelector(target.end.selector);
  if (!startRoot || !endRoot) return undefined;
  const startNode = nodeAt(startRoot, target.start.path);
  const endNode = nodeAt(endRoot, target.end.path);
  if (!startNode || !endNode || !commonAncestor.contains(startNode) || !commonAncestor.contains(endNode)) return undefined;
  const validOffset = (node: Node, offset: number): boolean => node.nodeType === Node.TEXT_NODE ? offset <= node.textContent!.length : offset <= node.childNodes.length;
  if (!validOffset(startNode, target.start.offset) || !validOffset(endNode, target.end.offset)) return undefined;
  try {
    const range = document.createRange(); range.setStart(startNode, target.start.offset); range.setEnd(endNode, target.end.offset);
    const raw = range.toString();
    if (!raw || (raw.length <= target.exactText.length ? raw !== target.exactText : !raw.startsWith(target.exactText)) || evidence(raw) !== target.text) return undefined;
    return { element: commonAncestor, range };
  } catch { return undefined; }
}

type Annotation = { id: string; kind: "comment" | "replace" | "delete"; target: HtmlTarget; replacement?: string };
const resolvedRanges = new Map<string, Range>();
function highlights(): { delete: (name: string) => void; set: (name: string, value: unknown) => void } | undefined {
  return (window as unknown as { CSS?: { highlights?: { delete: (name: string) => void; set: (name: string, value: unknown) => void } } }).CSS?.highlights;
}
function makeHighlight(ranges: Range[]): unknown {
  const HighlightConstructor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  return HighlightConstructor ? new HighlightConstructor(...ranges) : undefined;
}
function clearAnnotations(): void {
  document.querySelectorAll<HTMLElement>("[data-richie-feedback-ids]").forEach((element) => {
    element.removeAttribute("data-richie-feedback-ids"); element.removeAttribute("data-richie-kinds");
    element.classList.remove("richie-html-annotated-target", "richie-html-kind-comment", "richie-html-kind-replace", "richie-html-kind-delete");
  });
  resolvedRanges.clear();
  const store = highlights(); ["richie-comment", "richie-replace", "richie-delete"].forEach((name) => store?.delete(name));
}
let lastAnnotations: unknown[] = [];
function showAnnotations(value: unknown): void {
  lastAnnotations = Array.isArray(value) ? value : [];
  clearAnnotations();
  const resolvedIds: string[] = []; const unresolvedIds: string[] = []; const reasons: Record<string, string> = {};
  const byKind = new Map<string, Range[]>();
  if (Array.isArray(value)) value.forEach((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string" || (raw.kind !== "comment" && raw.kind !== "replace" && raw.kind !== "delete")) return;
    const target = parseHtmlTarget(raw.target);
    if (!target) { unresolvedIds.push(raw.id); reasons[raw.id] = "Malformed target"; return; }
    const result = resolveTarget(target);
    if (!result) { unresolvedIds.push(raw.id); reasons[raw.id] = "Target evidence no longer matches"; return; }
    resolvedIds.push(raw.id);
    if (result.range) { resolvedRanges.set(raw.id, result.range); byKind.set(raw.kind, [...(byKind.get(raw.kind) ?? []), result.range]); }
    if (result.element) {
      const annotated = result.element as HTMLElement;
      const ids = `${annotated.dataset.richieFeedbackIds ?? ""} ${raw.id}`.trim();
      annotated.dataset.richieFeedbackIds = ids;
      annotated.dataset.richieKinds = `${annotated.dataset.richieKinds ?? ""} ${raw.kind}`.trim();
      annotated.classList.add("richie-html-annotated-target", `richie-html-kind-${raw.kind}`);
    }
  });
  const store = highlights(); byKind.forEach((ranges, kind) => { const highlight = makeHighlight(ranges); if (highlight) store?.set(`richie-${kind}`, highlight); });
  post({ type: "richie-html-annotations-applied", resolvedIds, unresolvedIds, reasons });
}
function feedbackIdsForTarget(target: EventTarget | null): string[] {
  const element = (target as Element | null)?.closest?.<HTMLElement>("[data-richie-feedback-ids]");
  return element?.dataset.richieFeedbackIds?.split(/\s+/).filter(Boolean) ?? [];
}

function renderMermaidFallback(): void {
  document.querySelectorAll<HTMLElement>(".mermaid, [data-mermaid]").forEach((container, index) => {
    if (container.dataset.richieMermaidProcessed || container.querySelector("svg")) return;
    const source = container.textContent?.trim() ?? "";
    if (!source) return;
    container.dataset.richieMermaidProcessed = "true";
    const diagramId = container.dataset.diagramId || container.id || `mermaid-diagram-${index + 1}`;
    const nodes = [...source.matchAll(/(?:^|\n|--)\s*([A-Za-z][\w-]*)\s*\[([^\]]+)\]/g)].map((match) => ({ id: match[1], label: match[2] }));
    if (!nodes.length) {
      const note = document.createElement("p"); note.textContent = "Mermaid preview unavailable; source retained below."; container.prepend(note); return;
    }
    const sourceDetails = document.createElement("details"); sourceDetails.className = "richie-html-mermaid-source"; sourceDetails.open = true;
    const summary = document.createElement("summary"); summary.textContent = "Mermaid source (reviewable fallback)";
    const pre = document.createElement("pre"); pre.textContent = source; sourceDetails.append(summary, pre);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", `0 0 560 ${Math.max(80, nodes.length * 64)}`); svg.setAttribute("role", "img"); svg.id = `${diagramId}-svg`; svg.dataset.diagramId = diagramId;
    nodes.forEach((entry, nodeIndex) => {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g"); group.classList.add("node"); group.id = entry.id; group.dataset.nodeId = entry.id; group.dataset.diagramId = diagramId;
      const box = document.createElementNS("http://www.w3.org/2000/svg", "rect"); box.setAttribute("x", "20"); box.setAttribute("y", String(20 + nodeIndex * 64)); box.setAttribute("width", "240"); box.setAttribute("height", "40"); box.setAttribute("rx", "5"); box.setAttribute("fill", "#fff4c2"); box.setAttribute("stroke", "#6b4f1d");
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text"); text.setAttribute("x", "35"); text.setAttribute("y", String(45 + nodeIndex * 64)); text.textContent = entry.label; group.append(box, text); svg.append(group);
    });
    container.replaceChildren(svg, sourceDetails); container.dataset.diagramId = diagramId;
  });
}

installStyles();
renderMermaidFallback();
const observer = new MutationObserver(() => { renderMermaidFallback(); if (lastAnnotations.length) showAnnotations(lastAnnotations); });
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

document.addEventListener("pointerover", (event) => {
  const element = (event.target as Element | null)?.closest("*");
  if (!element || ignored(element) || element === hoveredTarget || window.getSelection()?.toString()) return;
  window.clearTimeout(showTimer); pendingTarget = element;
  showTimer = window.setTimeout(() => { if (pendingTarget === element && element.matches(":hover")) showElementMenu(element); }, 220);
});
document.addEventListener("pointerout", (event) => { if (pendingTarget && (event.target as Element | null)?.closest("*") === pendingTarget) { window.clearTimeout(showTimer); pendingTarget = undefined; } });
document.addEventListener("click", (event) => {
  if ((event.target as Element | null)?.closest(".richie-html-ui")) return;
  const element = (event.target as Element | null)?.closest("*");
  if (element && !ignored(element) && !window.getSelection()?.toString()) showElementMenu(element);
  const ids = feedbackIdsForTarget(event.target);
  if (ids.length) post({ type: "richie-html-feedback", ids });
});
document.addEventListener("mouseup", () => window.setTimeout(currentSelectionMenu, 0));
document.addEventListener("contextmenu", (event) => { if (textRangeTarget(window.getSelection()!)) event.preventDefault(); });
document.addEventListener("keydown", (event) => {
  const target = event.target as Element | null;
  if (target?.closest("input,textarea,select,[contenteditable=true],button,a")) return;
  if (event.key === "Escape") { if (menuElement) { event.preventDefault(); closeMenu(); } return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const kind = event.key === "c" ? "comment" : event.key === "r" ? "replace" : event.key === "d" ? "delete" : undefined;
  if (!kind) return;
  const selection = window.getSelection(); const candidate = selection && textRangeTarget(selection);
  if (!candidate) return;
  event.preventDefault(); post({ type: "richie-html-target", kind, target: candidate });
});

function announceReady(): void { post({ type: "richie-html-ready" }); }
const readyTimer = window.setInterval(announceReady, 250);
announceReady();
window.addEventListener("message", (event) => {
  if (event.source !== parent || !isRecord(event.data) || event.data.correlation !== correlation || event.data.frameCapability !== frameCapability) return;
  if (event.data.type === "richie-html-operations") { window.clearInterval(readyTimer); showAnnotations(event.data.operations); return; }
  if (event.data.type !== "richie-html-jump" || typeof event.data.operationId !== "string") return;
  const target = parseHtmlTarget(event.data.target);
  const result = target ? resolveTarget(target) : undefined;
  if (result?.range) {
    const store = highlights(); const highlight = makeHighlight([result.range]); if (highlight) store?.set("richie-jump", highlight);
    result.range.startContainer.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => store?.delete("richie-jump"), 1400);
  } else if (result?.element) {
    result.element.classList.add("richie-html-jump-target"); result.element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => result.element?.classList.remove("richie-html-jump-target"), 1400);
  }
  post({ type: "richie-html-resolved", operationId: event.data.operationId, resolved: Boolean(result), reason: result ? undefined : "Target evidence no longer matches" });
});
