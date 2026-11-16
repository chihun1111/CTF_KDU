/** Participant-facing metadata only. Never put solutions, hints or runtime identifiers here. */
export type ChallengeDifficulty = "입문" | "초급" | "중급" | "고급";
export type ChallengeDifficultyLevel = 1 | 2 | 3 | 4;

export type PublicService = {
  id: string;
  slug: string;
  title: string;
  department: string;
  updatedAt: string;
  summary: string;
  actionLabel: string;
  serviceHref: string;
  difficulty: ChallengeDifficulty;
  difficultyLevel: ChallengeDifficultyLevel;
  category: string;
};

/** Difficulty is the author's prerequisite estimate, not a measured completion rate. */
export const PUBLIC_CHALLENGE_CATALOG = [
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
  {
    id: "03",
    slug: "student-assignments",
    title: "과제 제출 확인",
    department: "교무처",
    updatedAt: "2026-11-16",
    summary: "과제 제출 현황과 상세 내용을 확인합니다.",
    actionLabel: "문제 풀기",
    serviceHref: "/challenges/03/",
    difficulty: "초급",
    difficultyLevel: 2,
    category: "Web",
  },
  {
    id: "04",
    slug: "club-admin-status",
    title: "동아리 운영 현황",
    department: "동아리연합회",
    updatedAt: "2026-11-16",
    summary: "동아리연합회 운영 지표를 요약해서 확인합니다.",
    actionLabel: "문제 풀기",
    serviceHref: "/challenges/04/",
    difficulty: "초급",
    difficultyLevel: 2,
    category: "Web",
  },
  {
    id: "05",
    slug: "club-security-site",
    title: "동아리 홍보 페이지",
    department: "정보보호동아리",
    updatedAt: "2026-11-16",
    summary: "정보보호동아리 소개와 가입 안내를 확인합니다.",
    actionLabel: "문제 풀기",
    serviceHref: "/challenges/05/",
    difficulty: "입문",
    difficultyLevel: 1,
    category: "Frontend",
  },
  {
    id: "06",
    slug: "club-build-archive",
    title: "빌드 자료 보관함",
    department: "전산실",
    updatedAt: "2026-11-16",
    summary: "이 보관함의 공개 빌드 자료를 직접 살펴봅니다.",
    actionLabel: "문제 풀기",
    serviceHref: "/challenges/06/",
    difficulty: "초급",
    difficultyLevel: 2,
    category: "Frontend",
  },
  {
    id: "07",
    slug: "community-board",
    title: "자유게시판",
    department: "학생처",
    updatedAt: "2026-11-16",
    summary: "교내 공지와 자유 글을 게시글 검색으로 조회합니다.",
    actionLabel: "문제 풀기",
    serviceHref: "/challenges/07/",
    difficulty: "중급",
    difficultyLevel: 3,
    category: "Web / DB",
  },
  {
    id: "08",
    slug: "bonus-prize-desk",
    title: "특별상 수령 안내",
    department: "축제준비위원회",
    updatedAt: "2026-11-16",
    summary: "미니 축제 특별상 수령자 확인 창구입니다.",
    actionLabel: "문제 풀기",
    serviceHref: "/challenges/08/",
    difficulty: "고급",
    difficultyLevel: 4,
    category: "Web / Crypto",
  },
] as const satisfies readonly PublicService[];
