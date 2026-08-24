import { NextRequest, NextResponse } from "next/server";
import { consumeClearCertificate } from "../lib/server-api";
import type { ClearCertificate } from "../lib/types";
import { formatDateTime } from "../lib/types";

export const dynamic = "force-dynamic";

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
  const result = await consumeClearCertificate(request.headers.get("cookie") ?? "");

  if (!result.ok && result.status === 401) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!result.ok && result.status === 403) {
    return NextResponse.redirect(new URL("/submit", request.url));
  }

  if (!result.ok) {
    return new NextResponse("클리어 인증 화면을 불러올 수 없습니다.", {
      status: 502,
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  const response = new NextResponse(certificateHtml(result.data), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
    },
  });
  const setCookie = result.headers.get("set-cookie");
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }

  return response;
}
