import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { chmod, mkdir, readFile, rm, realpath, writeFile, rename, open } from "node:fs/promises";
import { basename, dirname, join, resolve, relative, extname, isAbsolute, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadLocalImage, MediaError } from "./media.js";
import { documentKindForPath, hasOpenOperations, newState, nextCommentedPath, readSourceSnapshot, readState, renderCommentedMarkdown, sha256, writeState } from "./store.js";
import { parseHtmlTarget } from "./html-target.js";
import { ensureReviewDirectory, htmlCommentedPath, reviewSidecarPath } from "./paths.js";
import { renderReviewHtml } from "./render.js";
import type { HtmlTarget, ReviewOperation, ReviewOutcome, ReviewState, Session } from "./types.js";

const port = Number(process.env.RICHIE_HTTP_PORT ?? 43173);
const socket = process.env.RICHIE_CONTROL_SOCKET ?? "/run/richie/control.sock";
const here = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(here, "..", "public");
const style = `
:root{color-scheme:light;--base:#faf4ed;--surface:#fffaf3;--overlay:#f2e9de;--muted:#9893a5;--subtle:#797593;--text:#575279;--pine:#286983;--foam:#56949f;--rose:#d7827e;--love:#b4637a;--gold:#ea9d34;--iris:#907aa9;--border:#dfd6cc}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--base);color:var(--text);font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px 350px 56px;transition:padding-left .18s ease}
body.navigation-collapsed{padding-left:48px}
#document{max-width:900px;margin:0 auto}#html-artifact{display:block;width:100%;height:calc(100dvh - 96px);min-height:78vh;border:1px solid var(--border);background:#fff}
body.navigation-collapsed #document{max-width:none}
#file-breadcrumb{display:flex;align-items:center;gap:8px;margin:0 0 22px;padding:5px 6px 5px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:0 3px 12px rgba(87,82,121,.05);overflow:hidden;color:var(--subtle);font-size:.78rem;line-height:1.3}
#file-breadcrumb ol{display:flex;flex:1;align-items:center;min-width:0;margin:0;padding:0;list-style:none}
#file-breadcrumb .copy-path{flex:none;width:28px;height:28px;padding:5px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--subtle)}#file-breadcrumb .copy-path:hover,#file-breadcrumb .copy-path:focus-visible,#file-breadcrumb .copy-path.copied{border-color:var(--border);background:var(--overlay);color:var(--pine)}#file-breadcrumb .copy-path svg{display:block;width:100%;height:100%;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.8}
#file-breadcrumb li{display:flex;align-items:center;min-width:0}
#file-breadcrumb li:not(:last-child)::after{content:"/";margin:0 7px;color:var(--border)}
#file-breadcrumb li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#file-breadcrumb li[aria-current=page] span{max-width:32ch;color:var(--text);font-weight:700}
#toolbar{display:grid;gap:8px;margin:0 0 14px;padding:0 0 14px;border-bottom:1px solid var(--border)}
#toolbar button{width:100%;min-height:36px}
.search-box{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:.82rem;color:var(--subtle)}
.search-box span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.search-box input{width:190px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:#fffaf3;color:var(--text);font:inherit;font-size:.9rem}
.search-box output{min-width:44px;color:var(--subtle);font-variant-numeric:tabular-nums}
button{padding:7px 11px;border:1px solid var(--border);border-radius:7px;background:var(--overlay);color:var(--text);font:inherit;font-size:.9rem;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .15s ease}
button:hover{background:#eadfd2;border-color:var(--rose);transform:translateY(-1px)}
button:focus-visible{outline:3px solid rgba(144,122,169,.35);outline-offset:2px}
dialog{width:min(520px,calc(100vw - 32px));padding:0;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);box-shadow:0 18px 60px rgba(87,82,121,.28)}
dialog.input-dialog[open]{display:flex;flex-direction:column;position:fixed;inset:50% auto auto 50%;width:min(520px,calc(100vw - 16px));height:min(360px,calc(100vh - 16px));margin:0;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);min-width:min(520px,calc(100vw - 16px));min-height:min(360px,calc(100vh - 16px));resize:both;overflow:auto;transform:translate(-50%,-50%)}
dialog::backdrop{background:rgba(40,34,56,.38)}
dialog form{padding:20px}
dialog.input-dialog form{display:flex;flex:1;min-height:0;flex-direction:column}
dialog h2{margin:0 0 8px;font-size:1.25rem}
dialog.input-dialog h2{cursor:move;touch-action:none}
dialog p{margin:0 0 16px;white-space:pre-wrap}
dialog label{display:grid;gap:6px;margin:14px 0}
dialog.input-dialog label{display:flex;flex:1;min-height:0;flex-direction:column}
dialog textarea{width:100%;min-height:110px;resize:vertical;padding:9px 11px;border:1px solid var(--border);border-radius:7px;background:#fff;color:var(--text);font:inherit}
dialog.input-dialog textarea{flex:1;min-height:0;resize:none}
dialog menu{display:flex;flex-direction:row-reverse;justify-content:flex-start;gap:8px;margin:18px 0 0;padding:0}
dialog [hidden]{display:none}
dialog button[value=confirm]{background:var(--pine);border-color:var(--pine);color:#fffaf3}
dialog button.destructive{background:var(--love);border-color:var(--love)}
#toolbar button[data-action=document-note]{background:var(--foam);border-color:var(--foam);color:#fffaf3}
#toolbar button[data-action=document-note]:hover{background:#3f7e86}
#toolbar button[data-action=finish]{background:var(--pine);border-color:var(--pine);color:#fffaf3}
#toolbar button[data-action=finish]:hover{background:#20556a}
#toolbar button[data-action=abort]{background:var(--love);border-color:var(--love);color:#fffaf3}
#toolbar button[data-action=abort]:hover{background:#9f5369}
h1,h2,h3{color:var(--text);line-height:1.2;letter-spacing:-.02em;scroll-margin-top:24px}
h1{font-size:2.2rem;margin:1.4em 0 .55em;padding-bottom:.25em;border-bottom:2px solid var(--rose)}
h2{font-size:1.55rem;margin-top:1.8em;color:var(--pine)}
h3{font-size:1.2rem;color:var(--iris)}
a{color:var(--pine);text-decoration-thickness:1.5px;text-underline-offset:3px}
a:hover{color:var(--love)}
blockquote{margin:1.4em 0;padding:12px 18px;background:var(--surface);border-left:4px solid var(--rose);border-radius:0 8px 8px 0;color:var(--subtle)}
hr{border:0;border-top:1px solid var(--border);margin:2.2rem 0}
.table-scroll{max-width:100%;margin:1.4rem 0;overflow-x:auto;overscroll-behavior-inline:contain}
table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 5px 16px rgba(87,82,121,.06)}
td{padding:10px 13px;border-top:1px solid var(--border);vertical-align:top}
tr:first-child td{background:var(--pine);border-top:0;color:#fffaf3;font-weight:700}
tr:nth-child(odd):not(:first-child) td{background:var(--surface)}
tr:nth-child(even) td{background:var(--overlay)}
tr:hover td{background:#f0d9d2}
pre{position:relative;overflow:auto;margin:1.2rem 0;padding:16px 18px;background:var(--overlay);border:1px solid var(--border);border-left:4px solid var(--iris);border-radius:9px;color:var(--text);font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;box-shadow:0 4px 14px rgba(87,82,121,.05)}
.copy-block{position:absolute;top:8px;right:8px;z-index:2;width:30px;height:30px;padding:5px;border:1px solid transparent;border-radius:6px;background:rgba(255,250,243,.82);color:var(--subtle);opacity:0;transform:none;transition:opacity .15s ease,background .15s ease,color .15s ease,border-color .15s ease}.copy-block svg{display:block;width:100%;height:100%;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.8}.copy-block:hover,.copy-block:focus-visible,.copy-block.copied,.copy-block.copy-failed{background:var(--surface);border-color:var(--border);color:var(--pine);transform:none}.copy-block.copied{color:var(--foam)}.copy-block.copy-failed{color:var(--love)}pre>.copy-block{position:sticky;top:8px;left:calc(100% - 38px);right:auto;float:right;margin:0 0 -30px 8px}pre:hover>.copy-block,.mermaid-source:hover>.copy-block,.copy-block:focus-visible{opacity:1}
code{font:0.92em ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
:not(pre)>code{padding:2px 5px;background:var(--overlay);border-radius:4px;color:var(--love)}
.media-target{position:relative;display:inline-flex;max-width:100%;flex-direction:column;vertical-align:middle;border-radius:8px;text-decoration:none}
.media-target img{display:block;max-width:100%;max-height:70vh;object-fit:contain;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.media-target[data-media-state=loading] img{opacity:.72}
.media-fallback{display:grid;gap:6px;min-width:min(360px,80vw);padding:12px;border:1px dashed var(--love);border-radius:8px;background:var(--overlay);color:var(--text)}
.media-fallback[hidden]{display:none}
.media-fallback strong{color:var(--love)}
.media-fallback code{overflow-wrap:anywhere;white-space:pre-wrap}
.media-target.review-target[data-review-kind=comment]{box-shadow:0 0 0 3px rgba(86,148,159,.2)}
.media-target.review-target[data-review-kind=delete]{overflow:hidden;background:repeating-linear-gradient(135deg,rgba(180,99,122,.05),rgba(180,99,122,.05) 12px,rgba(180,99,122,.22) 12px,rgba(180,99,122,.22) 18px);text-decoration:none}
.media-target.review-target[data-review-kind=delete]>*{opacity:.42}
.media-target.review-target[data-review-kind=delete]::after{content:"Delete image";position:absolute;inset:50% auto auto 50%;padding:4px 8px;transform:translate(-50%,-50%);border-radius:5px;background:var(--love);color:#fffaf3;font-weight:700;white-space:nowrap}
.media-target.review-target[data-review-kind=replace]>*{opacity:.52;text-decoration:none}
.media-target.review-target[data-review-kind=replace][data-review-replacement]::after{position:static;content:"Replacement: " attr(data-review-replacement);display:block;margin-top:5px;padding:5px 7px;background:#fffaf3;border-left:3px solid var(--gold);color:var(--text);font-style:normal;font-weight:600;text-decoration:none;white-space:pre-wrap}
.mermaid{position:relative;overflow:auto;margin:1.5rem 0 0;padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 5px 16px rgba(87,82,121,.06)}
.mermaid svg{display:block;max-width:100%;height:auto;margin:auto}
.mermaid-source{position:relative;margin:0 0 1.5rem;padding:0;background:var(--surface);border:1px solid var(--border);border-top:0;border-radius:0 0 10px 10px;overflow:hidden}
.mermaid-source summary{padding:9px 14px;background:var(--overlay);color:var(--pine);font-weight:700;cursor:pointer;user-select:none}
.mermaid-source summary:hover{background:#eadfd2}
.mermaid-source pre{margin:0;border:0;border-radius:0;box-shadow:none}
.mermaid-source-line,.code-source-line{display:block;min-height:1.6em}
.mermaid-source-line:hover,.code-source-line:hover{background:rgba(215,130,126,.18)}
.hljs-comment,.hljs-quote{color:var(--muted);font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-type{color:var(--love);font-weight:600}
.hljs-string,.hljs-attribute,.hljs-symbol,.hljs-bullet{color:var(--pine)}
.hljs-number,.hljs-literal,.hljs-variable,.hljs-template-variable{color:var(--gold)}
.hljs-title,.hljs-section,.hljs-function .hljs-title{color:var(--iris);font-weight:600}
.hljs-operator,.hljs-punctuation{color:var(--subtle)}
#panel,#navigation{position:fixed;top:20px;display:flex;flex-direction:column;width:290px;height:calc(100vh - 40px);overflow:hidden;padding:14px;background:var(--surface);border:1px solid var(--border);border-top:4px solid var(--rose);border-radius:10px;box-shadow:0 10px 30px rgba(87,82,121,.14);color:var(--text)}
#panel{right:20px}#navigation{left:20px;border-top-color:var(--foam);transition:opacity .18s ease,transform .18s ease}#navigation.is-collapsed{opacity:0;pointer-events:none;transform:translateX(-calc(100% + 24px))}
#navigation-toggle{background:var(--iris);border-color:var(--iris);color:#fffaf3}#navigation-toggle:hover{background:#725f88;border-color:#725f88}
#toolbar,#guide-link,#navigation .search-box,.panel-heading{flex:none}
#guide-link{display:block;margin:0 0 14px;padding:7px 9px;background:var(--overlay);border-radius:7px;font-weight:700;text-decoration:none}
#guide-link:hover{background:#eadfd2}
#navigation .search-box{margin:0 0 14px;padding-bottom:14px;border-bottom:1px solid var(--border)}
#navigation .search-box input{width:100%}
#navigation .search-box button{flex:1 1 0;min-width:0;min-height:34px;padding:5px 7px;font-size:.78rem;white-space:nowrap}
#panel strong{color:var(--pine)}
.panel-heading{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
#feedback-count{color:var(--subtle);font-size:.8rem}
#operations,#outline{min-height:0;overflow:auto}
#operations{flex:1;margin-top:8px}
#outline{flex:1}
.operation-card{margin:8px 0;padding:9px;background:var(--overlay);border-radius:7px;font-size:.84rem;overflow-wrap:anywhere;border-left:3px solid var(--foam);scroll-margin:12px}.operation-card:focus{outline:2px solid var(--foam);outline-offset:2px}.operation-card.feedback-focus{animation:feedback-focus .9s ease}@keyframes feedback-focus{0%,100%{box-shadow:0 0 0 0 rgba(86,148,159,0)}35%{box-shadow:0 0 0 5px rgba(86,148,159,.4)}}
.operation-card[data-kind=delete]{border-left-color:var(--love)}
.operation-card[data-kind=replace]{border-left-color:var(--gold)}
.html-resolution-status{display:block;margin-top:6px;padding:4px 6px;border-left:3px solid var(--love);background:rgba(180,99,122,.12);color:var(--love);font-weight:700}
.operation-location-evidence{display:block;color:var(--subtle);font-size:.78rem;overflow-wrap:anywhere}
.operation-meta{display:flex;justify-content:space-between;gap:8px;color:var(--subtle);font-size:.76rem;text-transform:capitalize}
.operation-quote{display:block;margin:5px 0;color:var(--text);font-style:italic}
.operation-detail{margin:0;color:var(--text)}
.operation-actions{display:flex;gap:6px;margin-top:7px}
.operation-actions button{padding:4px 7px;font-size:.78rem}
.operation-actions button[data-action=remove-operation]{color:var(--love)}
#outline-items{margin-top:6px}
.outline-link{display:block;width:100%;padding:4px 6px;border:0;background:transparent;text-align:left;color:var(--subtle);font:inherit;font-size:.82rem;cursor:pointer;border-radius:4px}
.outline-link:hover{background:var(--overlay);color:var(--pine);transform:none}
.outline-link[data-depth="2"]{padding-left:16px}.outline-link[data-depth="3"]{padding-left:28px}
.review-target{outline:2px solid rgba(215,130,126,.55);outline-offset:3px;border-radius:3px}
.review-target[data-review-kind=delete]{background:rgba(180,99,122,.15);text-decoration:line-through;text-decoration-thickness:2px}
.review-target[data-review-kind=replace]{background:rgba(234,157,52,.18)}
.review-target[data-review-kind=replace][data-review-replacement]>*{text-decoration:line-through;text-decoration-color:var(--gold);text-decoration-thickness:2px}
.review-target[data-review-kind=replace][data-review-replacement]::after{content:"Replacement: " attr(data-review-replacement);display:block;margin-top:5px;padding:3px 6px;background:#fffaf3;border-left:3px solid var(--gold);color:var(--text);font-style:normal;font-weight:600;text-decoration:none;white-space:pre-wrap}
.review-target[data-review-kind=comment]{background:rgba(86,148,159,.16)}
.math-target{position:relative;display:inline-block;cursor:pointer;border-radius:4px}.math-display{display:block;overflow-x:auto;overflow-y:hidden;margin:1.2rem 0 0;padding:12px;background:var(--surface);border:1px solid var(--border)}.math-rendered{display:block}.math-source{position:absolute;inset:0;z-index:1;display:block;overflow:hidden;color:transparent;white-space:pre;cursor:text;user-select:text;pointer-events:none}.math-source::selection{background:rgba(234,157,52,.45)}.math-inline.math-selecting{display:inline}.math-inline.math-selecting .math-rendered{display:none}.math-inline.math-selecting .math-source{position:static;display:inline;overflow:visible;color:var(--text);background:var(--surface);padding:0 3px;pointer-events:auto}
.review-replacement-inline{position:relative;z-index:2;display:inline;padding:1px 4px;color:var(--text)!important;background:rgba(234,157,52,.18);border-bottom:2px solid var(--gold);font-weight:600;white-space:pre-wrap}
.backlink-active{position:relative;z-index:2;outline:4px solid var(--gold)!important;outline-offset:4px!important;box-shadow:0 0 0 8px rgba(234,157,52,.3),0 0 22px 8px rgba(234,157,52,.45)!important;animation:backlink-pulse .7s ease-in-out 3}@keyframes backlink-pulse{0%,100%{filter:none}50%{filter:brightness(1.25)}}
.review-column-target{outline:2px solid rgba(215,130,126,.55);outline-offset:-2px}
.review-column-target[data-review-kind=delete]{background:rgba(180,99,122,.15);text-decoration:line-through;text-decoration-thickness:2px}
.review-column-target[data-review-kind=replace]{background:rgba(234,157,52,.18)}
.review-column-target[data-review-kind=comment]{background:rgba(86,148,159,.16)}
.search-match{background:rgba(144,122,169,.28);border-radius:2px}
.search-current{background:rgba(234,157,52,.55)}
::highlight(richie-comment){background:rgba(86,148,159,.24);text-decoration:underline;text-decoration-color:var(--foam);text-decoration-thickness:2px}
::highlight(richie-replace){background:rgba(234,157,52,.28);text-decoration:line-through;text-decoration-color:var(--gold);text-decoration-thickness:2px}
::highlight(richie-delete){background:rgba(180,99,122,.22);text-decoration:line-through;text-decoration-color:var(--love);text-decoration-thickness:2px}
::highlight(richie-search){background:rgba(144,122,169,.3)}
::highlight(richie-search-current){background:rgba(234,157,52,.6)}
.richie-target-menu{display:none;position:fixed;gap:4px;padding:5px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 22px rgba(87,82,121,.18);white-space:nowrap;z-index:10}
.richie-target-menu .richie-target{margin:0}
li:has(>input[type=checkbox])>p{display:inline}
li>input[type=checkbox]{margin:0 7px 0 0;vertical-align:.05em}
.richie-hover{outline:1px dashed var(--rose);outline-offset:3px;border-radius:3px}
#stale-banner{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:900px;margin:0 auto 16px;padding:10px 14px;background:var(--love);color:#fffaf3;border-radius:8px;font-size:.92rem}#stale-banner button{flex:none;background:#fffaf3;border-color:#fffaf3;color:var(--love);font-size:.82rem}#stale-banner button:hover{background:#eadfd2;border-color:#eadfd2}
.review-note{color:var(--love);font-size:.9em}
@media(max-width:1300px){body,body.navigation-collapsed{padding:16px}#panel,#navigation{position:static;display:block;width:auto;height:auto;overflow:visible;margin:0 auto 20px;max-width:900px}#navigation.is-collapsed{display:none}#operations,#outline{overflow:visible}.search-box input{width:min(190px,50vw)}}
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function renderFileBreadcrumb(sourcePath: string): string {
  const parts = sourcePath.split("/").filter(Boolean);
  const crumbs = ["/"];
  if (parts.length) crumbs.push(...parts);
  const copyIcon = `<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>`;
  return `<nav id="file-breadcrumb" aria-label="File path" title="${escapeHtml(sourcePath)}"><ol>${crumbs.map((part, index) => `<li${index === crumbs.length - 1 ? ' aria-current="page"' : ""}><span>${escapeHtml(part)}</span></li>`).join("")}</ol><button class="copy-path" type="button" data-copy-source="${escapeHtml(sourcePath)}" data-copy-label="Copy file path" aria-label="Copy file path" title="Copy file path">${copyIcon}</button></nav>`;
}

function send(response: ServerResponse, code: number, value: unknown, contentType = "application/json"): void {
  response.writeHead(code, { "content-type": contentType, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(contentType === "application/json" ? JSON.stringify(value) : String(value));
}
function sendMedia(response: ServerResponse, body: Buffer, contentType: string, filename: string): void {
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "content-disposition": `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}
async function body(request: IncomingMessage): Promise<unknown> {
  let output = "";
  for await (const chunk of request) output += chunk;
  if (!output) return {};
  try { return JSON.parse(output) as unknown; } catch { return null; }
}
function bodyEndIndex(html: string): number {
  // Tokenise raw-text elements and comments so a literal </body> in a script
  // cannot become the injection point. The last real body close is the stable
  // insertion point for otherwise-readable HTML.
  const tokens = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<\/body\s*>/gi;
  let match: RegExpExecArray | null; let close = -1;
  while ((match = tokens.exec(html))) if (/^<\/body/i.test(match[0])) close = match.index;
  return close;
}
export function injectSdk(html: string, url: string): string {
  // url is generated by the service, but escaping it here keeps this pure helper
  // safe if it is reused by another caller.
  const safeUrl = url.replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/[<>]/g, "");
  const tag = `<script src="${safeUrl}"></script>`;
  const index = bodyEndIndex(html);
  return index < 0 ? `${html}${tag}` : `${html.slice(0, index)}${tag}${html.slice(index)}`;
}
const assetMimes: Record<string, string> = {
  ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};
const mime = (path: string): string | undefined => assetMimes[extname(path).toLowerCase()];
const artifactCsp = [
  "default-src 'none'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self' data:", "connect-src 'none'", "object-src 'none'",
  "media-src 'none'", "frame-src 'none'", "child-src 'none'", "worker-src 'none'", "manifest-src 'none'",
  "form-action 'none'", "base-uri 'none'", "navigate-to 'none'",
].join("; ");
function parseRange(value: unknown): ReviewOperation["range"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { start?: Record<string, unknown>; end?: Record<string, unknown> };
  const validPosition = (position: unknown): position is { offset: number; line?: number; column?: number } => {
    if (!position || typeof position !== "object" || Array.isArray(position)) return false;
    const value = position as Record<string, unknown>;
    return Number.isInteger(value.offset) && Number(value.offset) >= 0
      && (value.line === undefined || Number.isInteger(value.line) && Number(value.line) >= 0)
      && (value.column === undefined || Number.isInteger(value.column) && Number(value.column) >= 0);
  };
  const normalized = (position: { offset: number; line?: number; column?: number }): NonNullable<ReviewOperation["range"]>["start"] => ({ offset: position.offset, line: position.line ?? 0, column: position.column ?? 0 });
  if (!validPosition(candidate.start) || !validPosition(candidate.end)) return null;
  return { start: normalized(candidate.start), end: normalized(candidate.end) };
}
function artifactRelativePath(value: string): string | undefined {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return undefined; }
  if (!decoded || decoded.includes("\0") || decoded.includes("\\") || isAbsolute(decoded) || /^[A-Za-z]:[\\/]/.test(decoded)) return undefined;
  const segments = decoded.split("/");
  if (segments.some((segment) => segment === ".." || segment === "" && segments.length > 1)) return undefined;
  return decoded;
}
async function readConfinedAsset(root: string, relativePath: string): Promise<{ body: Buffer; contentType: string } | undefined> {
  const path = artifactRelativePath(relativePath);
  if (!path) return undefined;
  const lexical = resolve(root, path);
  const lexicalRelative = relative(root, lexical);
  if (lexicalRelative === "" || lexicalRelative.startsWith(`..${sep}`) || isAbsolute(lexicalRelative)) return undefined;
  try {
    const resolved = await realpath(lexical);
    const resolvedRelative = relative(root, resolved);
    if (resolvedRelative === "" || resolvedRelative.startsWith(`..${sep}`) || isAbsolute(resolvedRelative)) return undefined;
    const contentType = mime(resolved);
    if (!contentType) return undefined;
    const handle = await open(resolved, "r");
    try {
      const details = await handle.stat();
      if (!details.isFile()) return undefined;
      return { body: await handle.readFile(), contentType };
    } finally { await handle.close(); }
  } catch { return undefined; }
}

export function renderReviewPage(session: Pick<Session, "id" | "token" | "sourcePath"> & Partial<Pick<Session, "documentKind" | "artifactNonce">>, source: string, stale = false): string {
  const isHtml = session.documentKind === "html";
  const banner = stale ? `<div id="stale-banner"><span>The ${isHtml ? "HTML " : "Markdown "}source changed after this review started. Highlights may be misaligned and new feedback is blocked. Restore the source or abort the review.</span><button type="button" data-action="reload-source">Reload new draft</button></div>` : "";
  const localImageUrl = (path: string): string => `/api/media/${encodeURIComponent(session.id)}?token=${encodeURIComponent(session.token)}&path=${encodeURIComponent(path)}`;
  return `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Richie: ${escapeHtml(session.sourcePath)}</title><style>${style}</style>${banner}<aside id="panel"><div id="toolbar"><button id="navigation-toggle" type="button" aria-controls="navigation" aria-expanded="true">Hide navigation</button><button data-action="document-note">Document level note</button><button data-action="abort">Abort review</button><button data-action="finish">Finish review</button></div><div class="panel-heading"><strong>Review feedback</strong><span id="feedback-count" aria-live="polite">0 open</span></div><div id="operations"></div></aside><aside id="navigation"><a id="guide-link" href="/guide" target="_blank" rel="noreferrer">User guide</a><div class="search-box" role="search"><label for="document-search"><span>Find in document</span></label><input id="document-search" type="search" placeholder="Search…" autocomplete="off"><output id="search-count" aria-live="polite"></output><button data-action="search-previous" aria-label="Previous search match">Previous match</button><button data-action="search-next" aria-label="Next search match">Next match</button></div><nav id="outline" aria-label="Document outline"><strong>Document outline</strong><div id="outline-items"></div></nav></aside><main id="document">${renderFileBreadcrumb(session.sourcePath)}${isHtml ? `<iframe id="html-artifact" title="Reviewed HTML artifact" sandbox="allow-scripts" src="/artifact/${session.id}/index.html?n=${encodeURIComponent(session.artifactNonce ?? session.id)}" referrerpolicy="no-referrer"></iframe>` : renderReviewHtml(source, { localImageUrl })}</main><dialog id="richie-dialog"><form method="dialog"><h2 id="richie-dialog-title" title="Drag to move this dialog"></h2><p id="richie-dialog-message"></p><label id="richie-dialog-field"><span></span><textarea id="richie-dialog-input"></textarea></label><menu><button value="confirm">Confirm</button><button value="cancel">Cancel</button></menu></form></dialog><script>window.__RICHIE__=${JSON.stringify({ id: session.id, token: session.token, documentKind: session.documentKind ?? "markdown", artifactNonce: session.artifactNonce ?? session.id })}</script><script type="module" src="/assets/client.js"></script>`;
}

export class RichieService {
  private readonly sessions = new Map<string, Session>();
  private readonly byPath = new Map<string, string>();
  private readonly waiters = new Map<string, Set<(outcome: ReviewOutcome) => void>>();
  private readonly transitions = new Map<string, Promise<ReviewOutcome>>();

  status(): { sessions: number; port: number } { return { sessions: this.byPath.size, port }; }

  waitForResult(id: string, signal?: AbortSignal): Promise<ReviewOutcome | undefined> {
    const session = this.sessions.get(id);
    if (!session) return Promise.resolve(undefined);
    if (session.outcome) return Promise.resolve(session.outcome);
    return new Promise((resolvePromise) => {
      const waiter = (outcome: ReviewOutcome): void => { cleanup(); resolvePromise(outcome); };
      const cleanup = (): void => {
        const current = this.waiters.get(id);
        current?.delete(waiter);
        if (current?.size === 0) this.waiters.delete(id);
        signal?.removeEventListener("abort", aborted);
      };
      const aborted = (): void => { cleanup(); resolvePromise(undefined); };
      const current = this.waiters.get(id) ?? new Set();
      current.add(waiter); this.waiters.set(id, current);
      signal?.addEventListener("abort", aborted, { once: true });
      if (signal?.aborted) aborted();
    });
  }

  private transition(session: Session, work: () => Promise<ReviewOutcome>): Promise<ReviewOutcome> {
    if (session.outcome) return Promise.resolve(session.outcome);
    const active = this.transitions.get(session.id);
    if (active) return active;
    const transition = work().then((outcome) => {
      session.outcome = outcome;
      this.byPath.delete(session.sourcePath);
      for (const waiter of this.waiters.get(session.id) ?? []) waiter(outcome);
      this.waiters.delete(session.id);
      return outcome;
    }).finally(() => this.transitions.delete(session.id));
    this.transitions.set(session.id, transition);
    return transition;
  }

  async createSession(inputPath: string): Promise<{ id: string; url: string }> {
    const sourcePath = await realpath(inputPath);
    const existing = this.byPath.get(sourcePath);
    if (existing) { const session = this.sessions.get(existing)!; return { id: session.id, url: this.url(session) }; }
    const snapshot = await readSourceSnapshot(sourcePath);
    const documentKind = documentKindForPath(sourcePath);
    await ensureReviewDirectory();
    const sidecarPath = reviewSidecarPath(sourcePath, snapshot.sourceSha256);
    const state = (await readState(sidecarPath, sourcePath)) ?? newState(sourcePath, snapshot.source);
    if (state.sourceSha256 !== snapshot.sourceSha256 || state.documentKind !== documentKind) throw new Error("The existing review sidecar targets a different source version or document kind. Finish or remove it before starting a new review.");
    const session: Session = { id: randomUUID(), token: randomUUID(), sourcePath, source: snapshot.source, documentKind, artifactNonce: randomUUID(), sidecarPath, state };
    this.sessions.set(session.id, session); this.byPath.set(sourcePath, session.id);
    await writeState(sidecarPath, state);
    return { id: session.id, url: this.url(session) };
  }
  private url(session: Session): string { return `http://127.0.0.1:${port}/s/${session.id}?token=${session.token}`; }
  private session(id: string, token: string | null): Session | undefined { const value = this.sessions.get(id); return value?.token === token ? value : undefined; }
  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = request.headers.host ?? "";
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(response, 421, { error: "Unexpected host" });
    const url = new URL(request.url ?? "/", `http://${host}`); const match = url.pathname.match(/^\/s\/([^/]+)$/);
    const media = url.pathname.match(/^\/api\/media\/([^/]+)$/);
    const artifact = url.pathname.match(/^\/artifact\/([^/]+)\/(.*)$/);
    const api = url.pathname.match(/^\/api\/(state|operations|reload|finish|abort)\/([^/]+)(?:\/([^/]+))?$/);
    if (url.pathname.startsWith("/assets/")) {
      if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
      const asset = url.pathname.slice("/assets/".length);
      if (!/^[A-Za-z0-9._-]+\.js$/.test(asset)) return send(response, 404, { error: "Asset not found" });
      if (asset === "html-review-sdk.js") {
        const capability = url.searchParams.get("c");
        if (!capability || ![...this.sessions.values()].some((candidate) => candidate.documentKind === "html" && !candidate.outcome && candidate.artifactNonce === capability)) return send(response, 404, { error: "Asset not found" });
      }
      try {
        const bytes = await readFile(join(publicDirectory, asset));
        response.writeHead(200, { "content-type": "text/javascript", "content-length": bytes.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
        response.end(bytes);
      } catch { return send(response, 404, { error: "Asset not found" }); }
      return;
    }
    if (artifact) {
      if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
      const session = this.sessions.get(artifact[1]);
      if (!session || session.documentKind !== "html" || session.outcome) return send(response, 404, { error: "Artifact not found" });
      if (artifact[2] === "index.html") {
        const nonce = url.searchParams.get("n");
        if (nonce !== session.artifactNonce) return send(response, 404, { error: "Artifact not found" });
        const sdk = `/assets/html-review-sdk.js?c=${encodeURIComponent(session.artifactNonce)}`;
        const output = injectSdk(session.source, sdk);
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": artifactCsp, "x-content-type-options": "nosniff" });
        response.end(output);
        return;
      }
      const asset = await readConfinedAsset(dirname(session.sourcePath), artifact[2]);
      if (!asset) return send(response, 404, { error: "Asset not found" });
      response.writeHead(200, { "content-type": asset.contentType, "content-length": asset.body.length, "cache-control": "no-store", "content-security-policy": artifactCsp, "x-content-type-options": "nosniff" });
      response.end(asset.body);
      return;
    }
    if (url.pathname === "/guide" && request.method === "GET") {
      const guide = await readFile(resolve(here, "..", "..", "user-guide.md"), "utf8");
      return send(response, 200, `<!doctype html><meta charset="utf-8"><title>Richie user guide</title><style>${style}</style><main id="document">${renderReviewHtml(guide)}</main>`, "text/html");
    }
    if (match && request.method === "GET") {
      const session = this.session(match[1], url.searchParams.get("token")); if (!session) return send(response, 404, { error: "Session not found" });
      const currentSource = await readFile(session.sourcePath, "utf8");
      const stale = sha256(currentSource) !== session.state.sourceSha256;
      return send(response, 200, renderReviewPage(session, session.source, stale), "text/html");
    }
    if (media) {
      const session = this.session(media[1], url.searchParams.get("token")); if (!session) return send(response, 404, { error: "Session not found" });
      if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
      try {
        const image = await loadLocalImage(session.sourcePath, url.searchParams.get("path") ?? "");
        return sendMedia(response, image.body, image.contentType, basename(image.resolvedPath));
      } catch (error) {
        if (error instanceof MediaError) return send(response, error.status, { error: error.message });
        throw error;
      }
    }
    if (!api) return send(response, 404, { error: "Not found" });
    const session = this.session(api[2], url.searchParams.get("token")); if (!session) return send(response, 404, { error: "Session not found" });
    if (api[1] === "state" && request.method === "GET") return send(response, 200, session.state);
    if (api[1] === "reload" && request.method === "POST") {
      const snapshot = await readSourceSnapshot(session.sourcePath);
      const sidecarPath = reviewSidecarPath(session.sourcePath, snapshot.sourceSha256);
      if (sidecarPath !== session.sidecarPath) await rm(session.sidecarPath, { force: true });
      session.source = snapshot.source;
      session.artifactNonce = randomUUID();
      session.state = newState(session.sourcePath, snapshot.source);
      session.sidecarPath = sidecarPath;
      await writeState(sidecarPath, session.state);
      return send(response, 200, { reloaded: true, sourceSha256: snapshot.sourceSha256 });
    }
    if (api[1] === "operations" && request.method === "DELETE" && api[3]) {
      if ((await readSourceSnapshot(session.sourcePath)).sourceSha256 !== session.state.sourceSha256) return send(response, 409, { error: `The ${session.documentKind === "html" ? "HTML" : "Markdown"} source changed during the review. Restore the source or abort the review.` });
      const operation = session.state.operations.find((candidate) => candidate.id === api[3]);
      if (!operation) return send(response, 404, { error: "Review operation not found" });
      if (operation.status !== "open") return send(response, 409, { error: "Only open feedback can be removed" });
      operation.status = "superseded"; operation.updatedAt = new Date().toISOString();
      await writeState(session.sidecarPath, session.state); return send(response, 200, operation);
    }
    if (api[1] === "operations" && request.method === "PATCH" && api[3]) {
      if ((await readSourceSnapshot(session.sourcePath)).sourceSha256 !== session.state.sourceSha256) return send(response, 409, { error: `The ${session.documentKind === "html" ? "HTML" : "Markdown"} source changed during the review. Restore the source or abort the review.` });
      const operation = session.state.operations.find((candidate) => candidate.id === api[3]);
      if (!operation) return send(response, 404, { error: "Review operation not found" });
      if (operation.status !== "open") return send(response, 409, { error: "Only open feedback can be edited" });
      const raw = await body(request);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return send(response, 400, { error: "Invalid operation payload" });
      const input = raw as Record<string, unknown>;
      if (operation.kind === "comment" && typeof input.comment === "string" && input.comment.trim() && input.comment.length <= 16_384 && input.replacement === undefined) operation.comment = input.comment;
      else if (operation.kind === "replace" && typeof input.replacement === "string" && input.replacement.trim() && input.replacement.length <= 16_384 && input.comment === undefined) operation.replacement = input.replacement;
      else return send(response, 400, { error: "Nothing to update for this operation" });
      operation.updatedAt = new Date().toISOString();
      await writeState(session.sidecarPath, session.state); return send(response, 200, operation);
    }
    if (api[1] === "operations" && request.method === "POST") {
      const raw = await body(request);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return send(response, 400, { error: "Invalid operation payload" });
      const input = raw as Record<string, unknown>;
      const parsedRange = input.range === undefined ? undefined : parseRange(input.range);
      const range = parsedRange ?? undefined;
      const target = input.target === undefined ? undefined : parseHtmlTarget(input.target);
      const source = (await readSourceSnapshot(session.sourcePath));
      if (source.sourceSha256 !== session.state.sourceSha256) return send(response, 409, { error: `The ${session.documentKind === "html" ? "HTML" : "Markdown"} source changed during the review. Restore the source or abort the review.` });
      if (input.range !== undefined && !range) return send(response, 400, { error: "Invalid source range" });
      if (range && (range.start.offset >= range.end.offset || range.end.offset > source.source.length)) return send(response, 400, { error: "Invalid source range" });
      const kind = input.kind;
      if (kind !== "delete" && kind !== "replace" && kind !== "comment") return send(response, 400, { error: "Invalid operation kind" });
      const requestedScope = typeof input.scope === "string" ? input.scope : session.documentKind === "html" ? "range" : "range";
      const isHtmlDocumentNote = session.documentKind === "html" && requestedScope === "document" && kind === "comment" && input.target === undefined && input.range === undefined;
      if (session.documentKind === "html") {
        if (isHtmlDocumentNote) {
          if (input.replacement !== undefined || input.target !== undefined || input.range !== undefined) return send(response, 400, { error: "Invalid HTML document note" });
        } else {
          if (input.target === undefined || !target || range) return send(response, 400, { error: "A valid HTML target is required" });
          const expectedScope = target.type === "html-text-range" ? "range" : "block";
          if (requestedScope !== expectedScope) return send(response, 400, { error: "HTML target scope does not match its type" });
        }
      } else {
        if (input.target !== undefined) return send(response, 400, { error: "HTML targets are not valid for Markdown" });
      }
      const scopes: ReviewOperation["scope"][] = session.documentKind === "html" ? ["range", "block", "document"] : ["range", "block", "section", "document", "cell", "row", "column", "media"];
      const scope = scopes.includes(requestedScope as ReviewOperation["scope"]) ? requestedScope as ReviewOperation["scope"] : undefined;
      if (!scope) return send(response, 400, { error: "Invalid operation scope" });
      if (kind === "comment" && (typeof input.comment !== "string" || !input.comment.trim() || input.comment.length > 16_384)) return send(response, 400, { error: "A comment is required" });
      if (kind === "replace" && (typeof input.replacement !== "string" || !input.replacement.trim() || input.replacement.length > 16_384)) return send(response, 400, { error: "A replacement is required" });
      if (kind === "delete" && (input.comment !== undefined || input.replacement !== undefined)) return send(response, 400, { error: "Delete operations cannot include comment or replacement text" });
      if (kind === "comment" && input.replacement !== undefined || kind === "replace" && input.comment !== undefined) return send(response, 400, { error: "Operation payload does not match its kind" });
      if (session.documentKind === "html" && !isHtmlDocumentNote && !target) return send(response, 400, { error: "A valid HTML target is required" });
      const operation: ReviewOperation = {
        id: `rvw_${String(session.state.operations.length + 1).padStart(3, "0")}`,
        kind, status: "open", scope, range, target, quote: range ? source.source.slice(range.start.offset, range.end.offset) : target ? (target.type === "mermaid-node" ? target.label : target.type === "html-text-range" ? target.exactText : target.text) : undefined,
        replacement: typeof input.replacement === "string" ? input.replacement : undefined,
        comment: typeof input.comment === "string" ? input.comment : undefined,
        placement: input.placement === "start" || input.placement === "end" ? input.placement : undefined,
        createdAt: new Date().toISOString(),
      };
      session.state.operations.push(operation); await writeState(session.sidecarPath, session.state); return send(response, 201, operation);
    }
    if (api[1] === "finish" && request.method === "POST") {
      if (session.outcome) return send(response, 200, session.outcome);
      const snapshot = await readSourceSnapshot(session.sourcePath); if (snapshot.sourceSha256 !== session.state.sourceSha256) return send(response, 409, { error: `${session.documentKind === "html" ? "HTML" : "Source"} changed during review; feedback was retained.` });
      const outcome = await this.transition(session, async () => {
        if (!hasOpenOperations(session.state)) {
          await rm(session.sidecarPath, { force: true });
          return { status: "finished", file: session.sourcePath };
        }
        const outputPath = session.documentKind === "html" ? htmlCommentedPath(session.sourcePath) : await nextCommentedPath(session.sourcePath);
        if (session.documentKind === "html") {
          const temporary = `${outputPath}.${randomUUID()}.tmp`;
          await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, source: session.sourcePath, documentKind: "html", sourceSha256: session.state.sourceSha256, createdAt: session.state.createdAt, operations: session.state.operations.filter(operation => operation.status === "open") }, null, 2)}\n`, { mode: 0o600 });
          await rename(temporary, outputPath);
        } else await writeFile(outputPath, renderCommentedMarkdown(snapshot.source, session.state), "utf8");
        await rm(session.sidecarPath, { force: true });
        return { status: "finished", file: outputPath };
      });
      return send(response, 200, outcome);
    }
    if (api[1] === "abort" && request.method === "POST") {
      const outcome = await this.transition(session, async () => { await rm(session.sidecarPath, { force: true }); return { status: "aborted" }; });
      return send(response, 200, outcome);
    }
    return send(response, 405, { error: "Method not allowed" });
  }
}

export async function startService(): Promise<void> {
  await mkdir(dirname(socket), { recursive: true }); await rm(socket, { force: true });
  const service = new RichieService();
  const web = createServer((request, response) => service.handle(request, response).catch((error: Error) => send(response, 500, { error: error.message })));
  const control = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/status") return send(response, 200, service.status());
    const result = request.url?.match(/^\/sessions\/([^/]+)\/result$/);
    if (result) {
      if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
      const abort = new AbortController();
      response.once("close", () => abort.abort());
      service.waitForResult(decodeURIComponent(result[1]), abort.signal).then((outcome) => {
        if (!outcome) { if (!abort.signal.aborted) send(response, 404, { error: "Session not found" }); return; }
        if (!response.destroyed) send(response, 200, outcome);
      }).catch((error: Error) => { if (!response.destroyed) send(response, 500, { error: error.message }); });
      return;
    }
    if (request.method !== "POST" || request.url !== "/sessions") return send(response, 404, { error: "Not found" });
    body(request).then(async (input) => { const sourcePath = (input as { sourcePath?: unknown }).sourcePath; if (typeof sourcePath !== "string") return send(response, 400, { error: "sourcePath is required" }); return send(response, 201, await service.createSession(sourcePath)); }).catch((error: Error) => send(response, 400, { error: error.message }));
  });
  await new Promise<void>((resolvePromise) => web.listen(port, "127.0.0.1", resolvePromise));
  await new Promise<void>((resolvePromise) => control.listen(socket, resolvePromise)); await chmod(socket, 0o600);
  process.on("SIGTERM", () => { web.close(); control.close(); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startService().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
