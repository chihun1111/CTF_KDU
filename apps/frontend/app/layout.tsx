import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KDU 교내 서비스 | 2026 교내 CTF",
  description: "2026 교내 CTF 참가자를 위한 KDU 교내 서비스 포털입니다.",
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
