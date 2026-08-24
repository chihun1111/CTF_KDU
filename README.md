# KDU 교내 CTF

컴퓨터공학과와 보안 학과 참가자를 위한 개인전 CTF 서비스입니다. 참가자는 로그인한
사용자에게 각각 발급된 8개 플래그를 수집하고, 최종 제출을 통과하면 1회용 클리어
인증 화면을 확인합니다.

> [!WARNING]
> 이 저장소에는 의도적으로 취약한 challenge service가 포함됩니다. 취약점은 문제별
> 격리 환경 안에만 있어야 하며 인증, session, PostgreSQL, Redis, 내부 API 및 운영자
> 화면으로 확장하면 안 됩니다. 실제 secret, 학번, 플래그와 token 원문은 Git에 넣지
> 마세요.

## 프로젝트 구성

```text
apps/
├── backend/              # NestJS API, 인증, 제출, 운영 기능
└── frontend/             # Next.js 참가자·운영자 화면
packages/
├── config/               # 환경 설정과 secret loader
├── db/                   # Drizzle schema, migration, seed
└── shared/               # 공용 schema와 타입
challenge-services/
└── challenge-01..08/     # 문제별 격리 서비스
infra/
├── docker/               # Docker Compose
└── nginx/                # 단일 외부 진입점
scripts/                    # 정적 검증, preflight, runtime smoke
Docs/                       # 로컬 전용 기획·구현·운영 문서
```

`Docs/`는 작업용 문서와 디자인 참고 자료를 한곳에 모은 로컬 전용 폴더이며 Git에서
제외됩니다. 로컬 문서의 시작점은 `Docs/README.md`입니다. 다른 환경으로 옮겨야 할
경우 Git과 별도로 백업해야 합니다.

## 요구 환경

- Node.js 24 이상
- pnpm 10 이상
- Docker Engine 및 Docker Compose plugin
- Challenge 07 로컬 테스트용 `sqlite3` CLI

정확한 Node.js 및 pnpm 범위는 `package.json`의 `engines`와 `packageManager`를
확인합니다.

## 개발 검증

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

주요 개별 검증 명령은 다음과 같습니다.

```bash
pnpm verify:workspace
pnpm verify:docs
pnpm verify:ui
pnpm verify:sensitive
pnpm verify:compose
```

검증이 실패하면 성공한 것으로 보고하지 말고, 실패한 단계와 원인을 먼저 확인합니다.

## Docker 실행

`.env.production`과 `secrets/runtime-only/`의 필수 secret이 준비된 환경에서 실행합니다.

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env.production build
docker compose -f infra/docker/docker-compose.yml --env-file .env.production up -d
docker compose -f infra/docker/docker-compose.yml --env-file .env.production ps
```

최초 환경에서는 backend migration과 seed가 먼저 필요합니다. 자세한 순서와 운영
체크리스트는 로컬 문서 `Docs/development/operations/03-docker-ubuntu-sandbox.md`를
확인합니다. 데이터 초기화가 필요한 것이 아니라면 `down --volumes`를 실행하지 마세요.

## 외부 서비스 구조

- 외부 공개 포트는 Nginx만 사용합니다.
- Frontend, Backend, PostgreSQL, Redis와 challenge service는 내부 network에서만
  통신합니다.
- `/internal/*`은 브라우저에서 직접 접근할 수 없어야 합니다.
- 참가자 화면은 한국어를 기본으로 하며 개별 서비스 화면은 일반 교내 서비스처럼
  보이도록 구성합니다.

## 보안 불변 조건

- 현재 사용자는 `ctf_session`의 서버측 session 조회 결과로만 결정합니다.
- URL, query string, form field 또는 클라이언트 신뢰 헤더로 사용자를 선택하지 않습니다.
- challenge service에는 운영 DB credential과 `FLAG_*` secret을 제공하지 않습니다.
- 학번, 플래그, 제출값, session·clear·claim token 원문을 로그에 남기지 않습니다.
- 참가자 공개 화면에 내부 API, secret 이름, 출제자 메모와 의도된 풀이를 노출하지
  않습니다.
- 사용자 간 플래그, ticket, grant와 Challenge 07 SQLite instance가 섞이면 안 됩니다.

## 문서와 작업 규칙

- 루트 `AGENTS.md`는 자동화 도구와 작업자가 따라야 하는 운영 지침이므로 이동하지
  않습니다.
- 현재 기준 문서, 과거 초안과 Stitch 결과물의 구분은 `Docs/README.md`를 따릅니다.
- API, DB, 공개 문구, 문제 풀이 흐름 또는 보안 정책을 바꾸면 관련 구현과 검증도 함께
  갱신합니다.
- 실제 credential이 포함될 수 있는 `secrets/runtime-only/`는 일반 문서 폴더로 옮기거나
  공개하지 않습니다.
