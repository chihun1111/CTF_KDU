import { NextRequest, NextResponse } from "next/server";
import { consumeClearCertificate } from "../lib/server-api";
import type { ClearCertificate } from "../lib/types";
import { formatDateTime } from "../lib/types";
import { isCertificateNavigation, isPrefetchRequest, noStoreHeaders, publicUrl } from "../lib/request-policy";

export const dynamic = "force-dynamic";

function isCertificate(value: unknown): value is ClearCertificate {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ClearCertificate>;
  return typeof data.studentId === "string" && data.studentId.length > 0
    && typeof data.clearReceiptCode === "string" && data.clearReceiptCode.length > 0
    && typeof data.message === "string"
    && typeof data.clearedAt === "string" && Number.isFinite(Date.parse(data.clearedAt));
}

function htmlResponse(html: string, status: number): NextResponse {
  const response = new NextResponse(html, { status, headers: noStoreHeaders() });
  response.headers.set("content-type", "text/html; charset=utf-8");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set(
    "content-security-policy",
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  return response;
}

function unavailableCertificate(): NextResponse {
  return htmlResponse(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>클리어 인증 확인 안내</title></head><body><main>
<h1>클리어 인증 화면을 불러올 수 없습니다.</h1>
<p>인증 응답을 확인하지 못했습니다. 이 요청은 자동으로 다시 전송하지 않습니다.</p>
<p>인증 화면은 한 번만 열립니다. 제출 화면에서 8개 플래그를 다시 제출하면 새 인증 화면을 열 수 있습니다.</p>
<p><a href="/submit">제출 화면으로 이동</a> · <a href="/">문제 목록으로 이동</a></p>
</main></body></html>`, 502);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function certificateHtml(certificate: ClearCertificate): string {
  const studentId = escapeHtml(certificate.studentId);
  const clearedAt = escapeHtml(formatDateTime(certificate.clearedAt));
  const receipt = escapeHtml(certificate.clearReceiptCode);
  const message = escapeHtml(certificate.message);

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>교내 CTF 2026 Clear</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fafc;
        --surface: #ffffff;
        --text: #1a1c1f;
        --muted: #515f74;
        --border: #e2e8f0;
        --accent: #003366;
        --success: #166534;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family: "Pretendard", "Noto Sans KR", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(920px, calc(100% - 32px));
        margin: 0 auto;
        padding: 44px 0;
      }
      .certificate {
        position: relative;
        border: 1px solid var(--border);
        border-top: 8px solid var(--accent);
        border-radius: 4px;
        background: var(--surface);
        padding: clamp(24px, 6vw, 52px);
        text-align: center;
      }
      .clearMark {
        display: grid;
        width: 54px;
        height: 54px;
        place-items: center;
        border-radius: 50%;
        background: var(--success);
        margin: 0 auto 18px;
        color: #fff;
        font-size: 2rem;
        font-weight: 900;
      }
      .eyebrow {
        margin: 0 0 10px;
        color: var(--accent);
        font-size: 0.9rem;
        font-weight: 800;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        color: var(--accent);
        font-size: clamp(2.4rem, 8vw, 4rem);
        line-height: 1;
      }
      .message {
        margin: 18px 0 0;
        color: var(--muted);
        font-size: clamp(1.1rem, 3vw, 1.5rem);
        line-height: 1.5;
      }
      dl {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin: 36px 0 0;
        text-align: left;
      }
      div.field {
        border: 1px solid var(--border);
        border-radius: 4px;
        background: #f4f3f8;
        padding: 18px;
      }
      dt {
        color: var(--muted);
        font-size: 0.86rem;
        font-weight: 700;
      }
      dd {
        margin: 8px 0 0;
        font-size: clamp(1.2rem, 4vw, 2rem);
        font-weight: 850;
        overflow-wrap: anywhere;
      }
      .note {
        margin: 28px 0 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .completionSummary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border: 1px solid var(--border);
        margin-top: 28px;
        padding: 16px;
        text-align: left;
      }
      .completionSummary strong { color: var(--accent); font-size: 1.1rem; }
      @media (max-width: 760px) {
        dl { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="certificate" aria-label="클리어 인증">
        <div class="clearMark" aria-hidden="true">✓</div>
        <p class="eyebrow">교내 CTF 2026 Clear</p>
        <h1>클리어</h1>
        <p class="message">${message}</p>
        <dl>
          <div class="field">
            <dt>학번</dt>
            <dd>${studentId}</dd>
          </div>
          <div class="field">
            <dt>클리어 시각</dt>
            <dd>${clearedAt}</dd>
          </div>
          <div class="field">
            <dt>인증 코드</dt>
            <dd>${receipt}</dd>
          </div>
        </dl>
        <div class="completionSummary"><span>확인된 제출 항목</span><strong>8개 전체 완료</strong></div>
        <p class="note">사진 인증 시 학번, 클리어 시각, 인증 코드가 함께 보이도록 촬영하세요.</p>
      </section>
    </main>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  // A speculative navigation must never spend the participant's single view.
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, { status: 204, headers: noStoreHeaders() });
  }
  // SameSite cookies can accompany sibling-origin images or frames. Reject
  // those requests before the backend can consume the participant's view.
  if (!isCertificateNavigation(request)) {
    return new NextResponse("클리어 인증은 제출 화면에서 직접 열어주세요.", {
      status: 403,
      headers: noStoreHeaders(),
    });
  }

  const result = await consumeClearCertificate(request.headers.get("cookie") ?? "");

  if (!result.ok && result.status === 401) {
    return NextResponse.redirect(publicUrl("/login", request), { headers: noStoreHeaders() });
  }

  if (!result.ok && result.status === 403) {
    return NextResponse.redirect(publicUrl("/submit", request), { headers: noStoreHeaders() });
  }

  if (!result.ok || !isCertificate(result.data)) {
    return unavailableCertificate();
  }

  const response = htmlResponse(certificateHtml(result.data), 200);
  for (const setCookie of result.headers.getSetCookie()) {
    response.headers.append("set-cookie", setCookie);
  }

  return response;
}

// Next otherwise synthesizes HEAD by executing GET, including its mutation.
export function HEAD() {
  return new NextResponse(null, { status: 200, headers: noStoreHeaders() });
}
