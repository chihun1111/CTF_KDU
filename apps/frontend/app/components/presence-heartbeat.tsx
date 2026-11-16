"use client";

import { useEffect } from "react";
import { sendPresenceHeartbeat } from "../lib/client-api";

export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function heartbeat() {
      if (cancelled || inFlight || document.visibilityState !== "visible") {
        return;
      }
      inFlight = true;
      try {
        await sendPresenceHeartbeat();
      } catch {
        // Presence is informational and must not block solving or submission flows.
      } finally {
        inFlight = false;
      }
    }

    void heartbeat();
    const timer = window.setInterval(() => {
      if (!cancelled) {
        void heartbeat();
      }
    }, 30_000);
    document.addEventListener("visibilitychange", heartbeat);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, []);

  return null;
}
