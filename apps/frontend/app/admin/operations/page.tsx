import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminOperationsAutoRefresh } from "../../components/admin-operations-auto-refresh";
import { LogoutButton } from "../../components/logout-button";
import {
  getAdminClears,
  getAdminAuditLogs,
  getAdminChallengeStatus,
  getAdminHints,
  getAdminOperationsSummary,
  getAdminParticipants,
  getAdminSubmissions,
  getAdminSystemHealth,
  getCurrentSession,
  getOnlineSessionCount,
} from "../../lib/server-api";
import {
  FLAG_IDS,
  formatDateTime,
  type AdminAuditLogItem,
  type AdminChallengeStatusItem,
  type AdminClearListItem,
  type AdminHintChallenge,
  type AdminHintStage,
  type AdminParticipantListItem,
  type AdminSubmissionListItem,
  type AdminSystemHealth,
} from "../../lib/types";

export default async function AdminOperationsPage() {
  const session = await getCurrentSession();
  if (!session.authenticated) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect("/hub");
  }

  const [
    summaryResult,
    onlineResult,
    participantsResult,
    submissionsResult,
    clearsResult,
    challengeStatusResult,
    systemHealthResult,
    auditLogsResult,
    adminHintsResult,
  ] = await Promise.all([
    getAdminOperationsSummary(),
    getOnlineSessionCount(),
    getAdminParticipants(),
    getAdminSubmissions(),
    getAdminClears(),
    getAdminChallengeStatus(),
    getAdminSystemHealth(),
    getAdminAuditLogs(),
    getAdminHints(),
  ]);
  if (
    !summaryResult.ok ||
    !onlineResult.ok ||
    !participantsResult.ok ||
    !submissionsResult.ok ||
    !clearsResult.ok ||
    !challengeStatusResult.ok ||
    !systemHealthResult.ok ||
    !auditLogsResult.ok ||
    !adminHintsResult.ok
  ) {
    throw new Error("Failed to load admin operations data");
  }

  const summary = summaryResult.data;
  const online = onlineResult.data;
  const participants = participantsResult.data.items;
  const submissions = submissionsResult.data.items;
  const clears = clearsResult.data.items;
  const challengeStatus = challengeStatusResult.data;
  const systemHealth = systemHealthResult.data;
  const auditLogs = auditLogsResult.data.items;
  const adminHints = adminHintsResult.data;
  const adminSections = [
    { id: "overview", label: "운영 요약" },
    { id: "participants", label: "참가 현황" },
    { id: "submissions", label: "제출 현황" },
    { id: "clears", label: "클리어 현황" },
    { id: "challenges", label: "서비스 상태" },
    { id: "hints", label: "안내 공개" },
    { id: "system", label: "시스템" },
    { id: "audit-logs", label: "감사 로그" },
    { id: "risk-actions", label: "관리 작업" },
  ];
  return (
    <main className="shell adminShell">
      <AdminOperationsAutoRefresh />
      <header className="pageHeader">
        <div>
          <p className="eyebrow">운영자</p>
          <h1>운영 현황</h1>
          <p className="lede">참가 현황과 서비스 상태를 집계로 확인합니다. 참가자는 가명 참조값으로만 구분하며 학번, 사용자 ID, 제출 원문과 세션 토큰 및 해시는 표시하지 않습니다.</p>
        </div>
        <nav className="headerActions" aria-label="주요 이동">
          <Link className="primaryLink" href="/submit">
            제출 페이지
          </Link>
          <Link className="secondaryLink" href="/clear/preview">
            클리어 미리보기
          </Link>
          <Link className="secondaryLink" href="/hub">
            허브
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <section className="adminTabs" aria-label="운영 섹션">
        {adminSections.map((section) => (
          <a href={`#${section.id}`} key={section.id}>
            {section.label}
          </a>
        ))}
      </section>

      <section className="panel adminOverview" id="overview">
        <div>
          <h2>운영 요약</h2>
          <p>생성 시각: {formatDateTime(summary.generatedAt)}</p>
        </div>
        <div className="adminMetricGrid">
          <Metric label="현재 접속 세션" value={summary.onlineSessionCount} />
          <Metric label="가입 참가자" value={summary.registeredUserCount} />
          <Metric label="제출 경험 참가자" value={summary.submittedUserCount} />
          <Metric label="클리어 참가자" value={summary.clearedUserCount} />
          <Metric label="총 최종 제출" value={summary.finalSubmissionCount} />
          <Metric label="접속 집계 기준" value={online.source === "redis_presence" ? "Redis 실시간 집계" : "DB 최근 접속 대체 집계"} />
        </div>
      </section>

      <section className="panel healthPanel" aria-label="시스템 상태 요약">
        <h2>시스템 상태</h2>
        <div className="adminMetricGrid">
          <Metric label="백엔드" value={statusLabel(summary.systemHealth.backend)} />
          <Metric label="PostgreSQL" value={statusLabel(summary.systemHealth.postgres)} />
          <Metric label="Redis" value={statusLabel(summary.systemHealth.redis)} />
          <Metric label="정상 서비스" value={summary.systemHealth.challengeServices.ok} />
          <Metric label="점검 필요 서비스" value={summary.systemHealth.challengeServices.degraded} />
          <Metric label="중단 서비스" value={summary.systemHealth.challengeServices.down} />
        </div>
        <p className="mutedText">
          접속 집계 시간 범위: {online.windowSeconds}초, 갱신 시각: {formatDateTime(online.generatedAt)}
        </p>
      </section>

      <section className="adminSectionGrid" aria-label="운영 상세 섹션">
        <ParticipantTable items={participants} />
        <SubmissionTable items={submissions} />
        <ClearTable items={clears} />
        <ChallengeStatusTable items={challengeStatus} />
        <SystemHealthPanel health={systemHealth} />
        <AuditLogTable items={auditLogs} />
      </section>

      <AdminHintsPanel challenges={adminHints.challenges} releasedCount={adminHints.releasedStageCount} totalCount={adminHints.totalStageCount} />

      <section className="panel emptyState" id="risk-actions">
        <h2>관리 작업</h2>
        <p>세션 만료와 문제 상태 변경 같은 쓰기 작업은 감사 로그와 확인 절차가 준비될 때까지 비활성화합니다.</p>
        <button className="primaryButton" disabled type="button">
          준비 중
        </button>
      </section>
    </main>
  );
}

function AdminHintsPanel({
  challenges,
  releasedCount,
  totalCount,
}: {
  challenges: AdminHintChallenge[];
  releasedCount: number;
  totalCount: number;
}) {
  return (
    <section className="panel adminHintsPanel" id="hints">
      <div className="adminHintsHeader">
        <div>
          <h2>안내 공개</h2>
          <p>
            공개 상태: {totalCount}개 중 {releasedCount}개
          </p>
        </div>
        <Link className="secondaryLink" href="/hints">
          참가자 화면
        </Link>
      </div>
      <div className="adminHintGrid">
        {challenges.map((challenge) => (
          <article className="adminHintChallenge" key={challenge.number}>
            <div className="hintChallengeHeader">
              <span>{challenge.number}</span>
              <h3>{challenge.title}</h3>
            </div>
            <div className="hintStageList">
              {challenge.stages.map((stage) => (
                <AdminHintStageRow stage={stage} key={stage.stageId} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminHintStageRow({ stage }: { stage: AdminHintStage }) {
  return (
    <section className={stage.released ? "hintStage released" : "hintStage"}>
      <div className="hintStageTop">
        <strong>{stage.label}</strong>
        <span>{stage.releaseTiming}</span>
      </div>
      <p>{stage.text}</p>
      <div className="hintStageActions">
        {stage.released ? (
          <small>{stage.releasedAt ? `공개됨: ${formatDateTime(stage.releasedAt)}` : "공개됨"}</small>
        ) : (
          <form action="/admin/hints/release" method="post">
            <input name="stageId" type="hidden" value={stage.stageId} />
            <button className="primaryButton compactButton" type="submit">
              공개
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="adminMetric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusLabel(status: "ok" | "degraded" | "down"): string {
  if (status === "ok") return "정상";
  if (status === "degraded") return "점검 필요";
  return "중단";
}

function ParticipantTable({ items }: { items: AdminParticipantListItem[] }) {
  return (
    <article className="panel adminTablePanel" id="participants">
      <h2>참가 현황</h2>
      <p className="mutedText">개인 식별정보 대신 서버가 만든 비가역 가명 참조값만 표시합니다.</p>
      <table>
        <thead>
          <tr>
            <th>참가자 참조</th>
            <th>온라인</th>
            <th>최근 결과</th>
            <th>제출</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.participantRef}>
              <td>{item.participantRef}</td>
              <td>{item.online ? "접속 중" : "미접속"}</td>
              <td>
                {item.requiredCount}개 중 {item.latestCorrectCount}개
              </td>
              <td>{item.finalSubmissionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 ? <p className="mutedText">표시할 참가자가 없습니다.</p> : null}
    </article>
  );
}

function SubmissionTable({ items }: { items: AdminSubmissionListItem[] }) {
  return (
    <article className="panel adminTablePanel" id="submissions">
      <h2>제출 현황</h2>
      <table>
        <thead>
          <tr>
            <th>제출 시각</th>
            <th>참가자 참조</th>
            <th>맞은 개수</th>
            <th>번호별 상태</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{formatDateTime(item.createdAt)}</td>
              <td>{item.participantRef}</td>
              <td>
                {item.requiredCount}개 중 {item.correctCount}개
              </td>
              <td>
                <span className="compactResults">
                  {FLAG_IDS.map((flagId) => (
                    <span className={item.resultsByFlagId[flagId]?.correct ? "resultGood" : "resultBad"} key={flagId}>
                      {flagId.slice(-2)}
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 ? <p className="mutedText">표시할 제출 이력이 없습니다.</p> : null}
    </article>
  );
}

function ClearTable({ items }: { items: AdminClearListItem[] }) {
  return (
    <article className="panel adminTablePanel" id="clears">
      <h2>클리어 현황</h2>
      <table>
        <thead>
          <tr>
            <th>클리어 시각</th>
            <th>참가자 참조</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.participantRef}-${item.clearedAt}`}>
              <td>{formatDateTime(item.clearedAt)}</td>
              <td>{item.participantRef}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 ? <p className="mutedText">표시할 클리어 기록이 없습니다.</p> : null}
    </article>
  );
}

function ChallengeStatusTable({ items }: { items: AdminChallengeStatusItem[] }) {
  return (
    <article className="panel adminTablePanel" id="challenges">
      <h2>서비스 상태</h2>
      <table>
        <thead>
          <tr>
            <th>번호</th>
            <th>상태</th>
            <th>풀이 수</th>
            <th>최근 확인</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.flagId}>
              <td>{item.challengeId}</td>
              <td>{statusLabel(item.health)}</td>
              <td>{item.solvedCount}</td>
              <td>{formatDateTime(item.lastHealthcheckAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 ? <p className="mutedText">표시할 문제 상태가 없습니다.</p> : null}
    </article>
  );
}

function SystemHealthPanel({ health }: { health: AdminSystemHealth }) {
  return (
    <article className="panel adminTablePanel" id="system">
      <h2>시스템</h2>
      <div className="adminMetricGrid compactMetricGrid">
        <Metric label="백엔드" value={statusLabel(health.backend.status)} />
        <Metric label="PostgreSQL" value={`${statusLabel(health.postgres.status)} / ${health.postgres.latencyMs}ms`} />
        <Metric label="Redis" value={`${statusLabel(health.redis.status)} / ${health.redis.latencyMs}ms`} />
      </div>
      <table>
        <thead>
          <tr>
            <th>서비스</th>
            <th>상태</th>
            <th>응답 시간</th>
          </tr>
        </thead>
        <tbody>
          {health.challengeServices.map((item) => (
            <tr key={item.challengeId}>
              <td>{item.challengeId}</td>
              <td>{statusLabel(item.status)}</td>
              <td>{item.latencyMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function AuditLogTable({ items }: { items: AdminAuditLogItem[] }) {
  return (
    <article className="panel auditLaunchPanel" id="audit-logs">
      <div>
        <h2>감사 로그</h2>
        <p>운영 조회와 보안 이벤트를 팝업으로 확인합니다. 민감 원문은 표시하지 않습니다.</p>
      </div>
      <a className="auditLaunchButton" href="#audit-logs-modal">
        <span>감사 로그 보기</span>
        <strong>{items.length}개</strong>
      </a>
      <section aria-labelledby="audit-logs-title" className="auditModal" id="audit-logs-modal" role="dialog">
        <a aria-label="감사 로그 닫기" className="auditModalBackdrop" href="#audit-logs" />
        <div className="auditModalPanel">
          <div className="auditModalHeader">
            <div>
              <h2 id="audit-logs-title">감사 로그</h2>
              <p>최근 운영 이벤트</p>
            </div>
            <a className="secondaryLink compactModalClose" href="#audit-logs">
              닫기
            </a>
          </div>
          <div className="adminTablePanel auditModalTable">
            <AuditLogRows items={items} />
          </div>
        </div>
      </section>
    </article>
  );
}

function AuditLogRows({ items }: { items: AdminAuditLogItem[] }) {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>시각</th>
            <th>동작</th>
            <th>주체 참조</th>
            <th>추가 정보</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{formatDateTime(item.createdAt)}</td>
              <td>{item.action}</td>
              <td>{item.actorRef ?? "시스템"}</td>
              <td>
                <code>{JSON.stringify(item.metadata)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 ? <p className="mutedText">표시할 감사 로그가 없습니다.</p> : null}
    </>
  );
}
