"use client";

import Link from "next/link";

export default function ErrorPage() {
  return (
    <main className="authShell">
      <section className="panel emptyState">
        <p className="eyebrow">오류 안내</p>
        <h1>요청을 처리하지 못했습니다.</h1>
        <p>잠시 후 다시 시도해주세요.</p>
        <Link className="primaryLink" href="/hub">
          허브로 이동
        </Link>
      </section>
    </main>
  );
}
