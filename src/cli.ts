#!/usr/bin/env node
import { request } from "node:http";
import { realpath } from "node:fs/promises";
import { spawn } from "node:child_process";

const socket = process.env.RICHIE_CONTROL_SOCKET ?? "/run/richie/control.sock";

function control(path: string, payload?: unknown, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestHandle = request({
      socketPath: socket,
      path,
      method: payload ? "POST" : "GET",
      headers: payload ? { "content-type": "application/json" } : undefined,
      signal,
    }, (response) => {
      let output = "";
      response.on("data", (chunk) => output += chunk);
      response.on("end", () => {
        try {
          const value = JSON.parse(output) as { error?: string };
          if (response.statusCode && response.statusCode < 300) resolve(value);
          else reject(new Error(value.error ?? "Richie service error"));
        } catch (error) { reject(error); }
      });
    });
    requestHandle.on("error", (error) => {
      if (signal?.aborted) reject(error);
      else reject(new Error("Richie service is unavailable. Start it with: sudo systemctl start richie"));
    });
    requestHandle.end(payload ? JSON.stringify(payload) : undefined);
  });
}

async function poll(id: string): Promise<void> {
  const abort = new AbortController();
  let signalExit: number | undefined;
  const interrupt = (exitCode: number): void => { signalExit = exitCode; abort.abort(); };
  const onInt = (): void => interrupt(130);
  const onTerm = (): void => interrupt(143);
  process.once("SIGINT", onInt); process.once("SIGTERM", onTerm);
  try {
    const outcome = await control(`/sessions/${encodeURIComponent(id)}/result`, undefined, abort.signal);
    console.log(JSON.stringify(outcome));
  } catch (error) {
    if (signalExit !== undefined) { process.exitCode = signalExit; return; }
    throw error;
  } finally {
    process.off("SIGINT", onInt); process.off("SIGTERM", onTerm);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "status") { console.log(JSON.stringify(await control("/status"))); return; }
  if (args[0] === "poll" && args[1] && args.length === 2) { await poll(args[1]); return; }
  if (args[0] === "review") {
    const json = args[1] === "--json";
    const input = args[json ? 2 : 1];
    if (!input || args.length !== (json ? 3 : 2)) throw new Error("Usage: richie review [--json] path/to/draft-vNN.md");
    const sourcePath = await realpath(input);
    const result = await control("/sessions", { sourcePath }) as { id: string; url: string };
    spawn("xdg-open", [result.url], { detached: true, stdio: "ignore" }).unref();
    console.log(json ? JSON.stringify({ id: result.id, url: result.url }) : result.url);
    return;
  }
  throw new Error("Usage: richie review [--json] <file> | richie poll <session-id> | richie status");
}

main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
