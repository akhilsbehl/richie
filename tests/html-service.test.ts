import assert from "node:assert/strict";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RichieService } from "../src/service.js";
import { htmlCommentedPath } from "../src/paths.js";
import { sha256 } from "../src/store.js";

type Reply = { status: number; headers: IncomingHttpHeaders; body: Buffer };
const point = { x: 1, y: 2, width: 80, height: 20 };
const rect = { viewport: point, document: point, viewportSize: { width: 1280, height: 720 } };
function call(server: Server, path: string, method = "GET", value?: unknown, host = "127.0.0.1:43173"): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = value === undefined ? undefined : JSON.stringify(value);
    const handle = request({ hostname: "127.0.0.1", port: (server.address() as { port: number }).port, path, method, headers: { host, ...(payload ? { "content-type": "application/json" } : {}) } }, (response) => {
      const chunks: Buffer[] = []; response.on("data", (chunk) => chunks.push(Buffer.from(chunk))); response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    handle.on("error", reject); handle.end(payload);
  });
}
async function setup(source: string): Promise<{ root: string; sourcePath: string; service: RichieService; server: Server; id: string; token: string; nonce: string }> {
  const root = await mkdtemp(join(tmpdir(), "richie-html-service-"));
  const sourcePath = join(root, "report.html"); await writeFile(sourcePath, source);
  const service = new RichieService(); const session = await service.createSession(sourcePath); const token = new URL(session.url).searchParams.get("token")!;
  const server = createServer((incoming, outgoing) => { void service.handle(incoming, outgoing); }); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const shell = await call(server, `/s/${session.id}?token=${encodeURIComponent(token)}`);
  const match = shell.body.toString().match(/index\.html\?n=([^"&]+)/); assert.ok(match);
  return { root, sourcePath, service, server, id: session.id, token, nonce: decodeURIComponent(match[1]) };
}
async function teardown(state: Awaited<ReturnType<typeof setup>>): Promise<void> {
  await new Promise<void>((resolve, reject) => state.server.close((error) => error ? reject(error) : resolve()));
  await rm(state.root, { recursive: true, force: true });
}
const target = (selector = "#target") => ({ type: "html-element", selector, path: [0, 1], tag: "p", text: "Target text", rect });

test("HTML artifact is an immutable session snapshot with confined assets and explicit policy", async () => {
  const state = await setup("<!doctype html><html><body><p id=\"target\">Target text</p></body></html>");
  const assets = join(state.root, "assets"); await mkdir(assets); await writeFile(join(assets, "style.css"), "p{color:red}"); await writeFile(join(assets, "app.js"), "window.fixture=true;"); await writeFile(join(assets, "pixel.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47])); await writeFile(join(assets, "unknown.bin"), "secret");
  const outside = join(state.root, "..", "outside.txt"); await writeFile(outside, "outside");
  try {
    const before = await readFile(state.sourcePath); const index = await call(state.server, `/artifact/${state.id}/index.html?n=${encodeURIComponent(state.nonce)}`);
    assert.equal(index.status, 200); assert.equal(index.headers["x-content-type-options"], "nosniff"); assert.equal(index.headers["cache-control"], "no-store");
    const html = index.body.toString(); assert.equal((html.match(/<script src="\/assets\/html-review-sdk\.js\?c=[^"]+"><\/script>/g) ?? []).length, 1); assert.doesNotMatch(html, new RegExp(state.token));
    const policy = index.headers["content-security-policy"] as string;
    for (const directive of ["default-src 'none'", "object-src 'none'", "media-src 'none'", "worker-src 'none'", "manifest-src 'none'", "form-action 'none'", "navigate-to 'none'"]) assert.match(policy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const [name, mime] of [["style.css", "text/css"], ["app.js", "text/javascript"], ["pixel.png", "image/png"]] as const) {
      const loaded = await call(state.server, `/artifact/${state.id}/assets/${name}`); assert.equal(loaded.status, 200); assert.equal(loaded.headers["content-type"], mime); assert.equal(loaded.headers["x-content-type-options"], "nosniff"); assert.equal(loaded.headers["cache-control"], "no-store");
    }
    for (const path of [`/artifact/${state.id}/assets/unknown.bin`, `/artifact/${state.id}/assets/missing.css`, `/artifact/${state.id}/assets/`, `/artifact/${state.id}/%2e%2e%2Foutside.txt`, `/artifact/${state.id}/assets/%2e%2e%2Foutside.txt`, `/artifact/${state.id}/assets/%5Coutside.txt`]) assert.equal((await call(state.server, path)).status, 404, path);
    assert.equal((await call(state.server, `/artifact/${state.id}/index.html?n=wrong`)).status, 404);
    assert.equal((await call(state.server, `/artifact/${state.id}/index.html?n=${encodeURIComponent(state.nonce)}`, "POST")).status, 405);
    assert.equal((await call(state.server, `/artifact/${state.id}/index.html?n=${encodeURIComponent(state.nonce)}`, "GET", undefined, "evil.example")).status, 421);
    assert.equal((await call(state.server, "/assets/html-review-sdk.js?c=wrong")).status, 404);
    assert.deepEqual(await readFile(state.sourcePath), before);
  } finally { await rm(outside, { force: true }); await teardown(state); }
});

test("HTML target API is total, scope-aware, stale-safe, and exports atomically", async () => {
  const state = await setup("<!doctype html><html><body><p id=\"target\">Target text</p></body></html>");
  const base = `/api/operations/${state.id}?token=${encodeURIComponent(state.token)}`;
  const malformed = [null, { kind: "comment", scope: "block", target: null, comment: "x" }, { kind: "comment", scope: "range", target: target() }, { kind: "comment", scope: "block", target: { ...target(), rect: { ...rect, viewport: { ...point, width: -1 } } }, comment: "x" }, { kind: "comment", scope: "block", target: target(), comment: "" }];
  try {
    for (const payload of malformed) assert.equal((await call(state.server, base, "POST", payload)).status, 400);
    assert.deepEqual(JSON.parse((await call(state.server, `/api/state/${state.id}?token=${encodeURIComponent(state.token)}`)).body.toString()).operations, []);
    const created = await call(state.server, base, "POST", { kind: "comment", scope: "block", target: target(), comment: "Keep this paragraph." }); assert.equal(created.status, 201);
    const sourceBeforeStale = await readFile(state.sourcePath); await writeFile(state.sourcePath, `${sourceBeforeStale.toString()}<!-- changed -->`);
    const staleArtifact = await call(state.server, `/artifact/${state.id}/index.html?n=${encodeURIComponent(state.nonce)}`); assert.equal(staleArtifact.status, 200); assert.match(staleArtifact.body.toString(), /Target text/); assert.doesNotMatch(staleArtifact.body.toString(), /changed/);
    assert.equal((await call(state.server, base, "POST", { kind: "comment", scope: "block", target: target(), comment: "blocked" })).status, 409);
    assert.equal((await call(state.server, `/api/finish/${state.id}?token=${encodeURIComponent(state.token)}`, "POST", {})).status, 409);
    const staleState = await call(state.server, `/api/state/${state.id}?token=${encodeURIComponent(state.token)}`); assert.match(staleState.body.toString(), /Keep this paragraph/);
    const reloaded = await call(state.server, `/api/reload/${state.id}?token=${encodeURIComponent(state.token)}`, "POST", {}); assert.equal(reloaded.status, 200);
    const shell = await call(state.server, `/s/${state.id}?token=${encodeURIComponent(state.token)}`); const freshNonce = decodeURIComponent(shell.body.toString().match(/index\.html\?n=([^"&]+)/)![1]); assert.notEqual(freshNonce, state.nonce); assert.equal((await call(state.server, `/artifact/${state.id}/index.html?n=${encodeURIComponent(state.nonce)}`)).status, 404);
    const clean = await call(state.server, `/api/state/${state.id}?token=${encodeURIComponent(state.token)}`); assert.deepEqual(JSON.parse(clean.body.toString()).operations, []);
    const valid = await call(state.server, base, "POST", { kind: "replace", scope: "block", target: { ...target(), selector: "#target" }, replacement: "New text" }); assert.equal(valid.status, 201);
    const canonical = await readFile(state.sourcePath); const finish = await call(state.server, `/api/finish/${state.id}?token=${encodeURIComponent(state.token)}`, "POST", {}); assert.equal(finish.status, 200);
    const outputPath = htmlCommentedPath(state.sourcePath); const output = JSON.parse(await readFile(outputPath, "utf8")) as { schemaVersion: number; documentKind: string; operations: unknown[]; sourceSha256: string };
    assert.equal(output.schemaVersion, 1); assert.equal(output.documentKind, "html"); assert.equal(output.sourceSha256, sha256(canonical.toString())); assert.equal(output.operations.length, 1); assert.deepEqual(await readFile(state.sourcePath), canonical);
    assert.equal(await lstat(outputPath).then(() => true).catch(() => false), true); assert.equal((await call(state.server, `/artifact/${state.id}/index.html?n=${encodeURIComponent(freshNonce)}`)).status, 404);
    await rm(outputPath, { force: true });
  } finally { await rm(htmlCommentedPath(state.sourcePath), { force: true }); await teardown(state); }
});

test("HTML no-open Finish and Abort do not create durable handoffs", async () => {
  const state = await setup("<html><body><p>empty</p></body></html>"); const output = htmlCommentedPath(state.sourcePath);
  try {
    const finish = await call(state.server, `/api/finish/${state.id}?token=${encodeURIComponent(state.token)}`, "POST", {}); assert.equal(finish.status, 200); assert.equal(await lstat(output).then(() => true).catch(() => false), false);
    const second = await setup("<html><body><p>abort</p></body></html>");
    try { const abort = await call(second.server, `/api/abort/${second.id}?token=${encodeURIComponent(second.token)}`, "POST", {}); assert.equal(abort.status, 200); assert.equal(await lstat(htmlCommentedPath(second.sourcePath)).then(() => true).catch(() => false), false); } finally { await teardown(second); }
  } finally { await teardown(state); }
});

test("outside-root asset symlinks fail closed", async () => {
  const state = await setup("<html><body><p>asset</p></body></html>"); const outside = join(state.root, "..", "outside.js");
  try { await writeFile(outside, "outside"); await symlink(outside, join(state.root, "escape.js")); assert.equal((await call(state.server, `/artifact/${state.id}/escape.js`)).status, 404); } finally { await rm(outside, { force: true }); await teardown(state); }
});
