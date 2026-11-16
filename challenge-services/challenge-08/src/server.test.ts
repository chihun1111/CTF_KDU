import { configureBackend, registerHttpRuntimeTests, send, startServer } from "../../test-support/http-runtime.mjs";
import { createChallengeServer } from "./server.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildFlagBackendRequest,
  buildAccessGrantRedirect,
  buildGuestPayload,
  consumeAccessGrant,
  createGrantStore,
  deriveVaultKey,
  encodeTicketValue,
  parseTicketValue,
  readClaims,
  readInternalServiceToken,
  readSessionToken,
  renderDeniedPage,
  renderPrizePage,
  renderVaultPage,
  sessionBindingFromCookie,
  signPayload,
  verifyTicket,
} from "./server.js";

const GLOBAL_HEADER_MARKUP =
  '<header class="campusGlobalHeader"> <div class="campusGlobalHeaderInner"> <a class="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기"> <span class="campusGlobalBrandMark">KDU</span> <span class="campusGlobalBrandText">교내 서비스</span> </a> <a class="campusGlobalHomeLink" href="/hub">전체 서비스</a> </div> </header>';

function assertGlobalHeader(html: string): void {
  const normalized = html.replace(/\s+/g, " ").trim();
  assert(normalized.includes(GLOBAL_HEADER_MARKUP));
  assert.equal((html.match(/class="campusGlobalHeader"/g) ?? []).length, 1);
  assert(html.includes("min-height: 60px;"));
  assert(html.includes("min-height: 52px;"));
  assert(html.includes("min-height: 44px;"));
  assert(html.includes(".campusGlobalBrand:focus-visible"));
}

test("challenge-08 reads the internal service token from a mounted secret file", async () => {
  const token = await readInternalServiceToken(
    {
      INTERNAL_SERVICE_TOKEN: "legacy-shared-token-must-be-ignored",
      INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_08",
    },
    async (path) => {
      assert.equal(path, "/run/secrets/internal_service_token_08");
      return "internal-token\n";
    },
  );

  assert.equal(token, "internal-token");
});

test("challenge-08 builds a current-session flag request without URL identity", () => {
  const request = buildFlagBackendRequest({
    backendInternalUrl: "http://backend:8080",
    cookieHeader: "ctf_session=opaque",
    serviceToken: "internal-token",
  });

  assert.equal(request.url, "http://backend:8080/internal/challenges/08/flag");
  assert.deepEqual(request.headers, {
    authorization: "Bearer internal-token",
    cookie: "ctf_session=opaque",
  });
  assert.equal(JSON.stringify(request).includes("userId"), false);
  assert.equal(JSON.stringify(request).includes("studentId"), false);
});

test("challenge-08 guest ticket verifies with role guest and rejects tampering", () => {
  const key = deriveVaultKey("internal-token", "session-a");
  const payload = buildGuestPayload(1000);
  const ticket = encodeTicketValue(key, payload);

  assert(verifyTicket(key, ticket)?.equals(Buffer.from(payload, "utf8")));
  assert.equal(readClaims(payload).role, "guest");

  const tampered = Buffer.from(buildGuestPayload(1001), "utf8").toString("base64url") + "." + ticket.split(".")[1];
  assert.equal(verifyTicket(key, tampered), null);
});

test("challenge-08 claims parser takes the last duplicate key like naive frameworks", () => {
  const claims = readClaims("visit=1&holder=guest&role=guest&holder=admin&role=winner");

  assert.equal(claims.role, "winner");
  assert.equal(claims.holder, "admin");
});

// 테스트 전용 최소 SHA-256 구현: 중간 상태에서 이어서 계산할 수 있어
// 실제 길이 확장 공격 구성을 검증하는 데 사용합니다.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function compress(state: Uint32Array, block: Uint8Array): Uint32Array {
  assert.equal(state.length, 8);
  assert.equal(block.length, 64);
  // The fixed SHA-256 block/state sizes bound every index used below.
  const w = new Uint32Array(64);
  for (let i = 0; i < 16; i += 1) {
    w[i] = ((block[i * 4]! << 24) | (block[i * 4 + 1]! << 16) | (block[i * 4 + 2]! << 8) | block[i * 4 + 3]!) >>> 0;
  }
  for (let i = 16; i < 64; i += 1) {
    const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
    const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
    w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
  }
  const h = Uint32Array.from(state);
  for (let i = 0; i < 64; i += 1) {
    const S1 = rotr(h[4]!, 6) ^ rotr(h[4]!, 11) ^ rotr(h[4]!, 25);
    const ch = (h[4]! & h[5]!) ^ (~h[4]! & h[6]!);
    const t1 = (h[7]! + S1 + ch + K[i]! + w[i]!) >>> 0;
    const S0 = rotr(h[0]!, 2) ^ rotr(h[0]!, 13) ^ rotr(h[0]!, 22);
    const maj = (h[0]! & h[1]!) ^ (h[0]! & h[2]!) ^ (h[1]! & h[2]!);
    const t2 = (S0 + maj) >>> 0;
    h[7] = h[6]!;
    h[6] = h[5]!;
    h[5] = h[4]!;
    h[4] = (h[3]! + t1) >>> 0;
    h[3] = h[2]!;
    h[2] = h[1]!;
    h[1] = h[0]!;
    h[0] = (t1 + t2) >>> 0;
  }
  return h.map((v, i) => (v + state[i]!) >>> 0) as Uint32Array;
}

function padFor(lengthBytes: number): Buffer {
  const lengthBits = lengthBytes * 8;
  let zeros = 56 - ((lengthBytes + 1) % 64);
  if (zeros < 0) zeros += 64;
  const padding = Buffer.alloc(1 + zeros + 8);
  padding[0] = 0x80;
  padding.writeUInt32BE(Math.floor(lengthBits / 2 ** 32), 1 + zeros);
  padding.writeUInt32BE(lengthBits >>> 0, 5 + zeros);
  return padding;
}

function sha256FromState(initState: Uint32Array, data: Buffer): string {
  let state: Uint32Array = Uint32Array.from(initState);
  for (let offset = 0; offset < data.length; offset += 64) {
    state = compress(state, data.subarray(offset, offset + 64));
  }
  return Array.from(state).map((v) => v.toString(16).padStart(8, "0")).join("");
}

const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

test("challenge-08 minimal sha256 matches node crypto for reference inputs", () => {
  const message = Buffer.from("hello world");
  assert.equal(sha256FromState(INITIAL_STATE, Buffer.concat([message, padFor(message.length)])), createHash("sha256").update(message).digest("hex"));
});

test("challenge-08 a genuine length-extension forge opens the vault as winner", () => {
  const key = deriveVaultKey("internal-token", "session-a");
  const keyLength = 32;
  const guestPayload = buildGuestPayload(1700000000);
  const guestTicket = encodeTicketValue(key, guestPayload);

  const originalHashState = new Uint32Array(
    guestTicket.split(".")[1]!.match(/.{8}/g)!.map((chunk) => Number.parseInt(chunk, 16)),
  );
  const suffix = "&role=winner";
  const originalLength = keyLength + guestPayload.length;

  // 공격자는 키 없이 원본 다이제스트를 초기 상태로 이어받아 확장합니다.
  // 원본(key||payload)의 패딩 자리가 곧 glue가 되므로, 계속 압축할 블록은 suffix+패딩뿐입니다.
  const glue = padFor(originalLength);
  const extensionData = Buffer.concat([Buffer.from(suffix, "utf8"), padFor(originalLength + glue.length + suffix.length)]);
  const forgedDigest = sha256FromState(originalHashState, extensionData);

  const forgedMessage = Buffer.concat([Buffer.from(guestPayload, "utf8"), glue, Buffer.from(suffix, "utf8")]);
  const forgedTicketValue = forgedMessage.toString("base64url") + "." + forgedDigest;

  const forgedPayload = verifyTicket(key, forgedTicketValue);
  assert(forgedPayload, "forged ticket must pass verification");
  assert(readClaims(forgedPayload).role === "winner");
  assert.notEqual(forgedTicketValue, guestTicket);
});

test("challenge-08 access grants are single-use and expire", () => {
  let clock = 1_000_000;
  const store = createGrantStore(() => clock);

  const token = store.issue("session-a");
  const grant = store.peek(token);
  assert(grant);

  clock += 9 * 60 * 1000;
  assert.equal(store.consume(token, "session-b"), undefined);
  assert(store.consume(token, "session-a"));
  assert.equal(store.consume(token, "session-a"), undefined);

  const second = store.issue("session-a");
  clock += 10 * 60 * 1000 + 1;
  assert.equal(store.peek(second), undefined);
});

test("challenge-08 validates both access cookies before consuming the grant", () => {
  const store = createGrantStore(() => 1_000_000);
  const token = store.issue("session-a");
  const grant = store.peek(token);
  assert(grant);

  assert.equal(consumeAccessGrant(store, token, "wrong-bonus-cookie", "session-a"), undefined);
  assert(store.peek(token), "a mismatched bonus cookie must not consume the grant");
  assert.equal(consumeAccessGrant(store, undefined, grant.bonusCookieValue, "session-a"), undefined);
  assert.equal(consumeAccessGrant(store, token, grant.bonusCookieValue, "session-b"), undefined);
  assert(store.peek(token), "a different session must not consume the grant");
  assert.equal(consumeAccessGrant(store, token, grant.bonusCookieValue, "session-a"), grant);
  assert.equal(consumeAccessGrant(store, token, grant.bonusCookieValue, "session-a"), undefined);
});

test("challenge-08 bounds outstanding grants and prunes expired entries", () => {
  let clock = 1_000_000;
  const store = createGrantStore(() => clock, 2);
  const original = store.issue("session-a");
  clock += 1_000;
  const replacement = store.issue("session-a");
  assert.equal(replacement, original, "concurrent checks must preserve an already-issued redirect");
  assert.equal(store.peek(replacement)?.expiresAt, 1_000_000 + 10 * 60 * 1_000, "rechecks must not extend the original grant lifetime");
  const other = store.issue("session-b");
  assert.throws(() => store.issue("session-c"), /capacity/);
  assert(store.peek(other), "capacity pressure must not invalidate another participant's grant");

  clock += 10 * 60 * 1000 + 1;
  const afterExpiry = store.issue("session-c");
  assert(store.peek(afterExpiry));
  assert.equal(store.peek(replacement), undefined);
  assert.equal(store.peek(other), undefined);
  assert(store.consume(afterExpiry, "session-c"));
  assert(store.issue("session-d"), "consumed grants must release capacity");
  assert.throws(() => createGrantStore(Date.now, 0), /positive integer/);
});

test("challenge-08 redirects without a query token and scopes access cookies to the prize path", () => {
  const headers = buildAccessGrantRedirect("opaque-access-token", "opaque-bonus-cookie");

  assert.equal(headers.location, "/bonus/vault/prize");
  assert.equal(headers.location.includes("?access="), false);
  assert.deepEqual(headers["set-cookie"], [
    "bonus_access=opaque-access-token; Path=/bonus/vault/prize; HttpOnly; Secure; SameSite=Strict; Max-Age=600",
    "bonus_success=opaque-bonus-cookie; Path=/bonus/vault/prize; HttpOnly; Secure; SameSite=Strict; Max-Age=600",
  ]);
});

test("challenge-08 pages keep flag material out of static renders", () => {
  const vault = renderVaultPage("guest");
  const denied = renderDeniedPage("guest");
  const prize = renderPrizePage("KDUCTF" + "{current_user_flag_08}");

  for (const page of [vault, denied, prize]) {
    assertGlobalHeader(page);
  }
  assert(vault.includes("role: guest"));
  assert(vault.includes("<form method=\"post\" action=\"/bonus/vault/check\">"));
  assert.equal(vault.includes("action=\"/check\""), false);
  assert(denied.includes("현재 권한으로는 금고를 열 수 없습니다."));
  assert(denied.includes("href=\"/bonus/vault/\""));
  assert.equal(denied.includes("href=\"/\""), false);
  assert.equal(renderVaultPage("winner").includes("KDUCTF" + "{"), false);

  assert(prize.includes("KDUCTF" + "{current_user_flag_08}"));
  assert.equal(renderPrizePage("KDUCTF" + "{other_flag}").includes("current_user_flag_08"), false);

  const parsed = parseTicketValue(encodeTicketValue(deriveVaultKey("t", "session-a"), buildGuestPayload()));
  assert(parsed?.payload.toString("latin1").includes("role=guest"));
  assert(signPayload(deriveVaultKey("t", "session-a"), buildGuestPayload()).length === 64);
});

test("challenge-08 derives different ticket keys for different sessions without exposing the raw token", () => {
  const bindingA = sessionBindingFromCookie("ctf_session=opaque-a; other=value");
  const bindingB = sessionBindingFromCookie("ctf_session=opaque-b");

  assert.match(bindingA ?? "", /^[0-9a-f]{64}$/);
  assert.match(bindingB ?? "", /^[0-9a-f]{64}$/);
  assert.notEqual(bindingA, bindingB);
  assert.equal(bindingA?.includes("opaque-a"), false);
  assert.notDeepEqual(deriveVaultKey("internal-token", bindingA!), deriveVaultKey("internal-token", bindingB!));
  assert.equal(sessionBindingFromCookie("ctf_session=%6Fpaque-a"), bindingA, "percent encoding must not create a different session identity");
  for (const cookie of [undefined, "", "ctf_session=", "ctf_session=%", "ctf_session=%252F", "ctf_session=bad%2Ftoken", "ctf_session=a; ctf_session=a", `ctf_session=${"a".repeat(513)}`]) {
    assert.equal(readSessionToken(cookie), null);
    assert.equal(sessionBindingFromCookie(cookie), null);
  }
});

test("challenge-08 preserves concurrent check redirects and consumes a grant only on an intentional prize request", async (t) => {
  await configureBackend(t);
  let backendCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    backendCalls += 1;
    return new Response(JSON.stringify({ flagId: "FLAG-08", flag: "KDUCTF" + "{grant_runtime}" }));
  });
  const store = createGrantStore();
  const port = await startServer(t, () => createChallengeServer(store));
  const sessionCookie = "ctf_session=runtime-test-session";
  const binding = sessionBindingFromCookie(sessionCookie)!;
  const winnerTicket = encodeTicketValue(deriveVaultKey("test-internal-token", binding), "role=winner");
  const redirects = await Promise.all([
    send(port, "/check", "POST", `${sessionCookie}; vault_ticket=${winnerTicket}`),
    send(port, "/check", "POST", `ctf_session=%72untime-test-session; vault_ticket=${winnerTicket}`),
  ]);
  for (const response of redirects) assert.equal(response.status, 303);
  assert.deepEqual(redirects[0]?.headers["set-cookie"], redirects[1]?.headers["set-cookie"]);
  const accessCookies = redirects[0]?.headers["set-cookie"]?.map((value) => value.split(";", 1)[0]).join("; ");
  assert(accessCookies);
  const cookie = `${sessionCookie}; ${accessCookies}`;
  const callsBeforeSpeculation = backendCalls;
  for (const headers of [
    { purpose: "prefetch" },
    { "sec-purpose": "prefetch;prerender" },
    { "sec-fetch-site": "same-origin", "sec-fetch-dest": "image" },
    { "sec-fetch-site": "same-site", "sec-fetch-dest": "document" },
    { "sec-fetch-site": "cross-site", "sec-fetch-dest": "empty" },
  ] as Array<Record<string, string>>) {
    const response = await send(port, "/prize", "GET", cookie, headers);
    assert.equal(response.status, 403);
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(backendCalls, callsBeforeSpeculation, "speculative requests must not authenticate or consume the grant");
  assert.equal((await send(port, "/prize", "HEAD", cookie)).status, 405);
  const accepted = await send(port, "/prize", "GET", cookie, { "sec-fetch-site": "same-origin", "sec-fetch-dest": "empty" });
  assert.equal(accepted.status, 200, "same-origin fetch must remain usable by puzzle solvers");
  assert(accepted.body.includes("KDUCTF" + "{grant_runtime}"));
  assert.equal((await send(port, "/prize", "GET", cookie)).status, 403, "consumed grants must reject replay");
});

registerHttpRuntimeTests({ createServer: createChallengeServer, challengeId: "08" });
