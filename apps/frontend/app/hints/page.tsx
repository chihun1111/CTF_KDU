import Link from "next/link";
import { redirect } from "next/navigation";
import { CampusGlobalHeader } from "../components/campus-global-header";
import { LogoutButton } from "../components/logout-button";
import { PresenceHeartbeat } from "../components/presence-heartbeat";
import { getCurrentSession, getPublicHints } from "../lib/server-api";
import { formatDateTime, type PublicHintChallenge, type PublicHintStage } from "../lib/types";

export default async function HintsPage() {
  const session = await getCurrentSession();
  if (!session.authenticated) {
    redirect("/login");
  }

  const hints = await getPublicHints();
  if (!hints.ok) {
    if (hints.status === 401) {
      redirect("/login");
    }
    throw new Error("Failed to load hints");
  }

  return (
    <>
      <CampusGlobalHeader />
      <main className="shell">
        <PresenceHeartbeat />
        <header className="pageHeader">
          <div>
            <p className="eyebrow">운영 안내</p>
            <h1>공개 안내</h1>
            <p className="lede">운영자가 공개한 단계만 표시됩니다. 미공개 단계의 문구는 이 화면으로 전달되지 않습니다.</p>
          </div>
          <nav className="headerActions" aria-label="주요 이동">
            {session.role === "admin" ? (
              <Link className="secondaryLink" href="/admin/operations#hints">
                운영 화면
              </Link>
            ) : null}
            <Link className="secondaryLink" href="/hub">
              허브
            </Link>
            <Link className="primaryLink" href="/submit">
              제출 페이지
            </Link>
            <LogoutButton />
          </nav>
        </header>

        <section className="panel hintSummary" aria-label="공개 상태">
          <div>
            <strong>갱신 시각</strong>
            <p>{formatDateTime(hints.data.generatedAt)}</p>
          </div>
        </section>

        <section className="hintChallengeGrid" aria-label="공개 안내 목록">
          {hints.data.challenges.map((challenge) => (
            <HintChallengeCard challenge={challenge} key={challenge.number} />
          ))}
        </section>
      </main>
    </>
  );
}

function HintChallengeCard({ challenge }: { challenge: PublicHintChallenge }) {
  return (
    <article className="panel hintChallengeCard">
      <div className="hintChallengeHeader">
        <span>{challenge.number}</span>
        <h2>{challenge.title}</h2>
      </div>
      <div className="hintStageList">
        {challenge.stages.map((stage) => (
          <HintStageView stage={stage} key={stage.stageId} />
        ))}
      </div>
    </article>
  );
}

function HintStageView({ stage }: { stage: PublicHintStage }) {
  return (
    <section className={stage.released ? "hintStage released" : "hintStage locked"}>
      <div className="hintStageTop">
        <strong>{stage.label}</strong>
        <span>{stage.releaseTiming}</span>
      </div>
      {stage.released ? (
        <>
          <p>{stage.text}</p>
          {stage.releasedAt ? <small>공개 시각: {formatDateTime(stage.releasedAt)}</small> : null}
        </>
      ) : (
        <p className="mutedText">아직 공개되지 않았습니다.</p>
      )}
    </section>
  );
}
