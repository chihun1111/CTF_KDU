"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutParticipant } from "../lib/client-api";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) {
      return;
    }

    setPending(true);
    try {
      await logoutParticipant();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button className="ghostButton" disabled={pending} type="button" onClick={logout}>
      {pending ? "로그아웃 중" : "로그아웃"}
    </button>
  );
}
