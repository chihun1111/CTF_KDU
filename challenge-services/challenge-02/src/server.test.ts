import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDebugBody,
  buildFlagBackendRequest,
  buildRobotsTxt,
  buildStatusBody,
  readInternalServiceToken,
  renderStatusPage,
  renderStatusScript,
} from "./server.js";

const GLOBAL_HEADER_MARKUP = '<header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 서비스</span></a><a class="campusGlobalHomeLink" href="/hub">전체 서비스</a></div></header>';

function assertCampusGlobalHeader(html: string): void {
  assert(html.includes(GLOBAL_HEADER_MARKUP));
  assert(html.indexOf(GLOBAL_HEADER_MARKUP) < html.indexOf('<header class="serviceHeader">'));
  assert(html.includes(".campusGlobalHeader {"));
  assert(html.includes("width: min(1120px, calc(100% - 32px));"));
  assert(html.includes("background: #003366;"));
  assert(html.includes("width: 42px;"));
  assert(html.includes("height: 28px;"));
  assert(/\.campusGlobalBrandText\s*\{\s*display:\s*none;/.test(html));
  assert(html.includes(".campusGlobalBrand:focus-visible"));
  assert(html.includes("outline: 3px solid rgb(0 51 102 / 0.2);"));
  assert(html.includes("min-height: 44px;"));
}

test("challenge-02 reads the internal service token from a mounted secret file", async () => {
  const token = await readInternalServiceToken(
    { INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_02" },
    async (path) => {
      assert.equal(path, "/run/secrets/internal_service_token_02");
      return "internal-token\n";
    },
  );

  assert.equal(token, "internal-token");
});

test("challenge-02 builds a current-session flag request without URL identity", () => {
  const request = buildFlagBackendRequest({
    backendInternalUrl: "http://backend:8080",
    cookieHeader: "ctf_session=opaque",
    serviceToken: "internal-token",
  });

  assert.equal(request.url, "http://backend:8080/internal/challenges/02/flag");
  assert.deepEqual(request.headers, {
    authorization: "Bearer internal-token",
    cookie: "ctf_session=opaque",
  });
  assert.equal(JSON.stringify(request).includes("userId"), false);
  assert.equal(JSON.stringify(request).includes("studentId"), false);
});

test("challenge-02 robots.txt advertises the debug endpoint without flag material", () => {
  const robots = buildRobotsTxt();

  assert(robots.includes("Disallow: /system/status/api/debug"));
  assert.equal(robots.includes("Disallow: /api/debug"), false);
  assert.equal(robots.includes("KDUCTF" + "{"), false);
  assert.equal(robots.includes("FLAG-02"), false);
});

test("challenge-02 status payload never contains the flag", () => {
  const body = JSON.stringify(buildStatusBody());

  assert.equal(body.includes("flag"), false);
  assert.equal(body.includes("KDUCTF" + "{"), false);
  assert.equal(body.includes("debug"), false);
});

test("challenge-02 debug payload returns the current session flag only", () => {
  const flag = "KDUCTF" + "{current_user_flag_02}";
  const otherFlag = "KDUCTF" + "{other_user_flag_02}";
  const body = JSON.stringify(buildDebugBody(flag));

  assert(body.includes(flag));
  assert.equal(body.includes(otherFlag), false);
  assert((buildDebugBody(otherFlag) as unknown as { flag: string }).flag === otherFlag);
});

test("challenge-02 page and script expose no flag or debug route", () => {
  const page = renderStatusPage();
  const script = renderStatusScript();

  assert.equal(page.includes("api/debug"), false);
  assert.equal(page.includes("KDUCTF" + "{"), false);
  assert.equal(page.includes('src="/assets/status.js"'), false);
  assert.equal(script.includes("api/debug"), false);
  assert.equal(script.includes("KDUCTF" + "{"), false);
  assert(page.includes("/system/status/assets/status.js"));
  assert(script.includes("/system/status/api/status"));
  assert.equal(script.includes('fetch("/api/status")'), false);
});

test("challenge-02 status page includes the global campus header above the local service header", () => {
  assertCampusGlobalHeader(renderStatusPage());
});
