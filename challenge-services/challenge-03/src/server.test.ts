import { registerHttpRuntimeTests } from "../../test-support/http-runtime.mjs";
import { createChallengeServer } from "./server.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssignmentRows,
  buildFlagBackendRequest,
  escapeHtml,
  readInternalServiceToken,
  renderAssignmentDetail,
  renderErrorPage,
  renderAssignmentList,
} from "./server.js";

const GLOBAL_HEADER_MARKUP = '<header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 서비스</span></a><a class="campusGlobalHomeLink" href="/hub">전체 서비스</a></div></header>';

function assertCampusGlobalHeader(html: string, localHeader = '<header class="serviceHeader">'): void {
  assert(html.includes(GLOBAL_HEADER_MARKUP));
  if (localHeader) {
    assert(html.indexOf(GLOBAL_HEADER_MARKUP) < html.indexOf(localHeader));
  }
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

test("challenge-03 reads the internal service token from a mounted secret file", async () => {
  const token = await readInternalServiceToken(
    { INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_03" },
    async (path) => {
      assert.equal(path, "/run/secrets/internal_service_token_03");
      return "internal-token\n";
    },
  );

  assert.equal(token, "internal-token");
});

test("challenge-03 builds a current-session flag request without URL identity", () => {
  const request = buildFlagBackendRequest({
    backendInternalUrl: "http://backend:8080",
    cookieHeader: "ctf_session=opaque",
    serviceToken: "internal-token",
  });

  assert.equal(request.url, "http://backend:8080/internal/challenges/03/flag");
  assert.deepEqual(request.headers, {
    authorization: "Bearer internal-token",
    cookie: "ctf_session=opaque",
  });
  assert.equal(JSON.stringify(request).includes("userId"), false);
  assert.equal(JSON.stringify(request).includes("studentId"), false);
});

test("challenge-03 list shows only the demo user's submissions", () => {
  const html = renderAssignmentList();

  assert(html.includes("프로그래밍 기초 과제 1"));
  assert(html.includes("웹프로그래밍 보고서"));
  assert.equal(html.includes("자료구조 실습 보고서"), false);
  assert(html.includes("/student/assignments/view?id=1"));
  assert.equal(html.includes("KDUCTF" + "{"), false);
});

test("challenge-03 detail intentionally renders any submission id without ownership check", () => {
  const flag = "KDUCTF" + "{current_user_flag_03}";
  const rows = buildAssignmentRows(flag);
  assert(rows[3]);
  assert(rows[2]);

  const privateRow = renderAssignmentDetail(rows[3]);
  assert(privateRow.includes("비공개 과제 검토"));
  assert(privateRow.includes(escapeHtml(`운영 메모: ${flag}`)));

  const otherStudentRow = renderAssignmentDetail(rows[2]);
  assert(otherStudentRow.includes("student02"));

  assert.equal(renderAssignmentList().includes("비공개 과제 검토"), false);
});

test("challenge-03 flag material never leaks into another user's rows", () => {
  const currentFlag = "KDUCTF" + "{current_user_flag_03}";
  const otherFlag = "KDUCTF" + "{other_user_flag_03}";
  const row = buildAssignmentRows(currentFlag)[3];
  assert(row);
  const html = renderAssignmentDetail(row);

  assert(html.includes(currentFlag));
  assert.equal(html.includes(otherFlag), false);
});

test("challenge-03 list, detail, and error pages include the global campus header", () => {
  assertCampusGlobalHeader(renderAssignmentList());
  assertCampusGlobalHeader(renderAssignmentDetail({ id: 1, title: "과제", owner: "student01", status: "제출 완료" }));
  assertCampusGlobalHeader(renderErrorPage("요청을 처리하지 못했습니다."), "");
});

registerHttpRuntimeTests({ createServer: createChallengeServer, challengeId: "03" });
