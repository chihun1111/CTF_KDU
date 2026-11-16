import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../components/auth-form";
import { getCurrentSession } from "../lib/server-api";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session.authenticated) {
    redirect(session.role === "admin" ? "/admin/operations" : "/");
  }

  return (
    <main className="authShell">
      <section className="authIntro">
        <p className="eyebrow">교내 CTF 2026</p>
        <h1>로그인</h1>
        <p className="lede">등록한 7자리 학번과 비밀번호를 입력해 참가자 문제 목록으로 들어가세요.</p>
      </section>
      <AuthForm mode="login" />
      <p className="authSwitch">
        아직 계정이 없다면 <Link href="/register">회원가입</Link>
        <span className="authMainLink"><Link href="/">메인으로 돌아가기</Link></span>
      </p>
    </main>
  );
}
