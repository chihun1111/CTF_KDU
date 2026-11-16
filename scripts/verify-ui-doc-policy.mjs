import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(filePath) {
  const fullPath = path.join(root, filePath);
  if (!existsSync(fullPath)) {
    failures.push(`Missing file: ${filePath}`);
    return "";
  }
  return readFileSync(fullPath, "utf8");
}

function requireText(filePath, text, label) {
  const source = read(filePath);
  if (!source.includes(text)) {
    failures.push(`${label} must include ${text}`);
  }
}

function forbidText(filePath, text, label) {
  const source = read(filePath);
  if (source.includes(text)) {
    failures.push(`${label} must not include ${text}`);
  }
}

function forbidHrefTarget(filePath, targetPrefix, label) {
  const source = read(filePath);
  const escapedTargetPrefix = targetPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hrefTargetPattern = new RegExp(
    "href\\s*=\\s*(?:[\"']|\\{\\s*[\"'`])" + escapedTargetPrefix,
  );
  if (hrefTargetPattern.test(source)) {
    failures.push(`${label} must not target ${targetPrefix}`);
  }
}

function requireGlobalHeader(filePath, label) {
  const source = read(filePath);
  for (const className of [
    "campusGlobalHeader",
    "campusGlobalHeaderInner",
    "campusGlobalBrand",
    "campusGlobalBrandMark",
    "campusGlobalBrandText",
    "campusGlobalHomeLink",
  ]) {
    if (!source.includes(className)) {
      failures.push(`${label} must include ${className}`);
    }
  }

  if (!source.includes("KDU")) {
    failures.push(`${label} must include the KDU brand mark`);
  }
  if (!source.includes("교내 CTF")) {
    failures.push(`${label} must include the campus service brand text`);
  }
  if (!source.includes("문제 목록")) {
    failures.push(`${label} must include the all-services link text`);
  }

  const openingTags = [...source.matchAll(/<(?:a|Link)\b[^>]*>/g)];
  const brandTag = openingTags.find((match) => {
    const tag = match[0];
    return (
      /(?:class|className)=["']campusGlobalBrand["']/.test(tag) &&
      /href=["']\/["']/.test(tag) &&
      /aria-label=["'][^"']+["']/.test(tag)
    );
  });
  if (!brandTag) {
    failures.push(`${label} must expose an aria-labelled campusGlobalBrand link to /`);
  } else {
    const brandStart = brandTag.index ?? 0;
    const closingTag = brandTag[0].startsWith("<Link") ? "</Link>" : "</a>";
    const brandEnd = source.indexOf(closingTag, brandStart);
    const brandMarkup = source.slice(brandStart, brandEnd < 0 ? source.length : brandEnd);
    if (!/campusGlobalBrandMark[\s\S]*KDU/.test(brandMarkup)) {
      failures.push(`${label} must put KDU inside campusGlobalBrandMark`);
    }
    if (!/campusGlobalBrandText[\s\S]*교내 CTF/.test(brandMarkup)) {
      failures.push(`${label} must put 교내 CTF inside campusGlobalBrandText`);
    }
  }

  const homeTag = openingTags.find((match) => {
    const tag = match[0];
    return /(?:class|className)=["']campusGlobalHomeLink["']/.test(tag) && /href=["']\/["']/.test(tag);
  });
  if (!homeTag) {
    failures.push(`${label} must expose campusGlobalHomeLink to /`);
  } else {
    const homeStart = homeTag.index ?? 0;
    const closingTag = homeTag[0].startsWith("<Link") ? "</Link>" : "</a>";
    const homeEnd = source.indexOf(closingTag, homeStart);
    const homeMarkup = source.slice(homeStart, homeEnd < 0 ? source.length : homeEnd);
    if (!homeMarkup.includes("문제 목록")) {
      failures.push(`${label} campusGlobalHomeLink must say 문제 목록`);
    }
  }
}

function cssDeclaration(source, selector, property) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = source.match(new RegExp(`\\.${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
  return block.match(new RegExp(`${property}\\s*:\\s*([^;]+);`))?.[1].trim() ?? null;
}

function mobileCssDeclaration(source, selector, property) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = source.match(
    new RegExp(`@media\\s*\\(max-width:\\s*640px\\)[\\s\\S]*?\\.${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`),
  )?.[1] ?? "";
  return block.match(new RegExp(`${property}\\s*:\\s*([^;]+);`))?.[1].trim() ?? null;
}

function requireCanonicalGlobalHeaderCss(filePath, expected, label) {
  const source = read(filePath);
  const actual = {
    innerWidth: cssDeclaration(source, "campusGlobalHeaderInner", "width"),
    brandMarkWidth: cssDeclaration(source, "campusGlobalBrandMark", "width"),
    brandMarkHeight: cssDeclaration(source, "campusGlobalBrandMark", "height"),
    brandMarkBackground: cssDeclaration(source, "campusGlobalBrandMark", "background"),
    mobileBrandTextDisplay: mobileCssDeclaration(source, "campusGlobalBrandText", "display"),
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual[key] !== expectedValue) {
      failures.push(`${label} must use canonical ${key} ${expectedValue}; found ${actual[key] ?? "<missing>"}`);
    }
  }
}

requireText("apps/frontend/app/components/auth-form.tsx", "수집 항목", "auth consent copy");
requireText("apps/frontend/app/components/auth-form.tsx", "저장하지 않는 항목", "auth consent copy");
requireText("apps/frontend/app/components/auth-form.tsx", "보존 기간", "auth consent copy");
requireText("apps/frontend/app/components/auth-form.tsx", 'placeholder="7자리 학번"', "auth student id placeholder");
forbidText("apps/frontend/app/components/auth-form.tsx", 'placeholder="2622022"', "auth raw sample student id");
requireText("apps/frontend/app/components/final-submit-form.tsx", 'const flagPrefix = "KDUCTF"', "final submit form");
requireText("apps/frontend/app/components/final-submit-form.tsx", 'const flagExampleSuffix = "{...}"', "final submit form");
requireText("apps/frontend/app/lib/submission-validation.ts", "new RegExp", "final submit form validation");
requireText("apps/frontend/app/components/final-submit-form.tsx", "submittedEntries", "final submit partial verification");
requireText("apps/frontend/app/components/final-submit-form.tsx", "한 개 이상", "final submit partial verification copy");
requireText("apps/frontend/app/lib/client-api.ts", "/api/auth/me", "auth form role-aware redirect");
forbidText("apps/frontend/app/admin/operations/page.tsx", "API 연결 대기", "admin operations page");
requireText("apps/frontend/app/admin/operations/page.tsx", 'href="/submit"', "admin operations quick submit navigation");
requireText("apps/frontend/app/admin/operations/page.tsx", 'href="/clear/preview"', "admin operations clear preview navigation");
requireText("apps/frontend/app/clear/preview/page.tsx", "ClearPreviewPage", "clear preview page");
requireText("apps/frontend/app/clear/preview/page.tsx", "실제 인증에서만 표시", "clear preview privacy placeholder");
forbidText("apps/frontend/app/clear/preview/page.tsx", "2622022", "clear preview raw sample student id");
requireText("apps/frontend/app/clear/preview/page.tsx", "session.role !== \"admin\"", "clear preview admin guard");
requireText("apps/frontend/app/page.tsx", "portalHero", "participant hub service directory");
requireText("apps/frontend/app/page.tsx", "serviceDirectory", "participant hub service directory");
requireGlobalHeader("apps/frontend/app/components/campus-global-header.tsx", "frontend global header component");
for (const participantHeaderPage of [
  "apps/frontend/app/page.tsx",
  "apps/frontend/app/hints/page.tsx",
  "apps/frontend/app/submit/page.tsx",
]) {
  requireText(participantHeaderPage, "CampusGlobalHeader", "participant global header usage");
  requireText(participantHeaderPage, "<CampusGlobalHeader />", "participant global header usage");
}
requireText(
  "apps/frontend/app/components/services/service-directory-card.tsx",
  "href={service.serviceHref}",
  "participant service card direct navigation",
);
for (const participantServiceNavigationFile of [
  "apps/frontend/app/page.tsx",
  "apps/frontend/app/components/services/service-directory-grid.tsx",
  "apps/frontend/app/components/services/service-directory-card.tsx",
]) {
  forbidHrefTarget(
    participantServiceNavigationFile,
    "/services/",
    "participant service navigation must use the actual service route",
  );
}
forbidText(
  "apps/frontend/app/components/services/service-directory-card.tsx",
  "guideHref",
  "participant service card direct navigation",
);
forbidText(
  "apps/frontend/app/components/services/service-directory-card.tsx",
  "guideUrl",
  "participant service card direct navigation",
);
requireText("apps/frontend/app/hints/page.tsx", "getPublicHints", "participant hints page");
requireText("apps/frontend/app/admin/hints/release/route.ts", "/api/admin/hints/release", "admin hint release proxy");
requireText("apps/frontend/app/admin/operations/page.tsx", "getAdminHints", "admin hint operations");
requireText("apps/frontend/app/admin/operations/page.tsx", "auditModal", "admin audit log popup");
requireText("apps/frontend/app/admin/operations/page.tsx", "감사 로그 보기", "admin audit log popup trigger");
forbidText("apps/frontend/app/admin/operations/page.tsx", "participantLogModal", "participant audit log popup");
forbidText("apps/frontend/app/admin/operations/page.tsx", "참가자 로그", "participant audit log popup trigger");
forbidText("apps/frontend/app/admin/operations/page.tsx", "#participant-logs-", "participant audit log popup target");
requireText("apps/frontend/app/admin/operations/page.tsx", "AdminOperationsAutoRefresh", "admin operations live refresh");
requireText("apps/frontend/app/components/admin-operations-auto-refresh.tsx", "router.refresh()", "admin operations live refresh");
requireText("apps/frontend/app/components/admin-operations-auto-refresh.tsx", "10_000", "admin operations live refresh interval");
requireText("apps/frontend/app/globals.css", ".auditModal[open]", "admin audit log popup styling");
// The compatibility route is redirect-only; its final challenge-service response carries the participant header.
requireText("apps/frontend/app/services/[slug]/page.tsx", "getServiceHub", "service compatibility redirect");
requireText(
  "apps/frontend/app/services/[slug]/page.tsx",
  "result.data.services.find((item) => item.slug === slug)",
  "service compatibility slug allowlist",
);
requireText("apps/frontend/app/services/[slug]/page.tsx", "if (!service)", "service compatibility slug allowlist");
requireText("apps/frontend/app/services/[slug]/page.tsx", "notFound()", "service compatibility slug allowlist");
requireText("apps/frontend/app/services/[slug]/page.tsx", "redirect(service.serviceHref)", "service compatibility redirect");
forbidText("apps/frontend/app/services/[slug]/page.tsx", "getServiceDetail", "service compatibility redirect");
forbidText("apps/frontend/app/services/[slug]/page.tsx", "serviceToolbar", "service compatibility redirect");
forbidText("apps/frontend/app/services/[slug]/page.tsx", "serviceInfoGrid", "service compatibility redirect");

const canonicalGlobalHeaderCss = {
  innerWidth: "min(1120px, calc(100% - 32px))",
  brandMarkWidth: "42px",
  brandMarkHeight: "28px",
  brandMarkBackground: "#003366",
  mobileBrandTextDisplay: "none",
};

for (let index = 1; index <= 8; index += 1) {
  const id = String(index).padStart(2, "0");
  const challengeSource = `challenge-services/challenge-${id}/src/server.ts`;
  requireText(challengeSource, "serviceShell", `challenge-${id} service page`);
  requireText(challengeSource, "<style>", `challenge-${id} service page`);
  requireGlobalHeader(challengeSource, `challenge-${id} global header`);
  requireCanonicalGlobalHeaderCss(challengeSource, canonicalGlobalHeaderCss, `challenge-${id} global header CSS`);
}

if (failures.length > 0) {
  console.error("UI document policy verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("UI document policy verification passed.");
