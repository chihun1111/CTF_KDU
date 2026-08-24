import { readFileSync } from "node:fs";

const FINAL_FLAG_IDS = ["FLAG-01", "FLAG-02", "FLAG-03", "FLAG-04", "FLAG-05", "FLAG-06", "FLAG-07", "FLAG-08"];

const ACTIVE_SERVICE_ROUTES = [
  { id: "01", serviceHref: "/campus/festival/" },
  { id: "02", serviceHref: "/system/status/" },
  { id: "03", serviceHref: "/student/assignments/" },
  { id: "04", serviceHref: "/clubs/admin/" },
  { id: "05", serviceHref: "/clubs/security/" },
  { id: "06", serviceHref: "/clubs/build-archive/" },
  { id: "07", serviceHref: "/community/board/" },
  { id: "08", serviceHref: "/bonus/vault/" },
];

const CHECKLIST = {
  requiredEndpoints: [
    "/health",
    "/api/health",
    "/internal/challenges/01/flag",
    "/api/auth/register",
    "/api/auth/me",
    "/api/services",
    "/api/presence/heartbeat",
    "/api/final-submit",
    "/api/admin/operations/online-count",
    "/hub?userId=smoke-other&session=smoke-other",
    "/clear",
    "/campus/festival/",
    "/system/status/",
    "/student/assignments/",
    "/student/assignments/view?id=1",
    "/clubs/admin/",
    "/clubs/security/",
    "/clubs/build-archive/",
    "/community/board/",
    "/bonus/vault/",
  ],
  disabledEndpoints: ["/api/services/it-center-status/artifact"],
  optionalClearFlow: "--flags-file",
  optionalAdminFlow: "--admin-cookie",
};

function parseArgs(argv) {
  const options = {
    baseUrl: "http://localhost",
    studentId: null,
    password: `Smoke-${Date.now()}-password`,
    flagsFile: null,
    adminCookie: null,
    printChecklist: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--base-url") {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--student-id") {
      options.studentId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--password") {
      options.password = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--flags-file") {
      options.flagsFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--admin-cookie") {
      options.adminCookie = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--print-checklist") {
      options.printChecklist = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  options.studentId ??= String(9000000 + Math.floor(Math.random() * 999999)).slice(0, 7);
  return options;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function mergeCookies(cookieHeader, response) {
  const cookies = new Map();
  for (const part of cookieHeader.split(/;\s*/).filter(Boolean)) {
    const [name, ...rest] = part.split("=");
    cookies.set(name, rest.join("="));
  }
  for (const setCookie of getSetCookies(response.headers)) {
    const [pair] = setCookie.split(";");
    const [name, ...rest] = pair.split("=");
    if (name && rest.length > 0) {
      cookies.set(name, rest.join("="));
    }
  }
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${new URL(response.url).pathname}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isExpectedServiceRedirect(location, expectedPath, baseUrl) {
  if (location === expectedPath) {
    return true;
  }

  try {
    const actual = new URL(location);
    const expected = new URL(expectedPath, baseUrl);
    return (
      actual.origin === expected.origin &&
      actual.pathname === expected.pathname &&
      actual.search === expected.search &&
      actual.hash === expected.hash
    );
  } catch {
    return false;
  }
}

function assertServiceGlobalHeader(body, route) {
  assert(body.includes('class="campusGlobalHeader"'), `${route} did not render campusGlobalHeader`);
  assert(body.includes("KDU"), `${route} did not render the KDU brand mark`);
  assert(body.includes("교내 서비스"), `${route} did not render the campus service brand text`);
  assert(body.includes("전체 서비스"), `${route} did not render the all-services link text`);

  const openingTags = [...body.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
  assert(
    openingTags.some(
      (tag) => /class=["'][^"']*\bcampusGlobalBrand\b[^"']*["']/.test(tag) && /href=["']\/hub["']/.test(tag),
    ),
    `${route} did not render campusGlobalBrand href=/hub`,
  );
  assert(
    openingTags.some(
      (tag) => /class=["'][^"']*\bcampusGlobalHomeLink\b[^"']*["']/.test(tag) && /href=["']\/hub["']/.test(tag),
    ),
    `${route} did not render campusGlobalHomeLink href=/hub`,
  );
}

async function request(options, path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (init.cookie) {
    headers.set("cookie", init.cookie);
  }
  return fetch(`${options.baseUrl}${path}`, {
    ...init,
    headers,
    redirect: init.redirect ?? "manual",
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

function fakeFlags() {
  return Object.fromEntries(FINAL_FLAG_IDS.map((flagId) => [flagId, `KDUCTF{runtime_smoke_${flagId.toLowerCase()}}`]));
}

function oneFakeFlag() {
  return { "FLAG-01": "KDUCTF{runtime_smoke_flag_01}" };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.printChecklist) {
    console.log(JSON.stringify(CHECKLIST, null, 2));
    return;
  }

  const results = [];
  let cookie = "";

  async function step(name, callback) {
    await callback();
    results.push(name);
    console.log(`[runtime-smoke] ${name}`);
  }

  await step("frontend health responds", async () => {
    const response = await request(options, "/health");
    assert(response.status === 200, `/health returned ${response.status}`);
  });

  await step("backend dependency health responds", async () => {
    const response = await request(options, "/api/health");
    assert(response.status === 200, `/api/health returned ${response.status}`);
    const body = await readJson(response);
    assert(body.backend?.status === "ok", "backend health is not ok");
    assert(body.postgres?.status === "ok", "postgres health is not ok");
    assert(body.redis?.status === "ok", "redis health is not ok");
  });

  await step("external internal route is blocked", async () => {
    const response = await request(options, "/internal/challenges/01/flag");
    assert([403, 404].includes(response.status), `/internal route returned ${response.status}`);
  });

  await step("registration issues only an HttpOnly ctf_session cookie", async () => {
    const response = await request(options, "/api/auth/register", {
      method: "POST",
      json: {
        studentId: options.studentId,
        password: options.password,
        consent: {
          consentVersion: "runtime-smoke",
          requiredLoggingAccepted: true,
          analyticsLoggingAccepted: false,
          cookieAccepted: true,
        },
      },
    });
    assert([200, 201].includes(response.status), `/api/auth/register returned ${response.status}`);
    const setCookie = getSetCookies(response.headers).join("\n");
    assert(/ctf_session=/.test(setCookie), "registration did not set ctf_session");
    assert(/HttpOnly/i.test(setCookie), "ctf_session is not HttpOnly");
    const bodyText = await response.text();
    assert(!bodyText.includes("ctf_session"), "registration body includes session material");
    cookie = mergeCookies(cookie, response);
  });

  await step("session cookie authenticates the participant", async () => {
    const response = await request(options, "/api/auth/me", { cookie });
    assert(response.status === 200, `/api/auth/me returned ${response.status}`);
    const body = await readJson(response);
    assert(body.authenticated === true, "registered session is not authenticated");
    assert(body.role === "participant", `expected participant role, got ${body.role}`);
  });

  await step("service list contains the eight participant services", async () => {
    const response = await request(options, "/api/services", { cookie });
    assert(response.status === 200, `/api/services returned ${response.status}`);
    const body = await readJson(response);
    assert(Array.isArray(body.services), "service list is not an array");
    assert(body.services.length === ACTIVE_SERVICE_ROUTES.length, `expected 8 services, got ${body.services.length}`);
    const serviceRoutes = body.services.map((service) => ({ id: service.id, serviceHref: service.serviceHref }));
    assert(
      JSON.stringify(serviceRoutes) === JSON.stringify(ACTIVE_SERVICE_ROUTES),
      "service list does not match the eight active service routes",
    );
    assert(
      body.services.every(
        (service) =>
          !("guideHref" in service) &&
          !("guideUrl" in service) &&
          !("artifactHref" in service) &&
          !("artifactUrl" in service) &&
          !("claimHref" in service) &&
          !("claimUrl" in service),
      ),
      "service list exposed a legacy guide, artifact, or claim link",
    );
  });

  await step("legacy artifact download route is disabled", async () => {
    const response = await request(options, "/api/services/it-center-status/artifact", { cookie });
    assert(response.status === 404, `legacy artifact route returned ${response.status}`);
  });

  await step("presence heartbeat accepts the session", async () => {
    const response = await request(options, "/api/presence/heartbeat", { method: "POST", cookie });
    assert(response.status === 201 || response.status === 200, `/api/presence/heartbeat returned ${response.status}`);
    const body = await readJson(response);
    assert(body.ok === true, "heartbeat did not return ok");
  });

  await step("challenge service routes are reachable through nginx", async () => {
    for (const { serviceHref: route } of ACTIVE_SERVICE_ROUTES) {
      const response = await request(options, route, { cookie });
      assert(![404, 502, 503, 504].includes(response.status), `${route} returned ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      assert(contentType.includes("text/html"), `${route} content-type was ${contentType}`);
      const body = await response.text();
      assertServiceGlobalHeader(body, route);
    }
  });

  await step("legacy service route redirects directly to the actual service", async () => {
    const response = await request(options, "/services/club-security-site", { cookie });
    assert(response.status >= 300 && response.status < 400, `/services/club-security-site returned ${response.status}`);
    const location = response.headers.get("location") ?? "";
    assert(
      isExpectedServiceRedirect(location, "/clubs/security/", options.baseUrl),
      `/services/club-security-site redirected to an unexpected location: ${location || "<missing>"}`,
    );
  });

  await step("assignment detail renders html", async () => {
    const response = await request(options, "/student/assignments/view?id=1", { cookie });
    assert(response.status === 200, `/student/assignments/view?id=1 returned ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    assert(contentType.includes("text/html"), `assignment detail content-type was ${contentType}`);
    const body = await response.text();
    assert(body.includes("상세 정보"), "assignment detail did not render the detail page");
    assert(body.includes("<section"), "assignment detail did not render submission content");
    assert(!body.includes('"rows"'), "assignment detail returned raw JSON rows");
  });

  await step("authenticated hub renders direct links to all eight services", async () => {
    const response = await request(options, "/hub?userId=smoke-other&session=smoke-other", { cookie });
    assert(response.status === 200, `/hub query manipulation returned ${response.status}`);
    const body = await response.text();
    assert(!body.includes("/services/"), "hub rendered the legacy service guide route");
    for (const { serviceHref } of ACTIVE_SERVICE_ROUTES) {
      assert(
        body.includes(`href="${serviceHref}"`) || body.includes(`href='${serviceHref}'`),
        `hub did not render a direct href for ${serviceHref}`,
      );
    }
  });

  await step("partial final submit returns aggregate results without clear cookie", async () => {
    const response = await request(options, "/api/final-submit", {
      method: "POST",
      cookie,
      json: { flagsByFlagId: oneFakeFlag() },
    });
    assert([200, 201].includes(response.status), `/api/final-submit returned ${response.status}`);
    const setCookie = getSetCookies(response.headers).join("\n");
    assert(!/ctf_clear_once=/.test(setCookie), "partial submit set ctf_clear_once");
    const body = await readJson(response);
    assert(body.cleared === false, "partial submit unexpectedly cleared");
    assert(body.requiredCount === 8, "partial submit requiredCount is not 8");
    assert(Object.keys(body.resultsByFlagId ?? {}).length === 1, "partial submit returned unsubmitted result slots");
    assert(body.resultsByFlagId?.["FLAG-01"]?.correct === false, "partial submit did not report the submitted slot");
  });

  await step("participant session cannot read admin online count", async () => {
    const response = await request(options, "/api/admin/operations/online-count", { cookie });
    assert(response.status === 403, `/api/admin/operations/online-count returned ${response.status} for participant`);
  });

  await step("clear page requires a one-time clear cookie", async () => {
    const response = await request(options, "/clear", { cookie });
    assert([302, 303, 307, 308].includes(response.status), `/clear returned ${response.status} without clear cookie`);
    assert((response.headers.get("location") ?? "").includes("/submit"), "clear page did not redirect to submit");
  });

  if (options.adminCookie) {
    await step("admin cookie can read aggregate online count", async () => {
      const response = await request(options, "/api/admin/operations/online-count", { cookie: options.adminCookie });
      assert(response.status === 200, `/api/admin/operations/online-count returned ${response.status} for admin`);
      const body = await readJson(response);
      assert(typeof body.activeSessionCount === "number", "online count response lacks activeSessionCount");
    });
  }

  if (options.flagsFile) {
    const flagsByFlagId = JSON.parse(readFileSync(options.flagsFile, "utf8"));
    await step("valid final submit issues one-time clear cookie", async () => {
      const response = await request(options, "/api/final-submit", {
        method: "POST",
        cookie,
        json: { flagsByFlagId },
      });
      const setCookie = getSetCookies(response.headers).join("\n");
      assert(/ctf_clear_once=/.test(setCookie), "valid submit did not set ctf_clear_once");
      const body = await readJson(response);
      assert(body.cleared === true, "valid submit did not clear");
      cookie = mergeCookies(cookie, response);
    });

    await step("clear page consumes the one-time cookie once", async () => {
      const first = await request(options, "/clear", { cookie });
      assert(first.status === 200, `/clear first render returned ${first.status}`);
      cookie = mergeCookies(cookie, first);
      const second = await request(options, "/clear", { cookie });
      assert([302, 303, 307, 308].includes(second.status), `/clear second render returned ${second.status}`);
    });
  }

  console.log(`[runtime-smoke] completed ${results.length} checks against ${options.baseUrl}`);
}

main().catch((error) => {
  console.error(`[runtime-smoke] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
