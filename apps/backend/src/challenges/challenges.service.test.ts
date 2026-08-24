import assert from "node:assert/strict";
import test from "node:test";
import { ChallengesService, type ChallengesStore } from "./challenges.service.js";

function createStore(): ChallengesStore {
  return {
    async listActiveChallenges() {
      return [
        {
          flagId: "FLAG-01",
        },
        {
          flagId: "FLAG-02",
        },
      ];
    },
    async getLatestProgress() {
      return {
        correctCount: 1,
        requiredCount: 8,
        cleared: false,
        resultsByFlagId: {
          "FLAG-01": { correct: true },
          "FLAG-02": { correct: false },
        },
      };
    },
  };
}

test("ChallengesService returns school service directory data without challenge metadata or progress", async () => {
  const service = new ChallengesService(createStore());

  const result = await service.listForParticipant("user-1");

  assert.deepEqual(result, {
    services: [
    {
      id: "01",
      slug: "campus-festival",
      title: "캠퍼스 축제 안내",
      department: "축제기획단",
      updatedAt: "2026-08-24",
      summary: "올해 미니 축제 일정과 부스 안내를 확인합니다.",
      actionLabel: "안내 보기",
      serviceHref: "/campus/festival/",
    },
    {
      id: "02",
      slug: "it-center-status",
      title: "서비스 상태",
      department: "전산실",
      updatedAt: "2026-08-24",
      summary: "학교 주요 서비스의 현재 상태를 확인합니다.",
      actionLabel: "상태 확인",
      serviceHref: "/system/status/",
    },
    ],
  });
  assert.equal(JSON.stringify(result).includes("KDUCTF" + "{"), false);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
  assert.equal(JSON.stringify(result).includes("/internal/"), false);
  assert.equal(JSON.stringify(result).includes("FLAG-"), false);
  assert.equal(JSON.stringify(result).includes("difficulty"), false);
  assert.equal(JSON.stringify(result).includes("progress"), false);
});

test("ChallengesService returns progress without challenge metadata or sensitive fields", async () => {
  const service = new ChallengesService(createStore());

  const result = await service.getProgressForParticipant("user-1");

  assert.deepEqual(result, {
    correctCount: 1,
    requiredCount: 8,
    cleared: false,
    resultsByFlagId: {
      "FLAG-01": { correct: true },
      "FLAG-02": { correct: false },
    },
  });
  assert.equal(JSON.stringify(result).includes("user-1"), false);
  assert.equal(JSON.stringify(result).includes("KDUCTF" + "{"), false);
  assert.equal(JSON.stringify(result).includes("/c/"), false);
});
