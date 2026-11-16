import assert from "node:assert/strict";
import test from "node:test";
import { ChallengesService, publicServiceHrefForFlagId, publicServiceIdFromSlug, type ChallengesStore } from "./challenges.service.js";

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

test("ChallengesService returns approved difficulty and direct problem routes without sensitive data or progress", async () => {
  const service = new ChallengesService(createStore());

  const result = await service.listForParticipant("user-1");

  assert.deepEqual(result, {
    services: [
    {
      id: "01",
      slug: "campus-festival",
      title: "캠퍼스 축제 안내",
      department: "축제기획단",
      updatedAt: "2026-11-16",
      summary: "올해 미니 축제 일정과 부스 안내를 확인합니다.",
      actionLabel: "문제 풀기",
      serviceHref: "/challenges/01/",
      difficulty: "입문",
      difficultyLevel: 1,
      category: "Web / Misc",
    },
    {
      id: "02",
      slug: "it-center-status",
      title: "서비스 상태",
      department: "전산실",
      updatedAt: "2026-11-16",
      summary: "학교 주요 서비스의 현재 상태를 확인합니다.",
      actionLabel: "문제 풀기",
      serviceHref: "/challenges/02/",
      difficulty: "초급",
      difficultyLevel: 2,
      category: "Web",
    },
    ],
  });
  assert.equal(JSON.stringify(result).includes("KDUCTF" + "{"), false);
  assert.equal(JSON.stringify(result).includes("user-1"), false);
  assert.equal(JSON.stringify(result).includes("/internal/"), false);
  assert.equal(JSON.stringify(result).includes("FLAG-"), false);
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

test("participant catalog only exposes active known problems and never spreads database fields", async () => {
  const store = createStore();
  store.listActiveChallenges = async () => [
    { flagId: "FLAG-05", flag: "private-runtime-value", userId: "user-private", internalUrl: "/internal/flags" },
    { flagId: "FLAG-01" },
    { flagId: "FLAG-05" },
    { flagId: "FLAG-99" },
  ] as unknown as Awaited<ReturnType<ChallengesStore["listActiveChallenges"]>>;

  const service = new ChallengesService(store);
  const result = await service.listForParticipant("user-private");
  assert.deepEqual(result.services.map(({ id, serviceHref }) => ({ id, serviceHref })), [
    { id: "01", serviceHref: "/challenges/01/" },
    { id: "05", serviceHref: "/challenges/05/" },
  ]);
  const serialized = JSON.stringify(result);
  for (const value of ["private-runtime-value", "user-private", "internalUrl", "/internal/", "FLAG-"]) {
    assert.equal(serialized.includes(value), false, `response must not contain ${value}`);
  }

  result.services[0]!.title = "caller modification";
  const second = await service.listForParticipant("another-user");
  assert.equal(second.services[0]?.title, "캠퍼스 축제 안내");
});

test("legacy slugs and administrator links resolve to the same canonical problem URLs", () => {
  const slugs = [
    "campus-festival", "it-center-status", "student-assignments", "club-admin-status",
    "club-security-site", "club-build-archive", "community-board", "bonus-prize-desk",
  ];
  for (const [index, slug] of slugs.entries()) {
    const number = String(index + 1).padStart(2, "0");
    assert.equal(publicServiceIdFromSlug(slug), number);
    assert.equal(publicServiceHrefForFlagId(`FLAG-${number}`), `/challenges/${number}/`);
  }
  for (const slug of ["", "unknown", "../campus-festival", "__proto__"]) {
    assert.equal(publicServiceIdFromSlug(slug), null);
  }
  for (const id of ["FLAG-1", "FLAG-09", "__proto__", "FLAG-01/../02"]) {
    assert.equal(publicServiceHrefForFlagId(id), "/");
  }
});
