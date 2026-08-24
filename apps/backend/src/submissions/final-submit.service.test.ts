import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { FinalSubmitService, type FinalSubmitStore } from "./final-submit.service.js";

const flagIds = ["FLAG-01", "FLAG-02", "FLAG-03", "FLAG-04", "FLAG-05", "FLAG-06", "FLAG-07", "FLAG-08"] as const;

function validInput(valueByFlagId: Record<string, string>) {
  return {
    flagsByFlagId: Object.fromEntries(flagIds.map((flagId) => [flagId, valueByFlagId[flagId] ?? "KDUCTF" + "{wrong}"])),
  };
}

function createStore(events: string[] = []): FinalSubmitStore {
  return {
    async transaction(callback) {
      return callback({
        async listUserChallengeFlags(userId) {
          events.push(`list:${userId}`);
          return flagIds.map((flagId, index) => ({
            flagId,
            challengeId: `challenge-${index + 1}`,
            flagHash: `${flagId}-hash`,
          }));
        },
        async createFinalSubmission(input) {
          events.push(`submission:${JSON.stringify(input)}`);
          return { id: "submission-1" };
        },
        async createFinalSubmissionResults(input) {
          events.push(`results:${JSON.stringify(input)}`);
        },
        async ensureClear(input) {
          events.push(`clear:${JSON.stringify(input)}`);
        },
        async createClearViewToken(input) {
          events.push(`clear-token:${JSON.stringify(input)}`);
        },
      });
    },
  };
}

test("FinalSubmitService stores only hashes and result booleans for a partial submission", async () => {
  const events: string[] = [];
  const service = new FinalSubmitService(
    createStore(events),
    {
      flagHash: (value) => (value.includes("right-01") ? "FLAG-01-hash" : `hash:${value}`),
      timingSafeHashEqual: (left, right) => left === right,
      generateOpaqueToken: () => "clear-token",
      clearViewTokenHash: () => "clear-token-hash",
    },
    {
      buildClearCookie: () => "ctf_clear_once=clear-token",
    },
  );

  const result = await service.submit("user-1", validInput({ "FLAG-01": "KDUCTF" + "{right-01}" }));

  assert.equal(result.setCookie, undefined);
  assert.deepEqual(result.body.resultsByFlagId["FLAG-01"], { correct: true });
  assert.deepEqual(result.body.resultsByFlagId["FLAG-02"], { correct: false });
  assert.equal(result.body.correctCount, 1);
  assert.equal(result.body.cleared, false);
  assert.equal(JSON.stringify(result).includes("right-01"), false);
  assert.equal(JSON.stringify(result).includes("clear-token"), false);
  assert.equal(events.some((event) => event.startsWith("clear-token:")), false);
});

test("FinalSubmitService accepts a single found flag without requiring every slot", async () => {
  const events: string[] = [];
  const service = new FinalSubmitService(
    createStore(events),
    {
      flagHash: (value) => (value.includes("right-01") ? "FLAG-01-hash" : `hash:${value}`),
      timingSafeHashEqual: (left, right) => left === right,
      generateOpaqueToken: () => "clear-token",
      clearViewTokenHash: () => "clear-token-hash",
    },
    {
      buildClearCookie: () => "ctf_clear_once=clear-token",
    },
  );

  const result = await service.submit("user-1", { flagsByFlagId: { "FLAG-01": "KDUCTF" + "{right-01}" } });
  const serializedEvents = JSON.stringify(events);

  assert.equal(result.setCookie, undefined);
  assert.equal(result.body.correctCount, 1);
  assert.equal(result.body.requiredCount, 8);
  assert.equal(result.body.cleared, false);
  assert.deepEqual(result.body.resultsByFlagId, { "FLAG-01": { correct: true } });
  assert.equal(serializedEvents.includes("right-01"), false);
  assert.equal(serializedEvents.includes("FLAG-02"), false);
  assert.equal(events.some((event) => event.startsWith("clear-token:")), false);
});

test("FinalSubmitService matches a found flag regardless of the input slot used", async () => {
  const events: string[] = [];
  const service = new FinalSubmitService(
    createStore(events),
    {
      flagHash: (value) => (value.includes("right-01") ? "FLAG-01-hash" : `hash:${value}`),
      timingSafeHashEqual: (left, right) => left === right,
      generateOpaqueToken: () => "clear-token",
      clearViewTokenHash: () => "clear-token-hash",
    },
    {
      buildClearCookie: () => "ctf_clear_once=clear-token",
    },
  );

  const result = await service.submit("user-1", { flagsByFlagId: { "FLAG-08": "KDUCTF" + "{right-01}" } });
  const serializedEvents = JSON.stringify(events);

  assert.equal(result.body.correctCount, 1);
  assert.deepEqual(result.body.resultsByFlagId, { "FLAG-01": { correct: true } });
  assert.equal(serializedEvents.includes("right-01"), false);
  assert.equal(JSON.stringify(result.body.resultsByFlagId).includes('"FLAG-08"'), false);
});

test("FinalSubmitService clears when all issued flags are submitted in different slots", async () => {
  const service = new FinalSubmitService(
    createStore(),
    {
      flagHash: (value) => `${value.match(/FLAG-0[1-8]/)?.[0] ?? "missing"}-hash`,
      timingSafeHashEqual: (left, right) => left === right,
      generateOpaqueToken: () => "clear-token",
      clearViewTokenHash: () => "clear-token-hash",
    },
    {
      buildClearCookie: (token) => `ctf_clear_once=${token}; HttpOnly`,
    },
  );

  const result = await service.submit("user-1", {
    flagsByFlagId: Object.fromEntries(
      flagIds.map((slotFlagId, index) => [slotFlagId, "KDUCTF" + `{${flagIds[flagIds.length - index - 1]}}`]),
    ),
  });

  assert.equal(result.body.correctCount, 8);
  assert.equal(result.body.cleared, true);
  assert.equal(result.setCookie, "ctf_clear_once=clear-token; HttpOnly");
  assert.deepEqual(result.body.resultsByFlagId, Object.fromEntries(flagIds.map((flagId) => [flagId, { correct: true }])));
});

test("FinalSubmitService records final submit audit metadata per participant", async () => {
  const auditEvents: unknown[] = [];
  const service = new FinalSubmitService(
    createStore(),
    {
      flagHash: (value) => (value.includes("right-01") ? "FLAG-01-hash" : `hash:${value}`),
      timingSafeHashEqual: (left, right) => left === right,
      generateOpaqueToken: () => "clear-token",
      clearViewTokenHash: () => "clear-token-hash",
    },
    {
      buildClearCookie: () => "ctf_clear_once=clear-token",
    },
    {
      async recordFinalSubmit(input) {
        auditEvents.push(input);
      },
    },
  );

  await service.submit("user-1", { flagsByFlagId: { "FLAG-08": "KDUCTF" + "{right-01}" } });

  assert.deepEqual(auditEvents, [
    {
      userId: "user-1",
      correctCount: 1,
      requiredCount: 8,
      submittedCount: 1,
      cleared: false,
    },
  ]);
  assert.equal(JSON.stringify(auditEvents).includes("right-01"), false);
  assert.equal(JSON.stringify(auditEvents).includes("KDUCTF{"), false);
});

test("FinalSubmitService issues a clear cookie only when all 8 flags are correct", async () => {
  const events: string[] = [];
  const service = new FinalSubmitService(
    createStore(events),
    {
      flagHash: (value) => `${value.match(/FLAG-0[1-8]/)?.[0] ?? "missing"}-hash`,
      timingSafeHashEqual: (left, right) => left === right,
      generateOpaqueToken: () => "clear-token",
      clearViewTokenHash: () => "clear-token-hash",
    },
    {
      buildClearCookie: (token) => `ctf_clear_once=${token}; HttpOnly`,
    },
  );

  const result = await service.submit(
    "user-1",
    validInput(Object.fromEntries(flagIds.map((flagId) => [flagId, "KDUCTF" + `{${flagId}}`]))),
  );

  assert.equal(result.setCookie, "ctf_clear_once=clear-token; HttpOnly");
  assert.equal(result.body.cleared, true);
  assert.equal(result.body.clearRedirectTo, "/clear");
  assert.equal(JSON.stringify(result.body).includes("clear-token"), false);
  assert(events.some((event) => event.startsWith("clear:")));
  assert(events.some((event) => event.startsWith("clear-token:")));
});

test("FinalSubmitService rejects empty submissions and malformed submitted flag values", async () => {
  const service = new FinalSubmitService(createStore(), {
    flagHash: () => "hash",
    timingSafeHashEqual: () => false,
    generateOpaqueToken: () => "clear-token",
    clearViewTokenHash: () => "clear-token-hash",
  }, {
    buildClearCookie: () => "ctf_clear_once=clear-token",
  });

  await assert.rejects(() => service.submit("user-1", { flagsByFlagId: {} }), BadRequestException);
  await assert.rejects(() => service.submit("user-1", { flagsByFlagId: { "FLAG-01": "" } }), BadRequestException);
  await assert.rejects(() => service.submit("user-1", validInput({ "FLAG-01": "not-a-flag" })), BadRequestException);
});
