import { registerHttpRuntimeTests } from "../../test-support/http-runtime.mjs";
import { createChallengeServer } from "./server.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFlagBackendRequest,
  readInternalServiceToken,
  renderArchivePage,
  renderSourceMap,
} from "./server.js";

const GLOBAL_HEADER_MARKUP =
  '<header class="campusGlobalHeader"> <div class="campusGlobalHeaderInner"> <a class="campusGlobalBrand" href="/" aria-label="문제 목록으로 돌아가기"> <span class="campusGlobalBrandMark">KDU</span> <span class="campusGlobalBrandText">교내 CTF</span> </a> <a class="campusGlobalHomeLink" href="/">문제 목록</a> </div> </header>';

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

test("challenge-06 reads the internal service token from a mounted secret file", async () => {
  const token = await readInternalServiceToken(
    { INTERNAL_SERVICE_TOKEN_FILE: "/run/secrets/internal_service_token_06" },
    async (path) => {
      assert.equal(path, "/run/secrets/internal_service_token_06");
      return "internal-token\n";
    },
  );

  assert.equal(token, "internal-token");
});

test("challenge-06 builds a current-session flag request without URL identity", () => {
  const request = buildFlagBackendRequest({
    backendInternalUrl: "http://backend:8080",
    cookieHeader: "ctf_session=opaque",
    serviceToken: "internal-token",
  });

  assert.equal(request.url, "http://backend:8080/internal/challenges/06/flag");
  assert.deepEqual(request.headers, {
    authorization: "Bearer internal-token",
    cookie: "ctf_session=opaque",
  });
  assert.equal(JSON.stringify(request).includes("userId"), false);
  assert.equal(JSON.stringify(request).includes("studentId"), false);
});

test("challenge-06 archive page links the source map without flag material", () => {
  const html = renderArchivePage();

  assertGlobalHeader(html);
  assert(html.includes("/challenges/06/assets/main.js.map"));
  assert.equal(html.includes("KDUCTF" + "{"), false);
  assert.equal(html.includes("ARCHIVE_ENTRY"), false);
  assert.equal(html.includes("FLAG-06"), false);
});

test("challenge-06 source map hides the current session flag in sourcesContent", () => {
  const flag = "KDUCTF" + "{current_user_flag_06}";
  const otherFlag = "KDUCTF" + "{other_user_flag_06}";
  const map = JSON.parse(renderSourceMap(flag)) as {
    version: number;
    file: string;
    sources: string[];
    sourcesContent: string[];
  };

  assert.equal(map.version, 3);
  assert.equal(map.file, "main.js");
  assert.deepEqual(map.sources, ["../../src/config/archive.js"]);
  assert(map.sourcesContent[0]);
  assert(map.sourcesContent[0].includes(`const ARCHIVE_ENTRY = ${JSON.stringify(flag)}`));
  assert.equal(renderSourceMap(otherFlag).includes(flag), false);
});

registerHttpRuntimeTests({ createServer: createChallengeServer, challengeId: "06" });
