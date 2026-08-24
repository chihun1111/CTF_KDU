import { HINT_CHALLENGES, HINT_STAGE_BY_ID, type HintStageKey } from "./hint-definitions.js";

export type HintReleaseRow = {
  stageId: string;
  releasedAt: Date;
  adminUserId: string | null;
};

export type HintReleaseStore = {
  listHintReleases(): Promise<HintReleaseRow[]>;
};

export type HintReleaseAuditRecorder = {
  recordAdminHintStageRelease(input: {
    adminUserId: string;
    stageId: string;
    challengeNumber: string;
    stageKey: HintStageKey;
  }): Promise<void>;
};

export type PublicHintStage = {
  stageId: string;
  key: HintStageKey;
  label: string;
  releaseTiming: string;
  released: boolean;
  releasedAt?: string;
  text?: string;
};

export type PublicHintChallenge = {
  number: string;
  title: string;
  stages: PublicHintStage[];
};

export type PublicHintsResponse = {
  generatedAt: string;
  challenges: PublicHintChallenge[];
};

export type AdminHintStage = Required<Pick<PublicHintStage, "text">> & PublicHintStage;

export type AdminHintChallenge = Omit<PublicHintChallenge, "stages"> & {
  stages: AdminHintStage[];
};

export type AdminHintsResponse = {
  generatedAt: string;
  totalStageCount: number;
  releasedStageCount: number;
  challenges: AdminHintChallenge[];
};

export type HintReleaseResult = {
  stageId: string;
  released: true;
  releasedAt: string;
};

export class UnknownHintStageError extends Error {
  constructor(stageId: string) {
    super(`Unknown hint stage: ${stageId}`);
  }
}

function releaseMap(rows: HintReleaseRow[]): Map<string, HintReleaseRow> {
  const result = new Map<string, HintReleaseRow>();
  for (const row of rows) {
    if (!result.has(row.stageId)) {
      result.set(row.stageId, row);
    }
  }
  return result;
}

export class HintsService {
  constructor(
    private readonly store: HintReleaseStore,
    private readonly auditRecorder?: HintReleaseAuditRecorder,
  ) {}

  async getPublicHints(now = new Date()): Promise<PublicHintsResponse> {
    const releases = releaseMap(await this.store.listHintReleases());
    return {
      generatedAt: now.toISOString(),
      challenges: HINT_CHALLENGES.map((challenge) => ({
        number: challenge.number,
        title: challenge.title,
        stages: challenge.stages.map((stage) => {
          const release = releases.get(stage.stageId);
          const base: PublicHintStage = {
            stageId: stage.stageId,
            key: stage.key,
            label: stage.label,
            releaseTiming: stage.releaseTiming,
            released: Boolean(release),
          };
          if (!release) {
            return base;
          }
          return {
            ...base,
            releasedAt: release.releasedAt.toISOString(),
            text: stage.text,
          };
        }),
      })),
    };
  }

  async getAdminHints(now = new Date()): Promise<AdminHintsResponse> {
    const releases = releaseMap(await this.store.listHintReleases());
    const challenges = HINT_CHALLENGES.map((challenge) => ({
      number: challenge.number,
      title: challenge.title,
      stages: challenge.stages.map((stage) => {
        const release = releases.get(stage.stageId);
        return {
          stageId: stage.stageId,
          key: stage.key,
          label: stage.label,
          releaseTiming: stage.releaseTiming,
          released: Boolean(release),
          ...(release ? { releasedAt: release.releasedAt.toISOString() } : {}),
          text: stage.text,
        };
      }),
    }));

    return {
      generatedAt: now.toISOString(),
      totalStageCount: HINT_CHALLENGES.reduce((count, challenge) => count + challenge.stages.length, 0),
      releasedStageCount: releases.size,
      challenges,
    };
  }

  async releaseHintStage(adminUserId: string, stageId: string, now = new Date()): Promise<HintReleaseResult> {
    const definition = HINT_STAGE_BY_ID.get(stageId);
    if (!definition) {
      throw new UnknownHintStageError(stageId);
    }
    const existing = releaseMap(await this.store.listHintReleases()).get(stageId);
    if (existing) {
      return {
        stageId,
        released: true,
        releasedAt: existing.releasedAt.toISOString(),
      };
    }

    await this.auditRecorder?.recordAdminHintStageRelease({
      adminUserId,
      stageId,
      challengeNumber: definition.challenge.number,
      stageKey: definition.stage.key,
    });

    return {
      stageId,
      released: true,
      releasedAt: now.toISOString(),
    };
  }
}
