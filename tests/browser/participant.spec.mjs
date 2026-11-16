import { test, expect } from '@playwright/test';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { decryptField, hmacLookupHash } from '../../packages/config/dist/index.js';
import { buildFlagQuery } from '../../scripts/runtime-clear-smoke.mjs';

const outputDir = 'artifacts/browser';
const services = [
  '/challenges/01/', '/challenges/02/', '/challenges/03/', '/challenges/04/',
  '/challenges/05/', '/challenges/06/', '/challenges/07/', '/challenges/08/',
];
const difficulties = ['입문', '초급', '초급', '초급', '입문', '초급', '중급', '고급'];
const legacyServices = [
  '/campus/festival/', '/system/status/', '/student/assignments/', '/clubs/admin/',
  '/clubs/security/', '/clubs/build-archive/', '/community/board/', '/bonus/vault/',
];
const observations = { scope: 'Automated browser regression, not a novice user study', checks: [] };
const flagPattern = /KDUCTF\{[A-Za-z0-9_-]{32}\}/g;

function record(check, details = {}) {
  observations.checks.push({ check, ...details });
}

function oneFlag(source, label) {
  const flags = [...new Set(String(source).match(flagPattern) ?? [])];
  expect(flags.length, `${label}: exactly one disposable participant flag`).toBe(1);
  return flags[0];
}

async function screenshot(page, name, masks = []) {
  await mkdir(outputDir, { recursive: true });
  // Stabilize sticky headers and mask coordinates for full-page captures after
  // focus or a button click has scrolled a long form.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${outputDir}/${name}.png`, fullPage: true,
    timeout: 10_000,
    mask: [page.locator('input'), page.locator('#flag-box'), page.locator('dd'),
      page.getByText(/KDUCTF\{[A-Za-z0-9_-]{32}\}/), ...masks],
  });
}

async function register(page) {
  const studentId = String(randomInt(8800000, 8899999));
  const password = `Browser-${randomBytes(18).toString('base64url')}`;
  const welcome = await page.goto('/');
  expect(welcome.status(), 'the public main page opens directly').toBe(200);
  await expect(page.getByRole('heading', { name: '교내 CTF에 도전하세요', exact: true })).toBeVisible();
  await layout(page, 'public main layout');
  await screenshot(page, page.viewportSize().width < 700 ? 'mobile-welcome' : 'desktop-welcome');
  await page.locator('a[href="/register"]').first().click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeDisabled();
  await page.getByLabel(/^학번/).fill(studentId);
  await page.getByLabel(/^비밀번호/).fill(password);
  await page.getByRole('checkbox', { name: '[필수] 서비스 이용과 보안 운영 로그 수집에 동의합니다.' }).check();
  await page.getByRole('checkbox', { name: '[필수] 로그인 유지에 필요한 쿠키 사용에 동의합니다.' }).check();
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.locator('.serviceDirectoryCard')).toHaveCount(8);
  record('registration with required consents only succeeds');
  return { studentId, password };
}

async function openService(page, index) {
  await page.goto('/');
  const navigations = [];
  const otherChallengeRequests = [];
  const track = (request) => {
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(path);
    if (/^\/challenges\/0[1-8]\//.test(path) && !path.startsWith(services[index])) otherChallengeRequests.push(path);
  };
  page.on('request', track);
  try {
    const destination = page.waitForResponse((response) => response.request().isNavigationRequest()
      && new URL(response.url()).pathname === services[index]);
    await page.locator(`.serviceDirectoryCard a[href="${services[index]}"]`).click();
    const response = await destination;
    expect(response.status(), 'the card opens the actual challenge without a redirect').toBe(200);
    expect(response.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL((url) => url.pathname === services[index]);
  } finally {
    page.off('request', track);
  }
  expect(navigations, 'one main-page click produces exactly one challenge navigation').toEqual([services[index]]);
  expect(otherChallengeRequests, 'a challenge does not load another challenge').toEqual([]);
  await expect(page.getByRole('link', { name: '문제 목록', exact: true })).toBeVisible();
  const linkedPaths = await page.locator('a[href], form[action], script[src]').evaluateAll((elements) => elements
    .map((element) => element.getAttribute('href') ?? element.getAttribute('action') ?? element.getAttribute('src'))
    .filter((path) => /^\/challenges\/0[1-8]\//.test(path)));
  expect(linkedPaths.every((path) => path.startsWith(services[index])), 'all challenge links stay inside this problem').toBe(true);
  record('direct main-to-challenge navigation', { challenge: index + 1, navigations: navigations.length });
}

async function publicAsset(page, path) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: 'same-origin' });
    return { status: response.status, text: await response.text() };
  }, path);
}

// This is trusted test-fixture access to the disposable Compose database.
// It validates the completion UI without claiming independent solutions of 07/08.
async function issuedFixtureFlags(studentId) {
  const secretDir = 'secrets/runtime-only';
  const pepper = (await readFile(`${secretDir}/student_id_hash_pepper`, 'utf8')).trim();
  const key = (await readFile(`${secretDir}/flag_encryption_key`, 'utf8')).trim();
  const query = buildFlagQuery(hmacLookupHash(pepper, studentId));
  const stdout = execFileSync('docker', [
    'compose', '-f', 'infra/docker/docker-compose.yml', '--env-file', '.env.production',
    'exec', '-T', 'postgres', 'sh', '-c',
    'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"', 'browser-fixture', query,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
  const encrypted = JSON.parse(stdout.trim());
  expect(Object.keys(encrypted).length, 'all eight test flags are issued').toBe(8);
  return Object.fromEntries(Object.entries(encrypted).map(([id, value]) => [id, decryptField(value, key)]));
}

async function fillFlags(page, flags) {
  const inputs = page.locator('.flagField input');
  await expect(inputs).toHaveCount(8);
  for (let index = 0; index < 8; index += 1) await inputs.nth(index).fill(flags[index] ?? '');
}

async function layout(page, name) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    scrollablePanels: [...document.querySelectorAll('.panel')].filter((panel) => panel.scrollWidth > panel.clientWidth + 1).length,
  }));
  record(name, metrics);
  // Record soft failures to keep inspecting the remaining pages.
  expect.soft(metrics.document, `${name}: document fits the viewport`).toBeLessThanOrEqual(metrics.viewport + 1);
}

test.beforeEach(async ({ browser }) => {
  observations.checks = [];
  record('browser version', { version: browser.version() });
});

test.afterEach(async ({ page }, testInfo) => {
  await mkdir(outputDir, { recursive: true });
  const prefix = testInfo.title.startsWith('desktop') ? 'desktop' : 'mobile';
  if (testInfo.status !== testInfo.expectedStatus) {
    try { await screenshot(page, `${prefix}-failure`); }
    catch { record('failure screenshot unavailable'); }
  }
  record('test outcome', { title: testInfo.title, status: testInfo.status, errorCount: testInfo.errors.length });
  await writeFile(`${outputDir}/${prefix}-observations.json`, `${JSON.stringify(observations, null, 2)}\n`);
});

test('desktop participant journey: discovery, partial grading and fixture-assisted completion', async ({ page, context }) => {
  const pageErrors = [];
  page.on('pageerror', () => pageErrors.push('uncaught page error'));
  const flags = [];
  let account;

  await test.step('register, log out and log back in using visible forms', async () => {
    account = await register(page);
    await screenshot(page, 'desktop-hub');
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel(/^학번/).fill(account.studentId);
    await page.getByLabel(/^비밀번호/).fill(account.password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    record('logout and login preserve browser session flow');
  });

  await test.step('difficulty labels and filters help select an independent problem', async () => {
    const cards = page.locator('.serviceDirectoryCard');
    for (let index = 0; index < services.length; index += 1) {
      await expect(cards.nth(index).locator('.difficultyBadge')).toHaveText(difficulties[index]);
      await expect(cards.nth(index).locator('a')).toHaveCount(1);
      await expect(cards.nth(index).locator('a')).toHaveAttribute('href', services[index]);
    }
    const filters = page.getByRole('group', { name: '난이도 필터', exact: true });
    await filters.getByRole('button', { name: '입문', exact: true }).click();
    await expect(cards).toHaveCount(2);
    expect(await cards.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual([services[0], services[4]]);
    await filters.getByRole('button', { name: '고급', exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('a')).toHaveAttribute('href', services[7]);
    await filters.getByRole('button', { name: '전체', exact: true }).click();
    await expect(cards).toHaveCount(8);
    record('all four difficulty levels render; introductory and advanced filters return the correct cards');
  });

  await test.step('old bookmarks redirect once and canonical links need no redirect', async () => {
    for (let index = 0; index < services.length; index += 1) {
      const old = await page.request.get(legacyServices[index], { maxRedirects: 0 });
      expect(old.status()).toBe(308);
      expect(old.headers().location).toBe(services[index]);
      const bare = await page.request.get(services[index].slice(0, -1), { maxRedirects: 0 });
      expect(bare.status()).toBe(308);
      expect(bare.headers().location).toBe(services[index]);
    }
    const query = '?q=%EC%B6%95%EC%A0%9C&from=bookmark';
    const search = await page.request.get(`/community/board/search${query}`, { maxRedirects: 0 });
    expect(search.status()).toBe(308);
    expect(search.headers().location).toBe(`/challenges/07/search${query}`);
    const previousMain = await page.goto('/hub');
    expect(previousMain.status()).toBe(200);
    await expect(page).toHaveURL((url) => url.pathname === '/');
    record('legacy entry URLs, raw query strings and missing trailing slashes normalize to the canonical routes');
  });

  await test.step('01: read the delivered document', async () => {
    await openService(page, 0);
    flags[0] = oneFlag(await page.content(), '01 document');
  });

  await test.step('02: follow the public service rules file', async () => {
    await openService(page, 1);
    const scriptPath = await page.locator('script[src]').first().getAttribute('src');
    const script = await publicAsset(page, scriptPath);
    expect(script.status).toBe(200);
    const rootRobots = await publicAsset(page, '/robots.txt');
    record('origin robots.txt response', { status: rootRobots.status });
    const robots = await publicAsset(page, `${services[1]}robots.txt`);
    expect(robots.status).toBe(200);
    const path = robots.text.match(/^Disallow:\s*(\S+)/m)?.[1];
    expect(Boolean(path), 'service rules expose the next public path').toBe(true);
    const debug = await publicAsset(page, path);
    expect(debug.status).toBe(200);
    flags[1] = oneFlag(debug.text, '02 public response');
  });

  await test.step('03: inspect linked assignment details and neighboring records', async () => {
    await openService(page, 2);
    await page.getByRole('link', { name: '프로그래밍 기초 과제 1', exact: true }).click();
    await expect(page).toHaveURL(/\/challenges\/03\/view\?id=1$/);
    for (const id of [2, 3, 4]) await page.goto(`/challenges/03/view?id=${id}`);
    flags[2] = oneFlag(await page.locator('body').innerText(), '03 detail');
  });

  await test.step('04: changing browser storage requires a reload and reveals the panel', async () => {
    await openService(page, 3);
    await expect(page.locator('#admin-panel')).toBeHidden();
    const script = await publicAsset(page, await page.locator('script[src]').first().getAttribute('src'));
    const sourceFlag = oneFlag(script.text, '04 public bundle shortcut');
    await page.evaluate(() => localStorage.setItem('isAdmin', 'true'));
    await expect(page.locator('#admin-panel')).toBeHidden();
    await page.reload();
    await expect(page.locator('#admin-panel')).toBeVisible();
    flags[3] = oneFlag(await page.locator('#flag-box').innerText(), '04 panel');
    expect(flags[3] === sourceFlag, 'public bundle already contains the same flag').toBe(true);
    await screenshot(page, 'desktop-04-admin-panel');
    record('04 storage change needs reload; reading the bundle also obtains the flag');
    await page.evaluate(() => localStorage.removeItem('isAdmin'));
  });

  await test.step('05 and 06: read linked JavaScript and source-map assets', async () => {
    await openService(page, 4);
    const script = await publicAsset(page, await page.locator('script[src]').first().getAttribute('src'));
    expect(script.status).toBe(200);
    flags[4] = oneFlag(script.text, '05 linked bundle');
    expect(script.text.includes('sourceMappingURL'), '05 has no cross-challenge source-map link').toBe(false);
    await openService(page, 5);
    const mapPath = await page.getByRole('link', { name: 'main.js.map', exact: true }).getAttribute('href');
    const map = await publicAsset(page, mapPath);
    expect(map.status).toBe(200);
    flags[5] = oneFlag(JSON.parse(map.text).sourcesContent.join('\n'), '06 source-map content');
    record('01-06 flags recovered in Chromium through public content and browser storage');
  });

  await test.step('07: normal, empty and no-match searches', async () => {
    await openService(page, 6);
    record('07 initial visible rows', { rows: await page.locator('tbody tr').count() });
    await page.getByRole('textbox', { name: '검색어', exact: true }).fill('중간고사');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('heading', { name: '검색 결과', exact: true })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('textbox', { name: '검색어', exact: true }).fill('존재하지않는게시글');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: '검색어', exact: true }).fill('');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    record('07 empty search rows', { rows: await page.locator('tbody tr').count() });
    await screenshot(page, 'desktop-07-empty-search');
  });

  await test.step('08: the original guest ticket survives unsuccessful confirmation', async () => {
    await openService(page, 7);
    const ticket = (await context.cookies()).find((cookie) => cookie.name === 'vault_ticket');
    expect(Boolean(ticket), 'browser receives the original ticket').toBe(true);
    await page.getByRole('button', { name: '티켓 확인', exact: true }).click();
    await expect(page.getByRole('heading', { name: '열리지 않았습니다', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '처음으로', exact: true }).click();
    const returned = (await context.cookies()).find((cookie) => cookie.name === 'vault_ticket');
    expect(returned?.value === ticket?.value, 'guest failure keeps the same unconsumed ticket').toBe(true);
    record('08 guest confirmation rejects and return preserves the original ticket');
    await screenshot(page, 'desktop-08-guest');
  });

  await test.step('hint navigation and partial submission work without losing progress on reload', async () => {
    await page.getByRole('link', { name: '문제 목록', exact: true }).click();
    await page.getByRole('link', { name: '힌트 · 운영 공지', exact: true }).click();
    await expect(page).toHaveURL(/\/hints$/);
    await expect(page.getByRole('heading', { name: '공개 힌트', exact: true })).toBeVisible();
    await expect(page.locator('.hintChallengeCard')).toHaveCount(8);
    record('public hint stages before administrator changes', {
      locked: await page.locator('.hintStage.locked').count(),
      released: await page.locator('.hintStage.released').count(),
    });
    await screenshot(page, 'desktop-hints');
    await page.getByRole('link', { name: '제출 페이지', exact: true }).click();
    await page.getByRole('button', { name: '최종 제출', exact: true }).click();
    await expect(page.locator('#FLAG-01-error')).toContainText('한 개 이상');
    await expect(page.locator('.flagField input').first()).toBeFocused();
    await fillFlags(page, [...flags].reverse());
    await page.getByRole('button', { name: '최종 제출', exact: true }).click();
    await expect(page.locator('.resultBanner')).toContainText('8개 중 6개 일치');
    await expect(page.locator('.resultGood')).toHaveCount(6);
    await page.reload();
    await expect(page.locator('.resultBanner')).toContainText('8개 중 6개 일치');
    await expect(page.locator('.flagField input').first()).toHaveValue('');
    await screenshot(page, 'desktop-partial-submission');
    record('six flags grade correctly in reversed slots; results persist, raw inputs clear on reload');
    await fillFlags(page, [flags[0]]);
    await page.getByRole('button', { name: '최종 제출', exact: true }).click();
    await expect(page.locator('.resultBanner')).toContainText('8개 중 1개 일치');
    record('a later one-flag submission replaces the previous six-flag result; grading is not cumulative');
  });

  await test.step('test fixtures for 07/08 complete the UI and issue a one-time certificate', async () => {
    const fixtures = await issuedFixtureFlags(account.studentId);
    for (let index = 0; index < 6; index += 1) {
      expect(flags[index] === fixtures[`FLAG-0${index + 1}`], 'browser flag matches this disposable account').toBe(true);
    }
    const allFlags = [...flags, fixtures['FLAG-07'], fixtures['FLAG-08']];
    await fillFlags(page, allFlags.reverse());
    await page.getByRole('button', { name: '최종 제출', exact: true }).click();
    await expect(page).toHaveURL(/\/clear$/);
    await expect(page.getByRole('heading', { name: '클리어', exact: true })).toBeVisible();
    await expect(page.getByText('8개 전체 완료', { exact: true })).toBeVisible();
    await screenshot(page, 'desktop-clear-certificate', [page.locator('dd')]);
    await page.reload();
    await expect(page).toHaveURL(/\/submit$/);
    await expect(page.locator('.resultBanner')).toContainText('8개 중 8개 일치');
    record('fixture-assisted eight-flag submission opens clear once; reload returns to submit');
  });

  expect(pageErrors.length, 'no uncaught browser JavaScript errors').toBe(0);
});

test('mobile viewport: registration, all service entry pages, search and submit validation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  await layout(page, 'mobile hub');
  await screenshot(page, 'mobile-hub');
  for (let index = 0; index < services.length; index += 1) {
    await test.step(`mobile service ${index + 1}`, async () => {
      await openService(page, index);
      await layout(page, `mobile service ${index + 1}`);
      await screenshot(page, `mobile-${String(index + 1).padStart(2, '0')}`);
      if (index === 2) {
        const detail = page.getByRole('link', { name: '프로그래밍 기초 과제 1', exact: true });
        const visibility = await detail.evaluate((link) => {
          const bounds = link.getBoundingClientRect();
          const panel = link.closest('.panel');
          const panelBounds = panel.getBoundingClientRect();
          return {
            scrollLeft: panel.scrollLeft,
            fullyWithinVisibleColumns: bounds.left >= panelBounds.left && bounds.right <= Math.min(panelBounds.right, window.innerWidth),
          };
        });
        expect(visibility.scrollLeft, 'assignment list starts without horizontal scrolling').toBe(0);
        expect(visibility.fullyWithinVisibleColumns, 'the primary detail link is visible in the initial columns').toBe(true);
        await detail.click();
        await expect(page).toHaveURL(/\/challenges\/03\/view\?id=1$/);
        await expect(page.getByRole('heading', { name: '프로그래밍 기초 과제 1', exact: true })).toBeVisible();
        record('mobile 03 detail opens from the initially visible assignment title');
      }
    });
  }
  await page.goto(services[6]);
  await page.getByRole('textbox', { name: '검색어', exact: true }).fill('축제');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await layout(page, 'mobile search results');
  await screenshot(page, 'mobile-07-search');
  await page.getByRole('link', { name: '문제 목록', exact: true }).click();
  await page.getByRole('link', { name: '제출 페이지', exact: true }).click();
  await page.locator('.flagField input').first().fill('incomplete');
  await page.getByRole('button', { name: '최종 제출', exact: true }).click();
  await expect(page.locator('#FLAG-01-error')).toContainText('전체 문자열');
  await expect(page.locator('.flagField input').first()).toBeFocused();
  await layout(page, 'mobile submission');
  await screenshot(page, 'mobile-submit-validation');
});
