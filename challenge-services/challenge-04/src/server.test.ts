import { registerHttpRuntimeTests } from "../../test-support/http-runtime.mjs";
import { createChallengeServer } from "./server.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFlagBackendRequest,
  readInternalServiceToken,
  renderAdminPage,
  renderAdminScript,
} from "./server.js";

const GLOBAL_HEADER_MARKUP = '<header class="campusGlobalHeader"><div class="campusGlobalHeaderInner"><a class="campusGlobalBrand" href="/" aria-label="문제 목록으로 돌아가기"><span class="campusGlobalBrandMark">KDU</span><span class="campusGlobalBrandText">교내 CTF</span></a><a class="campusGlobalHomeLink" href="/">문제 목록</a></div></header>';

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

test("challenge-04 reads the internal service token from a mounted secret file", async () => {
  const token = await readInternalServiceToken(
    { INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_04" },
    async (path) => {
      assert.equal(path, "/run/secrets/internal_service_token_04");
      return "internal-token\n";
    },
  );

  assert.equal(token, "internal-token");
});

test("challenge-04 builds a current-session flag request without URL identity", () => {
  const request = buildFlagBackendRequest({
    backendInternalUrl: "http://backend:8080",
    cookieHeader: "ctf_session=opaque",
    serviceToken: "internal-token",
  });

  assert.equal(request.url, "http://backend:8080/internal/challenges/04/flag");
  assert.deepEqual(request.headers, {
    authorization: "Bearer internal-token",
    cookie: "ctf_session=opaque",
  });
  assert.equal(JSON.stringify(request).includes("userId"), false);
  assert.equal(JSON.stringify(request).includes("studentId"), false);
});

test("challenge-04 page keeps the admin panel hidden and free of flag material", () => {
  const html = renderAdminPage();

  assert(html.includes("<section id=\"admin-panel\" class=\"panel\" hidden"));
  assert(html.includes("<div id=\"flag-box\"></div>"));
  assert.equal(html.includes("KDUCTF" + "{"), false);
  assert.equal(html.includes("FLAG-04"), false);
  assert.equal(html.includes('src="/assets/app.js"'), false);
  assert(html.includes("/challenges/04/assets/app.js"));
});

test("challenge-04 page includes the global campus header above the local service header", () => {
  assertCampusGlobalHeader(renderAdminPage());
});

test("challenge-04 script trusts client-side isAdmin storage and embeds the flag only there", () => {
  const flag = "KDUCTF" + "{current_user_flag_04}";
  const otherFlag = "KDUCTF" + "{other_user_flag_04}";
  const script = renderAdminScript(flag);

  assert(script.includes('localStorage.getItem("isAdmin") === null'));
  assert(script.includes('"isAdmin", "false"'));
  assert(script.includes('"isAdmin") === "true"'));
  assert(script.includes(JSON.stringify(flag)));
  assert.equal(script.includes(otherFlag), false);
});

registerHttpRuntimeTests({ createServer: createChallengeServer, challengeId: "04" });
