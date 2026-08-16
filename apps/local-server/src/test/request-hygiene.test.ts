// Backend Blueprint B0.4/B0.6 — request IDs and the body size limit.
//
// These are easy to regress invisibly: moving requestIdMiddleware below the
// body parser, or dropping the body-parser branch from the error handler,
// both leave every normal request working exactly as before. The only
// symptom is that rejected requests lose their ID and start reporting as
// 500s, which nobody notices until they are trying to trace one.
import { test, beforeAll as before, afterAll as after } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

let server: http.Server;
let baseUrl: string;

before(async () => {
  const { app } = await import("../app.js");
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("Failed to bind test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
  const { sqlite } = await import("../db/client.js");
  sqlite.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
});

test("every response carries an x-request-id header", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const id = res.headers.get("x-request-id");
  assert.ok(id && id.length > 0, "x-request-id header should be present");
});

test("a client-supplied request id is honoured, so a call chain keeps one id end to end", async () => {
  const res = await fetch(`${baseUrl}/health`, { headers: { "x-request-id": "trace-abc-123" } });
  assert.equal(res.headers.get("x-request-id"), "trace-abc-123");
});

test("a malicious request id is rejected and replaced, not reflected into log lines", async () => {
  // Sent over a raw socket rather than fetch(): fetch validates header
  // values itself and refuses to transmit control characters, so testing
  // this through fetch would only prove fetch works. An attacker writes to
  // the socket directly, which is what this reproduces.
  const rawRequest = (headerValue: string) => new Promise<string>((resolve, reject) => {
    const { port } = server.address() as { port: number };
    const socket = new net.Socket();
    let data = "";
    socket.connect(port, "127.0.0.1", () => {
      socket.write(
        `GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Request-Id: ${headerValue}\r\nConnection: close\r\n\r\n`,
      );
    });
    socket.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
    setTimeout(() => { socket.destroy(); reject(new Error("timeout")); }, 5000);
  });

  // Spaces are invalid per the allowlist and must not be echoed.
  const withSpaces = await rawRequest("bad id with spaces");
  const echoed = /x-request-id:\s*(.*)/i.exec(withSpaces)?.[1]?.trim();
  assert.ok(echoed, "response should still carry an x-request-id");
  assert.notEqual(echoed, "bad id with spaces");
  assert.ok(/^[A-Za-z0-9_-]+$/.test(echoed!), `generated id should be safe, got: ${JSON.stringify(echoed)}`);

  // An over-long value is likewise replaced rather than passed into logs.
  const tooLong = await rawRequest("A".repeat(500));
  const echoedLong = /x-request-id:\s*(.*)/i.exec(tooLong)?.[1]?.trim();
  assert.ok(echoedLong && echoedLong.length <= 64, `over-long id should be replaced, got length ${echoedLong?.length}`);
});

test("an oversized body is refused as 413, not reported as a server fault", async () => {
  const huge = JSON.stringify({ payload: "x".repeat(300 * 1024) }); // > the 256kb limit
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: huge,
  });
  assert.equal(res.status, 413);
  const body = await res.json() as { error: string; requestId?: string };
  assert.equal(body.error, "PAYLOAD_TOO_LARGE");
  // The ID must survive a rejection -- that is the whole point of putting
  // requestIdMiddleware above the body parser.
  assert.ok(body.requestId, "a rejected request must still report its request id");
});

test("malformed JSON is refused as 400, not 500", async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: '{"broken":',
  });
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string; requestId?: string };
  assert.equal(body.error, "INVALID_REQUEST_BODY");
  assert.ok(body.requestId);
});

test("a normal request body under the limit is unaffected", async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
  });
  // 401 = the request was parsed and reached the handler, which is the point.
  assert.equal(res.status, 401);
});
