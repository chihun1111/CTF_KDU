import type { AuthenticatedSession } from "../auth/session-auth.service.js";

const PRESENCE_TTL_SECONDS = 90;

export type PresenceStore = {
  markSessionOnline(sessionId: string, ttlSeconds: number): Promise<void>;
};

export class PresenceHeartbeatService {
  constructor(private readonly store: PresenceStore) {}

  async heartbeat(session: AuthenticatedSession): Promise<{ ok: true }> {
    try {
      await this.store.markSessionOnline(session.sessionId, PRESENCE_TTL_SECONDS);
    } catch {
      // SessionAuthGuard already persisted last_seen_at before this handler.
      // A cache outage must not turn an authenticated heartbeat into a 500.
    }
    return { ok: true };
  }
}
