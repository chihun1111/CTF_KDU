export type FlagId = `FLAG-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export type PublicServiceRow = {
  flagId: FlagId;
};

export type ChallengeProgress = {
  correctCount: number;
  requiredCount: number;
  cleared: boolean;
  resultsByFlagId: Partial<Record<FlagId, { correct: boolean }>>;
};

export type PublicService = {
  id: string;
  slug: string;
  title: string;
  department: string;
  updatedAt: string;
  summary: string;
  actionLabel: string;
  serviceHref: string;
};

export type ChallengesStore = {
  listActiveChallenges(): Promise<readonly PublicServiceRow[]>;
  getLatestProgress(userId: string): Promise<ChallengeProgress>;
};

const PUBLIC_CHALLENGE_DETAILS: Record<
  FlagId,
  {
    id: string;
    slug: string;
    title: string;
    department: string;
    updatedAt: string;
    summary: string;
    actionLabel: string;
    serviceHref: string;
  }
> = {
  "FLAG-01": {
    id: "01",
    slug: "campus-festival",
    title: "캠퍼스 축제 안내",
    department: "축제기획단",
    updatedAt: "2026-08-24",
    summary: "올해 미니 축제 일정과 부스 안내를 확인합니다.",
    actionLabel: "안내 보기",
    serviceHref: "/campus/festival/",
  },
  "FLAG-02": {
    id: "02",
    slug: "it-center-status",
    title: "서비스 상태",
    department: "전산실",
    updatedAt: "2026-08-24",
    summary: "학교 주요 서비스의 현재 상태를 확인합니다.",
    actionLabel: "상태 확인",
    serviceHref: "/system/status/",
  },
  "FLAG-03": {
    id: "03",
    slug: "student-assignments",
    title: "과제 제출 확인",
    department: "교무처",
    updatedAt: "2026-08-24",
    summary: "과제 제출 현황과 상세 내용을 확인합니다.",
    actionLabel: "현황 열기",
    serviceHref: "/student/assignments/",
  },
  "FLAG-04": {
    id: "04",
    slug: "club-admin-status",
    title: "동아리 운영 현황",
    department: "동아리연합회",
    updatedAt: "2026-08-24",
    summary: "동아리연합회 운영 지표를 요약해서 확인합니다.",
    actionLabel: "현황 열기",
    serviceHref: "/clubs/admin/",
  },
  "FLAG-05": {
    id: "05",
    slug: "club-security-site",
    title: "동아리 홍보 페이지",
    department: "정보보호동아리",
    updatedAt: "2026-08-24",
    summary: "정보보호동아리 소개와 가입 안내를 확인합니다.",
    actionLabel: "홍보 페이지 열기",
    serviceHref: "/clubs/security/",
  },
  "FLAG-06": {
    id: "06",
    slug: "club-build-archive",
    title: "빌드 자료 보관함",
    department: "전산실",
    updatedAt: "2026-08-24",
    summary: "교내 서비스 배포에 쓰인 빌드 산출물을 보관합니다.",
    actionLabel: "보관함 열기",
    serviceHref: "/clubs/build-archive/",
  },
  "FLAG-07": {
    id: "07",
    slug: "community-board",
    title: "자유게시판",
    department: "학생처",
    updatedAt: "2026-08-24",
    summary: "교내 공지와 자유 글을 게시글 검색으로 조회합니다.",
    actionLabel: "게시판 열기",
    serviceHref: "/community/board/",
  },
  "FLAG-08": {
    id: "08",
    slug: "bonus-prize-desk",
    title: "특별상 수령 안내",
    department: "축제준비위원회",
    updatedAt: "2026-08-24",
    summary: "미니 축제 특별상 수령자 확인 창구입니다.",
    actionLabel: "금고 열기",
    serviceHref: "/bonus/vault/",
  },
};

const FLAG_ID_BY_SERVICE_SLUG = new Map(
  Object.entries(PUBLIC_CHALLENGE_DETAILS).map(([flagId, details]) => [details.slug, flagId as FlagId]),
);

export function publicServiceIdFromSlug(slug: string): string | null {
  const flagId = FLAG_ID_BY_SERVICE_SLUG.get(slug);
  return flagId ? PUBLIC_CHALLENGE_DETAILS[flagId].id : null;
}

export function publicServiceHrefForFlagId(flagId: string): string {
  return PUBLIC_CHALLENGE_DETAILS[flagId as FlagId]?.serviceHref ?? "/";
}

export class ChallengesService {
  constructor(private readonly store: ChallengesStore) {}

  async listForParticipant(userId: string): Promise<{ services: PublicService[] }> {
    void userId;
    const challenges = await this.store.listActiveChallenges();

    return {
      services: challenges.map((challenge) => ({
        id: PUBLIC_CHALLENGE_DETAILS[challenge.flagId].id,
        slug: PUBLIC_CHALLENGE_DETAILS[challenge.flagId].slug,
        title: PUBLIC_CHALLENGE_DETAILS[challenge.flagId].title,
        department: PUBLIC_CHALLENGE_DETAILS[challenge.flagId].department,
        updatedAt: PUBLIC_CHALLENGE_DETAILS[challenge.flagId].updatedAt,
        summary: PUBLIC_CHALLENGE_DETAILS[challenge.flagId].summary,
        actionLabel: PUBLIC_CHALLENGE_DETAILS[challenge.flagId].actionLabel,
        serviceHref: PUBLIC_CHALLENGE_DETAILS[challenge.flagId].serviceHref,
      })),
    };
  }

  async getProgressForParticipant(userId: string): Promise<ChallengeProgress> {
    return this.store.getLatestProgress(userId);
  }
}
