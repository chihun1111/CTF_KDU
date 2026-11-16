import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../components/auth-form";
import { getCurrentSession } from "../lib/server-api";

export default async function RegisterPage() {
  const session = await getCurrentSession();
  if (session.authenticated) {
    redirect(session.role === "admin" ? "/admin/operations" : "/");
  }

  return (
    <main className="authShell">
      <section className="authIntro">
        <p className="eyebrow">교내 CTF 2026</p>
        <h1>회원가입</h1>
        <p className="lede">대회 참가에 사용할 7자리 학번과 비밀번호를 등록하고 필수 운영 항목을 확인해 주세요.</p>
      </section>
      <AuthForm mode="register" />
      <p className="authSwitch">
        이미 계정이 있다면 <Link href="/login">로그인</Link>
        <span className="authMainLink"><Link href="/">메인으로 돌아가기</Link></span>
      </p>
    </main>
  );
}
