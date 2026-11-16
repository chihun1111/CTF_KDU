import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
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
