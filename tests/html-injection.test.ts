import assert from "node:assert/strict";
import { createServer, request, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RichieService } from "../src/service.js";

async function run(source: string): Promise<{ service: RichieService; server: Server; root: string; id: string; nonce: string; token: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "richie-injection-")); const path = join(root, "fragment.html"); await writeFile(path, source);
  const service = new RichieService(); const created = await service.createSession(path); const token = new URL(created.url).searchParams.get("token")!;
  const server = createServer((incoming, outgoing) => { void service.handle(incoming, outgoing); }); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const shell = await new Promise<string>((resolve, reject) => request({ hostname: "127.0.0.1", port: (server.address() as { port: number }).port, path: `/s/${created.id}?token=${token}`, headers: { host: "127.0.0.1:43173" } }, (response) => { let body = ""; response.on("data", (chunk) => body += chunk); response.on("end", () => resolve(body)); }).on("error", reject).end());
  const nonce = decodeURIComponent(shell.match(/index\.html\?n=([^"&]+)/)![1]); return { service, server, root, id: created.id, nonce, token, path };
}
async function fetchIndex(state: Awaited<ReturnType<typeof run>>): Promise<string> {
  return new Promise((resolve, reject) => request({ hostname: "127.0.0.1", port: (state.server.address() as { port: number }).port, path: `/artifact/${state.id}/index.html?n=${encodeURIComponent(state.nonce)}`, headers: { host: "127.0.0.1:43173" } }, (response) => { let body = ""; response.on("data", (chunk) => body += chunk); response.on("end", () => { assert.equal(response.statusCode, 200); resolve(body); }); }).on("error", reject).end());
}
async function close(state: Awaited<ReturnType<typeof run>>): Promise<void> { await new Promise<void>((resolve) => state.server.close(() => resolve())); await rm(state.root, { recursive: true, force: true }); }

test("artifact injection handles no-body and malformed readable HTML without selecting script literals", async () => {
  for (const source of ["<p>fragment</p>", "<html><body><script>const body = '</body>';</script><p>malformed", "<html><body><script>const body = '</body>';"]) {
    const state = await run(source);
    try {
      const before = await readFile(state.path, "utf8"); const output = await fetchIndex(state);
      assert.equal(output.includes(before), true); assert.equal((output.match(/<script src="\/assets\/html-review-sdk\.js\?c=[^"]+"><\/script>/g) ?? []).length, 1); assert.deepEqual(await readFile(state.path, "utf8"), before);
      if (source.includes("literal") || source.includes("const body")) assert.ok(output.indexOf("const body = '</body>';") < output.lastIndexOf("<script src="));
    } finally { await close(state); }
  }
});
