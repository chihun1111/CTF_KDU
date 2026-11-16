import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { requestNavigation } from "./runtime-navigation.mjs";

async function localServer(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("navigation transport sends browser metadata and cookies that Node fetch cannot preserve", async (t) => {
  const baseUrl = await localServer(t, (request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ method: request.method, headers: request.headers }));
  });
  const fetched = await fetch(`${baseUrl}/clear`, { headers: { "sec-fetch-mode": "navigate" } });
  assert.equal((await fetched.json()).headers["sec-fetch-mode"], "cors");

  const response = await requestNavigation(`${baseUrl}/clear`, { headers: { cookie: "once=opaque" } });
  const received = await response.json();
  assert.equal(received.method, "GET");
  assert.equal(received.headers["sec-fetch-site"], "same-origin");
  assert.equal(received.headers["sec-fetch-dest"], "document");
  assert.equal(received.headers["sec-fetch-mode"], "navigate");
  assert.equal(received.headers.cookie, "once=opaque");
  assert.equal(response.url, `${baseUrl}/clear`);
});

test("navigation transport preserves distinct Set-Cookie headers and never follows redirects", async (t) => {
  let calls = 0;
  const baseUrl = await localServer(t, (_request, response) => {
    calls += 1;
    response.writeHead(303, {
      location: "/submit",
      "set-cookie": ["once=; Max-Age=0; Path=/clear", "other=value; HttpOnly; Path=/"],
    });
    response.end("redirect");
  });
  const response = await requestNavigation(`${baseUrl}/clear`);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/submit");
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(await response.text(), "redirect");
  assert.equal(calls, 1);
});

test("navigation timeout aborts an unresponsive server without retrying", async (t) => {
  let calls = 0;
  const baseUrl = await localServer(t, () => { calls += 1; });
  await assert.rejects(requestNavigation(`${baseUrl}/clear`, { timeoutMs: 100 }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("navigation honors caller cancellation before consuming a view", async (t) => {
  let calls = 0;
  const baseUrl = await localServer(t, () => { calls += 1; });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestNavigation(`${baseUrl}/clear`, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("navigation rejects unsupported protocols and oversized responses", async (t) => {
  await assert.rejects(requestNavigation("file:///etc/passwd"), /HTTP\(S\)/);
  const baseUrl = await localServer(t, (_request, response) => response.end(Buffer.alloc(1_048_577)));
  await assert.rejects(requestNavigation(`${baseUrl}/clear`), /exceeds 1 MiB|ended early/);
});
