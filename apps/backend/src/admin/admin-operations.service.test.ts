import assert from "node:assert/strict";
import test from "node:test";
import { AdminOperationsService } from "./admin-operations.service.js";

test("AdminOperationsService builds summary from aggregate counts and online sessions", async () => {
  const service = new AdminOperationsService(
    {
      async getSummaryCounts() {
        return {
          registeredUserCount: 12,
          submittedUserCount: 7,
          clearedUserCount: 2,
          finalSubmissionCount: 19,
        };
      },
      async listParticipants() {
        throw new Error("not used");
      },
      async listSubmissions() {
        throw new Error("not used");
      },
      async listClears() {
        throw new Error("not used");
      },
      async listChallengeStatus() {
        throw new Error("not used");
      },
      async listAuditLogs() {
        throw new Error("not used");
      },
      async getSystemHealthSnapshot() {
        throw new Error("not used");
      },
    },
    {
      async getOnlineCount() {
        return {
          onlineSessionCount: 3,
          source: "db_last_seen_fallback",
          windowSeconds: 120,
          generatedAt: "2026-05-10T00:00:00.000Z",
        };
      },
    },
  );

  const now = new Date("2026-05-10T00:10:00.000Z");
  const summary = await service.getSummary(now);

  assert.deepEqual(summary, {
    onlineSessionCount: 3,
    registeredUserCount: 12,
    submittedUserCount: 7,
    clearedUserCount: 2,
    finalSubmissionCount: 19,
    systemHealth: {
      backend: "ok",
      postgres: "ok",
      redis: "degraded",
      challengeServices: {
        ok: 8,
        degraded: 0,
        down: 0,
      },
    },
    generatedAt: "2026-05-10T00:10:00.000Z",
  });
});

test("AdminOperationsService serializes participant, submission, and clear dates without sensitive values", async () => {
  const service = new AdminOperationsService(
    {
      async getSummaryCounts() {
        throw new Error("not used");
      },
      async listParticipants() {
        return {
          items: [
            {
              participantRef: "participant:aaaaaaaaaaaa",
              role: "participant" as const,
              registeredAt: new Date("2026-05-10T00:00:00.000Z"),
              lastSeenAt: null,
              online: false,
              latestCorrectCount: 0,
              requiredCount: 8 as const,
              cleared: false,
              clearedAt: null,
              finalSubmissionCount: 0,
            },
          ],
          page: 1,
          pageSize: 50,
          totalCount: 1,
        };
      },
      async listSubmissions() {
        return {
          items: [
            {
              id: "submission-1",
              participantRef: "participant:aaaaaaaaaaaa",
              correctCount: 1,
              requiredCount: 8 as const,
              isClear: false,
              resultsByFlagId: { "FLAG-01": { correct: true } },
              createdAt: new Date("2026-05-10T00:01:00.000Z"),
            },
          ],
          page: 1,
          pageSize: 50,
          totalCount: 1,
        };
      },
      async listClears() {
        return {
          items: [
            {
              participantRef: "participant:aaaaaaaaaaaa",
              clearedAt: new Date("2026-05-10T00:02:00.000Z"),
            },
          ],
          page: 1,
          pageSize: 50,
          totalCount: 1,
        };
      },
      async listChallengeStatus() {
        throw new Error("not used");
      },
      async listAuditLogs() {
        throw new Error("not used");
      },
      async getSystemHealthSnapshot() {
        throw new Error("not used");
      },
    },
    {
      async getOnlineCount() {
        throw new Error("not used");
      },
    },
  );

  const [participants, submissions, clears] = await Promise.all([
    service.listParticipants(),
    service.listSubmissions(),
    service.listClears(),
  ]);
  const serialized = JSON.stringify({ participants, submissions, clears });

  assert.equal(participants.items[0]?.registeredAt, "2026-05-10T00:00:00.000Z");
  assert.equal(submissions.items[0]?.createdAt, "2026-05-10T00:01:00.000Z");
  assert.equal(clears.items[0]?.clearedAt, "2026-05-10T00:02:00.000Z");
  assert.equal(serialized.includes("submittedFlag"), false);
  assert.equal(serialized.includes("sessionHash"), false);
  assert.equal(participants.items[0]?.participantRef, "participant:aaaaaaaaaaaa");
  assert.equal(submissions.items[0]?.participantRef, "participant:aaaaaaaaaaaa");
  assert.equal(clears.items[0]?.participantRef, "participant:aaaaaaaaaaaa");
  assert.equal(serialized.includes("2622022"), false);
  assert.equal(serialized.includes('"userId"'), false);
});

test("AdminOperationsService sanitizes audit log metadata before admin responses", async () => {
  const storeInputs: unknown[] = [];
  const service = new AdminOperationsService(
    {
      async getSummaryCounts() {
        throw new Error("not used");
      },
      async listParticipants() {
        throw new Error("not used");
      },
      async listSubmissions() {
        throw new Error("not used");
      },
      async listClears() {
        throw new Error("not used");
      },
      async listChallengeStatus() {
        throw new Error("not used");
      },
      async listAuditLogs(input) {
        storeInputs.push(input);
        return {
          items: [
            {
              id: "audit-1",
              userId: "admin-1",
              action: "ADMIN_AUDIT_LOGS_VIEWED",
              metadata: {
                resource: "audit-logs",
                page: 1,
                pageSize: 50,
                targetUserId: "user-1",
                requestBody: { password: "plain-password", flag: "KDUCTF{leak}" },
                cookie: "ctf_session=opaque-session-token",
                studentId: "2622022",
                userAgent: "Mozilla/5.0",
                nested: { claimToken: "claim-token" },
              },
              createdAt: new Date("2026-05-10T00:03:00.000Z"),
            },
            {
              id: "audit-2",
              userId: "user-1",
              action: "CLAIM_VERIFY_FAILED",
              metadata: {
                reason: "not_found_or_expired",
                challengeId: "08",
                flagId: "FLAG-08",
                token: "claim-token",
              },
              createdAt: new Date("2026-05-10T00:04:00.000Z"),
            },
          ],
          page: 1,
          pageSize: 50,
          totalCount: 2,
        };
      },
      async getSystemHealthSnapshot() {
        throw new Error("not used");
      },
    },
    {
      async getOnlineCount() {
        throw new Error("not used");
      },
    },
  );

  const result = await service.listAuditLogs(1, 50);
  const serialized = JSON.stringify(result);

  assert.deepEqual(result.items[0]?.metadata, {
    resource: "audit-logs",
    page: 1,
    pageSize: 50,
  });
  assert.deepEqual(result.items[1]?.metadata, {
    reason: "not_found_or_expired",
    challengeId: "08",
    flagId: "FLAG-08",
  });
  assert.equal(result.items[0]?.createdAt, "2026-05-10T00:03:00.000Z");
  assert.equal(serialized.includes("plain-password"), false);
  assert.equal(serialized.includes("KDUCTF{"), false);
  assert.equal(serialized.includes("ctf_session"), false);
  assert.equal(serialized.includes("2622022"), false);
  assert.equal(serialized.includes("claim-token"), false);
  assert.equal(serialized.includes("Mozilla/5.0"), false);
  assert.equal(serialized.includes("admin-1"), false);
  assert.equal(serialized.includes("user-1"), false);
  assert.match(result.items[0]?.actorRef ?? "", /^participant:[0-9a-f]{12}$/);
  assert.deepEqual(storeInputs[0], {
    page: 1,
    pageSize: 50,
  });
});

test("AdminOperationsService reports measured system health without assuming dependencies are healthy", async () => {
  const service = new AdminOperationsService(
    {
      async getSummaryCounts() {
        throw new Error("not used");
      },
      async listParticipants() {
        throw new Error("not used");
      },
      async listSubmissions() {
        throw new Error("not used");
      },
      async listClears() {
        throw new Error("not used");
      },
      async listChallengeStatus() {
        throw new Error("not used");
      },
      async listAuditLogs() {
        throw new Error("not used");
      },
      async getSystemHealthSnapshot() {
        return {
          postgresLatencyMs: 11,
        };
      },
    },
    {
      async getOnlineCount() {
        return {
          onlineSessionCount: 5,
          source: "db_last_seen_fallback",
          windowSeconds: 120,
          generatedAt: "2026-05-10T00:00:00.000Z",
        };
      },
    },
    {
      async check(endpoint) {
        return endpoint.challengeId === "01"
          ? { challengeId: "01", status: "ok", latencyMs: 12 }
          : { challengeId: endpoint.challengeId, status: "down", latencyMs: 0 };
      },
    },
  );

  const health = await service.getSystemHealth(new Date("2026-05-10T00:10:00.000Z"));

  assert.equal(health.backend.checkedAt, "2026-05-10T00:10:00.000Z");
  assert.deepEqual(health.postgres, { status: "ok", latencyMs: 11 });
  assert.equal(health.redis.status, "degraded");
  assert.equal(health.redis.latencyMs >= 0, true);
  assert.equal(health.challengeServices.length, 8);
  assert.deepEqual(health.challengeServices[0], { challengeId: "01", status: "ok", latencyMs: 12 });
  assert.equal(health.challengeServices[1]?.status, "down");
});
