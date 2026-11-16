"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutParticipant } from "../lib/client-api";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function logout() {
    if (pending) {
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      await logoutParticipant();
      router.replace("/login");
      router.refresh();
    } catch {
      setMessage("로그아웃하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="logoutControl">
      <button className="ghostButton" disabled={pending} type="button" onClick={logout}>
        {pending ? "로그아웃 중" : "로그아웃"}
      </button>
      {message ? <span className="formError" role="alert">{message}</span> : null}
    </span>
  );
}
