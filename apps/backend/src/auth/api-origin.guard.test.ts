import assert from "node:assert/strict";
import test from "node:test";
import { Controller, ForbiddenException, Module, Post, type ExecutionContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ApiOriginGuard } from "./api-origin.guard.js";

function context(headers: Record<string, unknown>, path = "/api/final-submit", method = "POST"): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ headers, path, method }) }) } as ExecutionContext;
}

test("API origin guard allows same-origin writes and non-browser authenticated clients", () => {
  const guard = new ApiOriginGuard("https://ctf.example.edu");
  assert.equal(guard.canActivate(context({ origin: "https://ctf.example.edu", "sec-fetch-site": "same-origin" })), true);
  assert.equal(guard.canActivate(context({})), true);
  assert.equal(guard.canActivate(context({ origin: "https://another.example" }, "/api/hints", "GET")), true);
  assert.equal(guard.canActivate(context({}, "/internal/claims/issue")), true);
});

test("API origin guard rejects cross-site and same-site sibling-origin mutations", () => {
  const guard = new ApiOriginGuard("https://ctf.example.edu");
  for (const headers of [
    { origin: "https://evil.example" },
    { origin: "https://student.example.edu", "sec-fetch-site": "same-site" },
    { origin: "null" },
    { origin: ["https://ctf.example.edu", "https://evil.example"] },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
  ]) {
    assert.throws(() => guard.canActivate(context(headers)), ForbiddenException);
  }
});

test("origin protection covers the case-insensitive API paths accepted by the HTTP router", async (t) => {
  let mutations = 0;
  @Controller("api/origin-probe")
  class ProbeController {
    @Post()
    mutate() { mutations += 1; return { ok: true }; }
  }
  @Module({ controllers: [ProbeController] })
  class ProbeModule {}
  const app = await NestFactory.create(ProbeModule, { logger: false });
  app.useGlobalGuards(new ApiOriginGuard("https://ctf.example.edu"));
  await app.listen(0, "127.0.0.1");
  t.after(() => app.close());
  const baseUrl = await app.getUrl();

  for (const path of ["/api/origin-probe", "/API/origin-probe", "/Api/Origin-Probe"]) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { origin: "https://student.example.edu", "sec-fetch-site": "same-site" },
    });
    await response.arrayBuffer();
    assert.equal(response.status, 403, path);
  }
  assert.equal(mutations, 0);
  const allowed = await fetch(`${baseUrl}/API/origin-probe`, {
    method: "POST",
    headers: { origin: "https://ctf.example.edu", "sec-fetch-site": "same-origin" },
  });
  await allowed.arrayBuffer();
  assert.equal(allowed.status, 201);
  assert.equal(mutations, 1);
});
