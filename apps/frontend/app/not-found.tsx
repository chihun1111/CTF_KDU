import Link from "next/link";

export default function NotFound() {
  return (
    <main className="authShell">
      <section className="panel emptyState">
        <p className="eyebrow">페이지 안내</p>
        <h1>페이지를 찾을 수 없습니다.</h1>
        <p>요청한 경로가 없거나 공개되지 않았습니다.</p>
        <Link className="primaryLink" href="/">
          문제 목록으로 이동
        </Link>
      </section>
    </main>
  );
}
