import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "../../components/logout-button";
import { getCurrentSession } from "../../lib/server-api";
import { formatDateTime } from "../../lib/types";

const previewCertificate = {
  studentId: "실제 인증에서만 표시",
  clearedAt: "2026-05-10T12:00:00+09:00",
  clearReceiptCode: "PREVIEW-2026",
  message: "8개 제출 항목이 모두 확인되었습니다.",
};

export default async function ClearPreviewPage() {
  const session = await getCurrentSession();
  if (!session.authenticated) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect("/");
  }

  return (
    <main className="shell clearPreviewShell">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">교내 CTF 2026 Clear</p>
          <h1>클리어 인증 미리보기</h1>
          <p className="lede">실제 참가자 기록을 조회하지 않는 운영 확인용 화면입니다.</p>
        </div>
        <nav className="headerActions" aria-label="주요 이동">
          <Link className="primaryLink" href="/submit">
            제출 페이지
          </Link>
          <Link className="secondaryLink" href="/admin/operations">
            운영 화면
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <section className="clearCertificatePreview" aria-label="클리어 인증 미리보기">
        <div className="clearMark" aria-hidden="true">✓</div>
        <p className="eyebrow">교내 CTF 2026 Clear</p>
        <h2>클리어</h2>
        <p className="clearMessage">{previewCertificate.message}</p>
        <dl className="clearFields">
          <div className="clearField">
            <dt>학번</dt>
            <dd>{previewCertificate.studentId}</dd>
          </div>
          <div className="clearField">
            <dt>클리어 시각</dt>
            <dd>{formatDateTime(previewCertificate.clearedAt)}</dd>
          </div>
          <div className="clearField">
            <dt>인증 코드</dt>
            <dd>{previewCertificate.clearReceiptCode}</dd>
          </div>
        </dl>
        <div className="completionSummary"><span>확인된 제출 항목</span><strong>8개 전체 완료</strong></div>
        <p className="clearNote">실제 인증 화면에서는 본인 학번, 클리어 시각, 인증 코드가 함께 표시됩니다.</p>
      </section>
    </main>
  );
}
