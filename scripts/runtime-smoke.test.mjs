import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const MOCK_GLOBAL_HEADER = `
  <header class="campusGlobalHeader">
    <div class="campusGlobalHeaderInner">
      <a class="campusGlobalBrand" href="/" aria-label="교내 CTF 목록으로 돌아가기">
        <span class="campusGlobalBrandMark">KDU</span>
        <span class="campusGlobalBrandText">교내 CTF</span>
      </a>
      <a class="campusGlobalHomeLink" href="/">문제 목록</a>
    </div>
  </header>
`;

test("runtime-smoke publishes the deployment checklist probes it can execute", () => {
  const output = execFileSync(process.execPath, ["scripts/runtime-smoke.mjs", "--print-checklist"], {
    encoding: "utf8",
  });
  const checklist = JSON.parse(output);

  assert.deepEqual(
    checklist.requiredEndpoints,
    [
      "/health",
      "/api/health",
      "/internal/challenges/01/flag",
      "/api/auth/register",
      "/api/auth/me",
      "/api/services",
      "/api/presence/heartbeat",
      "/api/final-submit",
      "/api/admin/operations/online-count",
      "/?userId=smoke-other&session=smoke-other",
      "/clear",
      "/challenges/01/",
      "/challenges/02/",
      "/challenges/03/",
      "/challenges/03/view?id=1",
      "/challenges/04/",
      "/challenges/05/",
      "/challenges/06/",
      "/challenges/07/",
      "/challenges/08/",
    ],
  );
  assert.deepEqual(checklist.disabledEndpoints, ["/api/services/it-center-status/artifact"]);
  assert.equal(checklist.optionalClearFlow, "--flags-file");
  assert.equal(checklist.optionalAdminFlow, "--admin-cookie");
});

test("runtime-smoke accepts the pnpm argument delimiter used in deployment docs", () => {
  const output = execFileSync(process.execPath, ["scripts/runtime-smoke.mjs", "--", "--print-checklist"], {
    encoding: "utf8",
  });

  assert.equal(JSON.parse(output).optionalClearFlow, "--flags-file");
});

function execNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, output: `${stdout}${stderr}` });
    });
  });
}

test("runtime-smoke accepts the current services response shape", async () => {
  const serviceRoutes = [
    "/challenges/01/",
    "/challenges/02/",
    "/challenges/03/",
    "/challenges/04/",
    "/challenges/05/",
    "/challenges/06/",
    "/challenges/07/",
    "/challenges/08/",
  ];
  const services = serviceRoutes.map((serviceHref, index) => ({
    id: String(index + 1).padStart(2, "0"),
    serviceHref,
    difficultyLevel: [1, 2, 2, 2, 1, 2, 3, 4][index],
    difficulty: ["입문", "초급", "초급", "초급", "입문", "초급", "중급", "고급"][index],
    category: "Web",
  }));

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url.pathname === "/api/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ backend: { status: "ok" }, postgres: { status: "ok" }, redis: { status: "ok" } }));
      return;
    }

    if (url.pathname.startsWith("/internal/")) {
      response.writeHead(404).end();
      return;
    }

    if (url.pathname === "/api/auth/register") {
      response.writeHead(201, {
        "content-type": "application/json",
        "set-cookie": "ctf_session=mock-session; HttpOnly; Path=/",
      });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/auth/me") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ authenticated: true, role: "participant" }));
      return;
    }

    if (url.pathname === "/api/services") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ services }));
      return;
    }

    if (url.pathname === "/api/services/it-center-status/artifact") {
      response.writeHead(404).end();
      return;
    }

    if (url.pathname === "/api/presence/heartbeat") {
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/services/club-security-site") {
      if (!request.headers.cookie?.includes("ctf_session=mock-session")) {
        response.writeHead(401).end();
        return;
      }
      response.writeHead(307, { location: "/challenges/05/" }).end();
      return;
    }

    if (serviceRoutes.includes(url.pathname)) {
      const service = services.find((item) => item.serviceHref === url.pathname);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
        `<!doctype html><html><body>${MOCK_GLOBAL_HEADER}<main><span class="difficultyBadge" data-level="${service.difficultyLevel}">난이도: ${service.difficulty}</span>서비스</main></body></html>`,
      );
      return;
    }

    if (url.pathname === "/challenges/03/view") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><h1>프로그래밍 기초 과제 1</h1><section>상세 정보</section>");
      return;
    }

    if (url.pathname === "/") {
      if (!request.headers.cookie?.includes("ctf_session=mock-session")) {
        response.writeHead(401).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        `<main>${serviceRoutes.map((serviceHref) => `<a href="${serviceHref}">서비스</a>`).join("")}</main>`,
      );
      return;
    }

    if (url.pathname === "/api/final-submit") {
      response.writeHead(201, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          cleared: false,
          requiredCount: 8,
          resultsByFlagId: { "FLAG-01": { correct: false } },
        }),
      );
      return;
    }

    if (url.pathname === "/api/admin/operations/online-count") {
      response.writeHead(403).end();
      return;
    }

    if (url.pathname === "/clear") {
      if (request.headers["sec-fetch-site"] !== "same-origin"
        || request.headers["sec-fetch-dest"] !== "document"
        || request.headers["sec-fetch-mode"] !== "navigate"
        || !request.headers.cookie?.includes("ctf_session=mock-session")) {
        response.writeHead(403).end();
        return;
      }
      response.writeHead(302, { location: "/submit" }).end();
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const result = await execNode(["scripts/runtime-smoke.mjs", "--base-url", `http://127.0.0.1:${port}`]);

    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /service list contains the eight participant services/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
