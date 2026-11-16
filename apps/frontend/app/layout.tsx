import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KDU 교내 CTF | 문제 목록",
  description: "2026 KDU 교내 CTF 참가 안내, 난이도별 문제 선택과 플래그 제출을 제공합니다.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
