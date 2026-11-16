import Link from "next/link";
import { redirect } from "next/navigation";
import { CampusGlobalHeader } from "./components/campus-global-header";
import { LogoutButton } from "./components/logout-button";
import { PresenceHeartbeat } from "./components/presence-heartbeat";
import { ServiceDirectoryGrid } from "./components/services/service-directory-grid";
import { getCurrentSession, getServiceHub } from "./lib/server-api";

function ParticipationSteps() {
  return (
    <ol className="participationSteps">
      <li><span>01</span><div><strong>참가 계정 만들기</strong><p>7자리 학번과 비밀번호로 가입한 뒤 로그인합니다.</p></div></li>
      <li><span>02</span><div><strong>문제 선택하고 탐색하기</strong><p>난이도를 보고 고른 문제에서 단서를 찾아 플래그를 모읍니다.</p></div></li>
      <li><span>03</span><div><strong>찾은 값 확인하고 완료하기</strong><p>일부 값부터 확인할 수 있으며, 최종 완료에는 8개를 함께 제출합니다.</p></div></li>
    </ol>
  );
}

function GuestWelcome() {
  return (
    <>
      <CampusGlobalHeader />
      <main className="shell welcomeShell">
        <header className="welcomeHero">
          <p className="eyebrow">2026 KDU 교내 CTF</p>
          <h1>교내 CTF에 도전하세요</h1>
          <p className="lede">웹페이지에 남은 단서를 찾아 8개의 플래그를 모으는 보안 체험입니다. 입문 문제부터 시작해 익숙한 분야를 하나씩 넓혀 보세요.</p>
          <nav className="welcomeActions" aria-label="참가 시작">
            <Link className="primaryLink" href="/register">회원가입하고 시작하기</Link>
            <Link className="secondaryLink" href="/login">로그인</Link>
          </nav>
          <p className="welcomeCaption">가입 후 메인에서 문제를 고르면 풀이 화면이 바로 열립니다.</p>
        </header>

        <section className="panel welcomeGuide" aria-labelledby="participation-title">
          <h2 id="participation-title">참가 방법</h2>
          <ParticipationSteps />
        </section>

        <section className="welcomeLevels" aria-labelledby="difficulty-title">
          <div className="sectionHeading">
            <div><p className="eyebrow">내 경험에 맞게 시작하기</p><h2 id="difficulty-title">네 단계의 난이도</h2></div>
          </div>
          <div className="difficultyGuideGrid">
            <article><span className="difficultyBadge" data-level="1">입문</span><h3>첫 단서 찾기</h3><p>화면과 페이지 자료를 살펴보며 탐색에 익숙해집니다.</p></article>
            <article><span className="difficultyBadge" data-level="2">초급</span><h3>웹 동작 관찰하기</h3><p>주소, 요청, 브라우저의 동작을 연결해 생각합니다.</p></article>
            <article><span className="difficultyBadge" data-level="3">중급</span><h3>입력과 데이터 이해하기</h3><p>입력이 처리되는 방식과 데이터의 관계를 분석합니다.</p></article>
            <article><span className="difficultyBadge" data-level="4">고급</span><h3>무결성 검증에 도전하기</h3><p>해시와 서명에 관한 사전 지식을 활용합니다.</p></article>
          </div>
          <p className="difficultyNote">난이도는 출제 기준의 예상 수준이며, 익숙한 도구와 분야에 따라 체감이 달라집니다.</p>
        </section>
      </main>
    </>
  );
}

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session.authenticated) return <GuestWelcome />;

  const hub = await getServiceHub();
  if (!hub.ok) {
    if (hub.status === 401) redirect("/login");
    throw new Error("Failed to load challenge list");
  }

  const { services } = hub.data;
  return (
    <>
      <CampusGlobalHeader />
      <main className="shell">
        <PresenceHeartbeat />
        <header className="portalHero">
          <div className="portalHeroCopy">
            <p className="eyebrow">2026 KDU 교내 CTF</p>
            <h1>문제 목록</h1>
            <p className="lede">난이도와 분야를 보고 문제를 선택하세요. 처음이라면 입문부터 시작해 보세요.</p>
          </div>
          <nav className="headerActions" aria-label="주요 이동">
            {session.role === "admin" ? <Link className="secondaryLink" href="/admin/operations">운영 화면</Link> : null}
            <Link className="primaryLink" href="/submit">제출 페이지</Link>
            <Link className="secondaryLink" href="/hints">힌트 · 운영 공지</Link>
            <LogoutButton />
          </nav>
        </header>

        <section className="portalNotice" aria-label="풀이 안내">
          <div>
            <strong>문제 선택 후 바로 시작하세요</strong>
            <p>찾은 플래그는 따로 보관해 제출하세요. 일부부터 확인할 수 있고, 마지막에는 8개를 함께 제출합니다.</p>
          </div>
        </section>

        <details className="panel participantGuide">
          <summary>처음이라면: 기본 사용법 보기</summary>
          <ParticipationSteps />
          <p>웹페이지의 단서는 화면뿐 아니라 페이지 소스와 개발자 도구의 네트워크·저장소에서도 관찰할 수 있습니다. 막히면 운영자가 공개한 힌트를 확인하세요.</p>
        </details>

        <section className="serviceDirectorySection" id="challenges" aria-labelledby="challenge-list-title">
          <div className="sectionHeading">
            <div><p className="eyebrow">원하는 문제부터 도전</p><h2 id="challenge-list-title">도전할 문제 {services.length}개</h2></div>
            <p className="difficultyNote">난이도는 출제 기준의 예상 수준입니다.</p>
          </div>
          <ServiceDirectoryGrid services={services} />
        </section>
      </main>
    </>
  );
}
