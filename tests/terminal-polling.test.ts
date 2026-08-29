import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RichieService } from "../src/service.js";

test("holds terminal result waiters and retains isolated idempotent outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "richie-terminal-"));
  const firstPath = join(directory, "first.md");
  const secondPath = join(directory, "second.md");
  await writeFile(firstPath, "# First\n");
  await writeFile(secondPath, "# Second\n");
  const service = new RichieService();
  const first = await service.createSession(firstPath);
  const second = await service.createSession(secondPath);
  const firstUrl = new URL(first.url);
  const secondUrl = new URL(second.url);
  const server = createServer((incoming, outgoing) => void service.handle(incoming, outgoing).catch((error: Error) => { outgoing.statusCode = 500; outgoing.end(error.message); }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const call = (path: string, method = "GET", value?: unknown) => new Promise<{ status: number; value: any }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: address.port, path, method, headers: { host: "127.0.0.1:43173", "content-type": "application/json" } }, (res) => {
      let output = ""; res.on("data", (chunk) => output += chunk); res.on("end", () => resolve({ status: res.statusCode ?? 0, value: JSON.parse(output) }));
    }); req.on("error", reject); req.end(value === undefined ? undefined : JSON.stringify(value));
  });
  try {
    let settled = false;
    const waiterA = service.waitForResult(first.id).then((outcome) => { settled = true; return outcome; });
    const waiterB = service.waitForResult(first.id);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(await service.waitForResult("missing"), undefined);
    assert.equal(service.status().sessions, 2);

    const token = encodeURIComponent(firstUrl.searchParams.get("token")!);
    const [finish, abort] = await Promise.all([
      call(`/api/finish/${first.id}?token=${token}`, "POST", {}),
      call(`/api/abort/${first.id}?token=${token}`, "POST", {}),
    ]);
    assert.equal(finish.status, 200); assert.equal(abort.status, 200);
    assert.deepEqual(finish.value, abort.value);
    assert.deepEqual(await waiterA, finish.value);
    assert.deepEqual(await waiterB, finish.value);
    assert.deepEqual(await service.waitForResult(first.id), finish.value);
    assert.equal(service.status().sessions, 1);

    const replacement = await service.createSession(firstPath);
    assert.notEqual(replacement.id, first.id);
    const secondToken = encodeURIComponent(secondUrl.searchParams.get("token")!);
    assert.deepEqual((await call(`/api/abort/${second.id}?token=${secondToken}`, "POST", {})).value, { status: "aborted" });
    assert.deepEqual(await service.waitForResult(second.id), { status: "aborted" });
    assert.deepEqual(await service.waitForResult(first.id), finish.value);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("stale finish and review reload leave the same terminal waiter pending", async () => {
  const directory = await mkdtemp(join(tmpdir(), "richie-terminal-stale-"));
  const sourcePath = join(directory, "draft.md");
  await writeFile(sourcePath, "# Original\n");
  const service = new RichieService();
  const session = await service.createSession(sourcePath);
  const url = new URL(session.url); const token = encodeURIComponent(url.searchParams.get("token")!);
  const server = createServer((incoming, outgoing) => void service.handle(incoming, outgoing).catch((error: Error) => { outgoing.statusCode = 500; outgoing.end(error.message); }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const post = (path: string) => new Promise<number>((resolve, reject) => { const req = request({ hostname: "127.0.0.1", port: address.port, path, method: "POST", headers: { host: "127.0.0.1:43173" } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode ?? 0)); }); req.on("error", reject); req.end("{}"); });
  try {
    let settled = false; const result = service.waitForResult(session.id).then((value) => { settled = true; return value; });
    await writeFile(sourcePath, "# Changed\n");
    assert.equal(await post(`/api/finish/${session.id}?token=${token}`), 409);
    assert.equal(settled, false);
    assert.equal(await post(`/api/reload/${session.id}?token=${token}`), 200);
    assert.equal(settled, false);
    assert.equal(await post(`/api/finish/${session.id}?token=${token}`), 200);
    assert.deepEqual(await result, { status: "finished", file: sourcePath });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
