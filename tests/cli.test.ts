import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

function run(args: string[], env: NodeJS.ProcessEnv): { child: ReturnType<typeof spawn>; output: Promise<{ code: number | null; stdout: string; stderr: string }> } {
  const child = spawn(process.execPath, [resolve("dist/src/cli.js"), ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
  const output = new Promise<{ code: number | null; stdout: string; stderr: string }>((done) => {
    let stdout = "", stderr = "";
    child.stdout!.on("data", (chunk) => stdout += chunk); child.stderr!.on("data", (chunk) => stderr += chunk);
    child.on("exit", (code) => done({ code, stdout, stderr }));
  });
  return { child, output };
}

test("CLI preserves review stdout, exposes JSON identity, polls once, and interrupts cleanly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "richie-cli-"));
  const socket = join(directory, "control.sock");
  const source = join(directory, "draft.md");
  const opener = join(directory, "xdg-open");
  await writeFile(source, "# Draft\n"); await writeFile(opener, "#!/bin/sh\nexit 0\n"); await chmod(opener, 0o755);
  const pending = new Set<import("node:http").ServerResponse>();
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/sessions") { request.resume(); request.on("end", () => { response.writeHead(201, { "content-type": "application/json" }); response.end(JSON.stringify({ id: "session-1", url: "http://example.test/review" })); }); return; }
    if (request.method === "GET" && request.url === "/sessions/session-1/result") { pending.add(response); response.on("close", () => pending.delete(response)); return; }
    response.writeHead(404, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Not found" }));
  });
  await new Promise<void>((done) => server.listen(socket, done));
  const env = { ...process.env, RICHIE_CONTROL_SOCKET: socket, PATH: `${directory}:${process.env.PATH}` };
  try {
    const plain = await run(["review", source], env).output;
    assert.deepEqual({ code: plain.code, stdout: plain.stdout }, { code: 0, stdout: "http://example.test/review\n" });
    const json = await run(["review", "--json", source], env).output;
    assert.deepEqual(JSON.parse(json.stdout), { id: "session-1", url: "http://example.test/review" });

    const interrupted = run(["poll", "session-1"], env);
    await new Promise<void>((done) => { const check = (): void => { if (pending.size) done(); else setImmediate(check); }; check(); });
    interrupted.child.kill("SIGINT");
    const interruptedResult = await interrupted.output;
    assert.equal(interruptedResult.code, 130); assert.equal(interruptedResult.stdout, "");

    const terminated = run(["poll", "session-1"], env);
    await new Promise<void>((done) => { const check = (): void => { if (pending.size) done(); else setImmediate(check); }; check(); });
    terminated.child.kill("SIGTERM");
    const terminatedResult = await terminated.output;
    assert.equal(terminatedResult.code, 143); assert.equal(terminatedResult.stdout, "");

    const poll = run(["poll", "session-1"], env);
    await new Promise<void>((done) => { const check = (): void => { if (pending.size) done(); else setImmediate(check); }; check(); });
    for (const response of pending) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "aborted" })); }
    const result = await poll.output;
    assert.deepEqual({ code: result.code, stdout: result.stdout }, { code: 0, stdout: '{"status":"aborted"}\n' });
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});
