import Link from "next/link";
import { redirect } from "next/navigation";
import { CampusGlobalHeader } from "../components/campus-global-header";
import { FinalSubmitForm } from "../components/final-submit-form";
import { LogoutButton } from "../components/logout-button";
import { PresenceHeartbeat } from "../components/presence-heartbeat";
import { getCurrentSession, getProgress } from "../lib/server-api";

export default async function SubmitPage() {
  const session = await getCurrentSession();
  if (!session.authenticated) {
    redirect("/login");
  }

  const progress = await getProgress();
  if (!progress.ok) {
    if (progress.status === 401) {
      redirect("/login");
    }
    throw new Error("Failed to load progress");
  }

  return (
    <>
      <CampusGlobalHeader />
      <main className="shell">
        <PresenceHeartbeat />
        <header className="pageHeader">
          <div>
            <p className="eyebrow">참가 결과 확인</p>
            <h1>최종 제출</h1>
            <p className="lede">확보한 플래그를 입력해 현재 진행 상황을 확인하고, 8개 항목을 모두 완료해 주세요.</p>
          </div>
          <nav className="headerActions" aria-label="주요 이동">
            <Link className="secondaryLink" href="/">
              문제 목록
            </Link>
            <LogoutButton />
          </nav>
        </header>

        <FinalSubmitForm
          initialCorrectCount={progress.data.correctCount}
          initialResults={progress.data.resultsByFlagId}
          requiredCount={progress.data.requiredCount}
        />
      </main>
    </>
  );
}
