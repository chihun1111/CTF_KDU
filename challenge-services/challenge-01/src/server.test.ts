import assert from "node:assert/strict";
import test from "node:test";
import { buildFlagBackendRequest, readInternalServiceToken, renderFestivalPage } from "./server.js";

const GLOBAL_HEADER_MARKUP = '<header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 서비스</span></a><a class="campusGlobalHomeLink" href="/hub">전체 서비스</a></div></header>';

function assertCampusGlobalHeader(html: string): void {
  assert(html.includes(GLOBAL_HEADER_MARKUP));
  assert(html.indexOf(GLOBAL_HEADER_MARKUP) < html.indexOf('<nav class="serviceNav"'));
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

test("challenge-01 reads the internal service token from a mounted secret file", async () => {
  const token = await readInternalServiceToken(
    { INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_01" },
    async (path) => {
      assert.equal(path, "/run/secrets/internal_service_token_01");
      return "internal-token\n";
    },
  );

  assert.equal(token, "internal-token");
});

test("challenge-01 builds a current-session flag request without URL identity", () => {
  const request = buildFlagBackendRequest({
    backendInternalUrl: "http://backend:8080",
    cookieHeader: "ctf_session=opaque",
    serviceToken: "internal-token",
  });

  assert.equal(request.url, "http://backend:8080/internal/challenges/01/flag");
  assert.deepEqual(request.headers, {
    authorization: "Bearer internal-token",
    cookie: "ctf_session=opaque",
  });
  assert.equal(JSON.stringify(request).includes("userId"), false);
  assert.equal(JSON.stringify(request).includes("studentId"), false);
});

test("challenge-01 page embeds only the current session flag inside an HTML comment", () => {
  const flag = "KDUCTF" + "{current_user_flag_01}";
  const otherFlag = "KDUCTF" + "{other_user_flag_01}";
  const html = renderFestivalPage(flag);

  assert(html.includes(`archive-note: ${flag}`));
  assert.equal(html.includes(otherFlag), false);
  assert.equal(html.split("KDUCTF" + "{").length - 1, 1);
  assert(html.includes("<section id=\"draft-panel\" hidden"));
});

test("challenge-01 page includes the global campus header above the local service navigation", () => {
  assertCampusGlobalHeader(renderFestivalPage("KDUCTF" + "{current_user_flag_01}"));
});

test("challenge-01 page keeps decoy comments that contain no flag material", () => {
  const html = renderFestivalPage("KDUCTF" + "{current_user_flag_01}");

  assert(html.includes("<!-- draft: 부스 배치 확정 후 이 문구를 업데이트할 것 -->"));
  assert(html.includes("초안 문구는 내부 검토 후 공개됩니다."));
  assert.equal(html.includes("FLAG-01"), false);
});
