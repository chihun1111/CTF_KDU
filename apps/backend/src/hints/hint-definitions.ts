export type HintStageKey = "first" | "second" | "extra";

export type HintStageDefinition = {
  stageId: string;
  key: HintStageKey;
  label: string;
  releaseTiming: string;
  text: string;
};

export type HintChallengeDefinition = {
  number: string;
  title: string;
  stages: HintStageDefinition[];
};

export const HINT_CHALLENGES: readonly HintChallengeDefinition[] = [
  {
    number: "01",
    title: "캠퍼스 축제 안내",
    stages: [
      {
        stageId: "01:first",
        key: "first",
        label: "1차 힌트",
        releaseTiming: "시작 +60분",
        text: "화면에 렌더링되지 않아도 브라우저가 받은 문서에는 남아 있을 수 있습니다.",
      },
      {
        stageId: "01:second",
        key: "second",
        label: "2차 힌트",
        releaseTiming: "시작 +120분",
        text: "페이지 소스 보기나 개발자 도구의 Elements 탭에서 주석을 찾아보세요.",
      },
      {
        stageId: "01:extra",
        key: "extra",
        label: "추가 운영 힌트",
        releaseTiming: "종료 -60분",
        text: "개발자가 삭제하지 않은 TODO 메모와 임시 보관 문구를 주목하세요.",
      },
    ],
  },
  {
    number: "02",
    title: "서비스 상태",
    stages: [
      {
        stageId: "02:first",
        key: "first",
        label: "1차 힌트",
        releaseTiming: "시작 +60분",
        text: "서버가 탐색 로봇에게 알려주는 규칙 파일이 있습니다. 화면 밖의 단서를 확인하세요.",
      },
      {
        stageId: "02:second",
        key: "second",
        label: "2차 힌트",
        releaseTiming: "시작 +120분",
        text: "robots.txt가 숨기려는 경로는 개발 중에 만든 기능일 수 있습니다. 직접 요청해보세요.",
      },
      {
        stageId: "02:extra",
        key: "extra",
        label: "추가 운영 힌트",
        releaseTiming: "종료 -60분",
        text: "정상 상태 API와 비슷한 주소를 가진 디버그용 경로를 비교해보세요.",
      },
    ],
  },
  {
    number: "03",
    title: "과제 제출 확인",
    stages: [
      {
        stageId: "03:first",
        key: "first",
        label: "1차 힌트",
        releaseTiming: "시작 +120분",
        text: "주소에 있는 항목 번호(id)가 어떤 의미인지 확인해보세요.",
      },
      {
        stageId: "03:second",
        key: "second",
        label: "2차 힌트",
        releaseTiming: "시작 +180분",
        text: "목록에는 보이지 않는 번호도 상세 조회가 될 수 있습니다. 소유자 확인이 빠져 있는지 살펴보세요.",
      },
      {
        stageId: "03:extra",
        key: "extra",
        label: "추가 운영 힌트",
        releaseTiming: "종료 -60분",
        text: "번호를 하나씩 바꿔 요청하면 다른 사람의 항목까지 열리는 경우가 있습니다.",
      },
    ],
  },
  {
    number: "04",
    title: "동아리 운영 현황",
    stages: [
      {
        stageId: "04:first",
        key: "first",
        label: "1차 힌트",
        releaseTiming: "시작 +120분",
        text: "관리자 패널 표시 여부를 서버가 아니라 브라우저가 정하고 있습니다.",
      },
      {
        stageId: "04:second",
        key: "second",
        label: "2차 힌트",
        releaseTiming: "시작 +180분",
        text: "브라우저에 저장된 값을 확인하는 방법을 찾아보고, 판정에 쓰이는 키 값을 바꿔보세요.",
      },
      {
        stageId: "04:extra",
        key: "extra",
        label: "추가 운영 힌트",
        releaseTiming: "종료 -60분",
        text: "localStorage의 isAdmin 값을 true로 바꾼 뒤 페이지를 다시 불러오면 무엇이 달라지는지 확인하세요.",
      },
    ],
  },
  {
    number: "05",
    title: "동아리 홍보 페이지",
    stages: [
      {
        stageId: "05:first",
        key: "first",
        label: "1차 힌트",
        releaseTiming: "시작 +120분",
        text: "배포된 프런트엔드 자산에는 개발 과정의 흔적이 함께 남습니다.",
      },
      {
        stageId: "05:second",
        key: "second",
        label: "2차 힌트",
        releaseTiming: "시작 +180분",
        text: "페이지가 불러오는 자바스크립트 파일의 끝부분을 직접 확인해보세요.",
      },
      {
        stageId: "05:extra",
        key: "extra",
        label: "추가 운영 힌트",
        releaseTiming: "종료 -60분",
        text: "빌드 메모 주석은 롤백용으로 남겨진 값까지 담고 있을 수 있습니다.",
      },
    ],
  },
  {
    number: "06",
    title: "빌드 자료 보관함",
    stages: [
      {
        stageId: "06:first",
        key: "first",
        label: "1차 힌트",
        releaseTiming: "시작 +120분",
        text: "홍보 페이지의 자바스크립트 마지막 줄은 어디를 가리키고 있나요?",
      },
      {
        stageId: "06:second",
        key: "second",
        label: "2차 힌트",
        releaseTiming: "시작 +180분",
        text: "source map은 원본 소스를 그대로 담고 있습니다. sourcesContent를 확인해보세요.",
      },
      {
        stageId: "06:extra",
        key: "extra",
        label: "추가 운영 힌트",
        releaseTiming: "종료 -60분",
        text: "빌드 산출물 보관함의 소스 맵 파일을 내려받아 ARCHIVE_ENTRY 값을 찾으세요.",
      },
    ],
  },
  {
    number: "07",
    title: "자유게시판 검색",
    stages: [
      {
        stageId: "07:first",
        key: "first",
        label: "1차 힌트",
        releaseTiming: "시작 +180분",
        text: "검색어가 서버에서 어떻게 조건 문자열로 조합되는지 생각해보세요.",
      },
      {
        stageId: "07:second",
        key: "second",
        label: "2차 힌트",
        releaseTiming: "시작 +240분",
        text: "작은따옴표로 조건을 닫고 UNION SELECT로 출력 행을 늘릴 수 있는지 확인해보세요.",
      },
      {
        stageId: "07:extra",
        key: "extra",
        label: "추가 운영 힌트",
        releaseTiming: "종료 -60분",
        text: "게시글 테이블 말고 플래그를 담은 별도 테이블을 직접 지목해서 조회해보세요.",
      },
    ],
  },
  {
    number: "08",
    title: "특별상 수령 안내",
    stages: [
      {
        stageId: "08:first",
        key: "first",
        label: "1차 힌트",
        releaseTiming: "시작 +180분",
        text: "발급받은 티켓 값과 서명 구조를 먼저 관찰하세요. 서명이 메시지 앞의 키에 의존하는지 보세요.",
      },
      {
        stageId: "08:second",
        key: "second",
        label: "2차 힌트",
        releaseTiming: "시작 +240분",
        text: "SHA-256은 길이 확장 공격에 취약합니다. 기존 다이제스트를 초기 상태로 이어 붙일 수 있습니다.",
      },
      {
        stageId: "08:extra",
        key: "extra",
        label: "추가 운영 힌트",
        releaseTiming: "종료 -60분",
        text: "payload 뒤에 glue padding을 붙인 뒤 role=winner를 추가하고 다이제스트를 이어 계산해보세요.",
      },
    ],
  },
] as const;

export const HINT_STAGE_BY_ID = new Map(
  HINT_CHALLENGES.flatMap((challenge) => challenge.stages.map((stage) => [stage.stageId, { challenge, stage }] as const)),
);
