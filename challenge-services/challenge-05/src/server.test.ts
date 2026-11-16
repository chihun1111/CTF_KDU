import { registerHttpRuntimeTests } from "../../test-support/http-runtime.mjs";
import { createChallengeServer } from "./server.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFlagBackendRequest,
  readInternalServiceToken,
  renderMainScript,
  renderPromoPage,
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
  assert(html.indexOf('class="campusGlobalHeader"') < html.indexOf('class="serviceHeader"'));
}

test("challenge-05 reads the internal service token from a mounted secret file", async () => {
  const token = await readInternalServiceToken(
    { INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_05" },
    async (path) => {
      assert.equal(path, "/run/secrets/internal_service_token_05");
      return "internal-token\n";
    },
  );

  assert.equal(token, "internal-token");
});

test("challenge-05 builds a current-session flag request without URL identity", () => {
  const request = buildFlagBackendRequest({
    backendInternalUrl: "http://backend:8080",
    cookieHeader: "ctf_session=opaque",
    serviceToken: "internal-token",
  });

  assert.equal(request.url, "http://backend:8080/internal/challenges/05/flag");
  assert.deepEqual(request.headers, {
    authorization: "Bearer internal-token",
    cookie: "ctf_session=opaque",
  });
  assert.equal(JSON.stringify(request).includes("userId"), false);
  assert.equal(JSON.stringify(request).includes("studentId"), false);
});

test("challenge-05 page loads the bundle but never embeds flag material", () => {
  const html = renderPromoPage();

  assertGlobalHeader(html);
  assert(html.includes("/clubs/security/assets/main.js"));
  assert.equal(html.includes('src="/assets/main.js"'), false);
  assert.equal(html.includes("KDUCTF" + "{"), false);
  assert.equal(html.includes("sourceMappingURL"), false);
  assert.equal(html.includes("FLAG-05"), false);
});

test("challenge-05 bundle keeps the deploy memo and points at the build archive map", () => {
  const flag = "KDUCTF" + "{current_user_flag_05}";
  const otherFlag = "KDUCTF" + "{other_user_flag_05}";
  const script = renderMainScript(flag);

  assert(script.includes(`// BUILD NOTE(deploy): legacy banner id kept for rollback: ${flag}`));
  assert(script.includes("//# sourceMappingURL=/clubs/build-archive/assets/main.js.map"));
  assert(script.trimEnd().endsWith("//# sourceMappingURL=/clubs/build-archive/assets/main.js.map"));
  assert.equal(script.includes(otherFlag), false);
});

registerHttpRuntimeTests({ createServer: createChallengeServer, challengeId: "05" });
