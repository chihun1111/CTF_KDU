import assert from "node:assert/strict";
import test from "node:test";
import { HintsService, UnknownHintStageError, type HintReleaseStore } from "./hints.service.js";

function createStore(releases: Awaited<ReturnType<HintReleaseStore["listHintReleases"]>> = []): HintReleaseStore {
  return {
    async listHintReleases() {
      return releases;
    },
  };
}

test("HintsService returns only released hint text to participants", async () => {
  const service = new HintsService(createStore([
    {
      stageId: "01:first",
      releasedAt: new Date("2026-05-10T01:00:00.000Z"),
      adminUserId: "admin-1",
    },
  ]));

  const result = await service.getPublicHints();
  const firstChallenge = result.challenges[0];
  const firstStage = firstChallenge?.stages[0];
  const secondStage = firstChallenge?.stages[1];
  const serialized = JSON.stringify(result);

  assert.equal(firstChallenge?.number, "01");
  assert.equal(firstStage?.released, true);
  assert.equal(firstStage?.text, "화면에 렌더링되지 않아도 브라우저가 받은 문서에는 남아 있을 수 있습니다.");
  assert.equal(firstStage?.releasedAt, "2026-05-10T01:00:00.000Z");
  assert.equal(secondStage?.released, false);
  assert.equal("text" in (secondStage ?? {}), false);
  assert.equal(serialized.includes("페이지 소스 보기나 개발자 도구의 Elements 탭에서 주석을 찾아보세요."), false);
  assert.equal(serialized.includes("FLAG-01"), false);
});

test("HintsService returns every hint text and release status to admins", async () => {
  const service = new HintsService(createStore([
    {
      stageId: "07:second",
      releasedAt: new Date("2026-05-10T04:00:00.000Z"),
      adminUserId: "admin-1",
    },
  ]));

  const result = await service.getAdminHints();
  const printer = result.challenges.find((challenge) => challenge.number === "07");
  const second = printer?.stages.find((stage) => stage.key === "second");

  assert.equal(result.totalStageCount, 24);
  assert.equal(result.releasedStageCount, 1);
  assert.equal(second?.released, true);
  assert.equal("releasedByAdminUserId" in (second ?? {}), false);
  assert.equal(JSON.stringify(result).includes("admin-1"), false);
  assert.equal(second?.text, "작은따옴표로 조건을 닫고 UNION SELECT로 출력 행을 늘릴 수 있는지 확인해보세요.");
  assert.equal(JSON.stringify(result).includes("KDUCTF{"), false);
});

test("HintsService releases a valid stage by recording safe audit metadata", async () => {
  const events: Array<{ adminUserId: string; stageId: string; challengeNumber: string; stageKey: string }> = [];
  const service = new HintsService(createStore(), {
    async recordAdminHintStageRelease(input) {
      events.push(input);
    },
  });

  const result = await service.releaseHintStage("admin-1", "08:extra");

  assert.equal(result.stageId, "08:extra");
  assert.equal(result.released, true);
  assert.deepEqual(events, [
    {
      adminUserId: "admin-1",
      stageId: "08:extra",
      challengeNumber: "08",
      stageKey: "extra",
    },
  ]);
});

test("HintsService rejects unknown hint stage ids before recording audit events", async () => {
  const events: unknown[] = [];
  const service = new HintsService(createStore(), {
    async recordAdminHintStageRelease(input) {
      events.push(input);
    },
  });

  await assert.rejects(() => service.releaseHintStage("admin-1", "FLAG-01:first"), UnknownHintStageError);
  assert.equal(events.length, 0);
});
