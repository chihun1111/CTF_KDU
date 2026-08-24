import Link from "next/link";
import { redirect } from "next/navigation";
import { CampusGlobalHeader } from "../components/campus-global-header";
import { LogoutButton } from "../components/logout-button";
import { PresenceHeartbeat } from "../components/presence-heartbeat";
import { ServiceDirectoryGrid } from "../components/services/service-directory-grid";
import { getCurrentSession, getServiceHub } from "../lib/server-api";

export default async function HubPage() {
  const session = await getCurrentSession();
  if (!session.authenticated) {
    redirect("/login");
  }

  const hub = await getServiceHub();
  if (!hub.ok) {
    if (hub.status === 401) {
      redirect("/login");
    }
    throw new Error("Failed to load service hub");
  }

  const { services } = hub.data;

  return (
    <>
      <CampusGlobalHeader />
      <main className="shell">
        <PresenceHeartbeat />
        <header className="portalHero">
          <div className="portalHeroCopy">
            <p className="eyebrow">KDU 통합 안내 포털</p>
            <h1>교내 서비스 안내</h1>
            <p className="lede">축제, 학사, 전산실과 학생 활동에 필요한 주요 안내를 한곳에서 확인할 수 있습니다.</p>
          </div>
          <nav className="headerActions" aria-label="주요 이동">
            {session.role === "admin" ? (
              <Link className="secondaryLink" href="/admin/operations">
                운영 화면
              </Link>
            ) : null}
            <Link className="primaryLink" href="/submit">
              제출 페이지
            </Link>
            <Link className="secondaryLink" href="/hints">
              운영 공지
            </Link>
            <LogoutButton />
          </nav>
        </header>

        <section className="portalNotice" aria-label="이용 안내">
          <div>
            <strong>서비스가 정상 운영 중입니다</strong>
            <p>원하는 항목을 선택하면 해당 교내 서비스로 바로 이동합니다.</p>
          </div>
          <Link className="secondaryLink" href="/submit">
            제출 페이지 이동
          </Link>
        </section>

        <section className="serviceDirectorySection" aria-label="서비스 목록">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">교내 서비스 목록</p>
              <h2>이용 가능한 서비스</h2>
            </div>
          </div>
          <ServiceDirectoryGrid services={services} />
        </section>
      </main>
    </>
  );
}
