import { PUBLIC_CHALLENGE_CATALOG, type FlagId, type PublicService } from "@campus-ctf/shared";

export type { FlagId, PublicService } from "@campus-ctf/shared";

export type PublicServiceRow = {
  flagId: FlagId;
};

export type ChallengeProgress = {
  correctCount: number;
  requiredCount: number;
  cleared: boolean;
  resultsByFlagId: Partial<Record<FlagId, { correct: boolean }>>;
};

export type ChallengesStore = {
  listActiveChallenges(): Promise<readonly PublicServiceRow[]>;
  getLatestProgress(userId: string): Promise<ChallengeProgress>;
};

const PUBLIC_SERVICE_BY_FLAG_ID = new Map<string, PublicService>(
  PUBLIC_CHALLENGE_CATALOG.map((service) => [`FLAG-${service.id}`, service]),
);
const PUBLIC_SERVICE_BY_SLUG = new Map<string, PublicService>(
  PUBLIC_CHALLENGE_CATALOG.map((service) => [service.slug, service]),
);

export function publicServiceIdFromSlug(slug: string): string | null {
  return PUBLIC_SERVICE_BY_SLUG.get(slug)?.id ?? null;
}

export function publicServiceHrefForFlagId(flagId: string): string {
  return PUBLIC_SERVICE_BY_FLAG_ID.get(flagId)?.serviceHref ?? "/";
}

export class ChallengesService {
  constructor(private readonly store: ChallengesStore) {}

  async listForParticipant(userId: string): Promise<{ services: PublicService[] }> {
    void userId;
    const activeFlags = new Set<string>((await this.store.listActiveChallenges()).map((challenge) => challenge.flagId));

    return {
      // Use the public catalog as an allowlist. Database identifiers and extra
      // columns must never enter participant responses, even from unexpected rows.
      services: PUBLIC_CHALLENGE_CATALOG
        .filter((service) => activeFlags.has(`FLAG-${service.id}`))
        .map((service) => ({ ...service })),
    };
  }

  async getProgressForParticipant(userId: string): Promise<ChallengeProgress> {
    return this.store.getLatestProgress(userId);
  }
}
