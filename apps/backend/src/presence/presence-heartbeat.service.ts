import type { AuthenticatedSession } from "../auth/session-auth.service.js";

const PRESENCE_TTL_SECONDS = 90;

export type PresenceStore = {
  markSessionOnline(sessionId: string, ttlSeconds: number): Promise<void>;
};

export class PresenceHeartbeatService {
  constructor(private readonly store: PresenceStore) {}

  async heartbeat(session: AuthenticatedSession): Promise<{ ok: true }> {
    await this.store.markSessionOnline(session.sessionId, PRESENCE_TTL_SECONDS);
    return { ok: true };
  }
}
