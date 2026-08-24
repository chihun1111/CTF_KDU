"use client";

import { useEffect } from "react";
import { sendPresenceHeartbeat } from "../lib/client-api";

export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function heartbeat() {
      try {
        await sendPresenceHeartbeat();
      } catch {
        // Presence is informational and must not block solving or submission flows.
      }
    }

    void heartbeat();
    const timer = window.setInterval(() => {
      if (!cancelled) {
        void heartbeat();
      }
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
