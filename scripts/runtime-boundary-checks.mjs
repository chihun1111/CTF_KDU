import assert from "node:assert/strict";

/** Exercise the public proxy using only the smoke run's disposable participant. */
export async function verifyParticipantBoundaries({ request, baseUrl, cookie, studentId, services }) {
  const origin = new URL(baseUrl).origin;
  const forgedHeaders = {
    "x-user-id": "00000000-0000-4000-8000-000000000001",
    "x-student-id": "9999999",
    "x-forwarded-user": "admin",
    "x-internal-service": "service-01",
    "x-internal-token": "boundary-fixture",
    authorization: "Bearer boundary-fixture",
  };

  async function check(path, init, statuses, label, privateResponse = false) {
    const response = await request(path, init);
    const body = await response.text();
    assert(statuses.includes(response.status), `${label}: unexpected HTTP ${response.status}`);
    assert(!body.includes("KDUCTF{"), `${label}: response exposed flag material`);
    if (privateResponse) {
      assert(/no-store/.test(response.headers.get("cache-control") ?? ""), `${label}: response can be cached`);
    }
    return { response, body };
  }

  for (const path of ["/api/progress", "/api/admin/operations/summary"]) {
    await check(path, { headers: forgedHeaders }, [401], "forged identity without session", true);
  }
  for (const service of services) {
    await check(service.serviceHref, { headers: forgedHeaders }, [401], `anonymous challenge ${service.id}`, true);
    assert(typeof service.slug === "string" && /^[a-z0-9-]+$/.test(service.slug), "service slug is invalid");
    await check(`/api/services/${service.slug}/artifact`, { cookie }, [404], `retired artifact ${service.id}`);
  }
  for (const path of ["/internal/challenges/01/flag", "/internal/claims/issue"]) {
    await check(path, { cookie, headers: forgedHeaders, method: path.includes("claims") ? "POST" : "GET" }, [404], "external internal API");
  }

  for (const invalidCookie of ["ctf_session=%E0%A4%A", `${cookie}; ctf_session=ambiguous-fixture`]) {
    const { body } = await check("/api/auth/me", { cookie: invalidCookie }, [200], "malformed or duplicate session", true);
    assert(JSON.parse(body).authenticated === false, "ambiguous session authenticated");
    await check("/api/progress", { cookie: invalidCookie }, [401], "ambiguous session progress", true);
  }

  for (const headers of [
    { origin: "https://outside.example" },
    { origin: "null" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { origin, "sec-fetch-site": "cross-site" },
  ]) {
    for (const path of ["/api/presence/heartbeat", "/api/auth/logout", "/api/AUTH/logout"]) {
      await check(path, { method: "POST", cookie, headers }, [403], "cross-origin platform mutation", true);
    }
  }
  const active = await check("/api/auth/me", { cookie }, [200], "session after rejected mutations", true);
  assert(JSON.parse(active.body).authenticated === true, "rejected mutation revoked the session");
  await check("/api/presence/heartbeat", { method: "POST", cookie, headers: { origin, "sec-fetch-site": "same-origin" } }, [200, 201], "same-origin mutation", true);

  await check("/admin/hints/release", {
    method: "POST", cookie, headers: { origin: "https://outside.example", "content-type": "application/x-www-form-urlencoded" },
    body: "stageId=01%3Afirst",
  }, [403], "cross-origin operator form", true);

  for (const password of [
    null, 12345678, [], "Password!1", "Password 1", "Password\t1", "Password\u00001",
    "Password1\n", "Password1\r", "Password😀1", "Password한글1", "ＡＢＣＤ1234",
    "\uD800".repeat(8), "Password\uDC001",
  ]) {
    const input = { studentId, password };
    await check("/api/auth/login", { method: "POST", json: input }, [400], "forbidden password input on login", true);
    await check("/api/auth/register", { method: "POST", json: {
      ...input, consent: { consentVersion: "strict-boundaries", requiredLoggingAccepted: true, analyticsLoggingAccepted: false, cookieAccepted: true },
    } }, [400], "forbidden password input on registration", true);
  }
  for (const invalidStudentId of [`${studentId}\n`, `${studentId}\r\n`, `${studentId}\u0000`]) {
    const input = { studentId: invalidStudentId, password: "BoundaryPassword123" };
    await check("/api/auth/login", { method: "POST", json: input }, [400], "noncanonical student ID on login", true);
    await check("/api/auth/register", { method: "POST", json: {
      ...input, consent: { consentVersion: "strict-boundaries", requiredLoggingAccepted: true, analyticsLoggingAccepted: false, cookieAccepted: true },
    } }, [400], "noncanonical student ID on registration", true);
  }
  for (const flagsByFlagId of [null, [], { "FLAG-99": "fixture" }]) {
    await check("/api/final-submit", { method: "POST", cookie, json: { flagsByFlagId } }, [400], "invalid submission payload", true);
  }
  await check("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(65_537),
  }, [413], "proxy request body limit");

  await check("/api/auth/logout", { method: "POST", cookie, headers: { origin, "sec-fetch-site": "same-origin" } }, [200, 201], "logout", true);
  const revoked = await check("/api/auth/me", { cookie }, [200], "replayed logged-out session", true);
  assert(JSON.parse(revoked.body).authenticated === false, "logged-out session remains authenticated");
  await check("/api/progress", { cookie }, [401], "revoked session progress", true);
  for (const service of services) {
    await check(service.serviceHref, { cookie }, [401], `revoked session challenge ${service.id}`, true);
  }
}
