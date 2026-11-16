# 운영 및 검증 가이드

공개 저장소만으로 설치·빌드·테스트할 수 있습니다. 출제자 풀이와 실제 운영 비밀값은
이 문서에 포함하지 않습니다. 모든 명령은 저장소 루트에서 실행합니다.

## 1. 개발 환경

- Node.js 24, 저장소 `packageManager`에 고정한 pnpm 10.32.1
- SQLite CLI (`sqlite3`): 07번 서비스의 실제 격리 테스트에 필요합니다.
- 전체 서비스 리허설: Docker Engine 및 Docker Compose v2

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm build
corepack pnpm typecheck
corepack pnpm verify:sensitive
corepack pnpm audit
```

Ubuntu에서는 `sudo apt-get install sqlite3`로 테스트 의존성을 준비합니다. `pnpm test`는
공통 패키지를 먼저 빌드한 뒤 검증 스크립트·백엔드·프런트엔드·8개 서비스 테스트를
실행합니다. 내부 `Docs/`는 필요하지 않습니다. 패키지 테스트가 실패하면 전체 명령도
실패합니다. 개별 smoke 스크립트는 공통 패키지 빌드 후 실행합니다.

## 2. 신규 리허설 환경 만들기

기존 대회 환경에는 새 secret을 덮어쓰지 마세요. 아래는 비어 있는 환경의 최초 설정입니다.

```bash
cp .env.example .env.production
corepack pnpm secrets:generate
corepack pnpm verify:secrets
docker compose -f infra/docker/docker-compose.yml --env-file .env.production config --quiet
docker compose -f infra/docker/docker-compose.yml --env-file .env.production build
docker compose -f infra/docker/docker-compose.yml --env-file .env.production up -d --wait postgres redis
docker compose -f infra/docker/docker-compose.yml --env-file .env.production \
  run --rm backend node apps/backend/dist/database/migrate.js
docker compose -f infra/docker/docker-compose.yml --env-file .env.production \
  run --rm backend node apps/backend/dist/database/seed.js
docker compose -f infra/docker/docker-compose.yml --env-file .env.production up -d --wait
```

`.env.example`의 기본 접속 주소는 `http://localhost:8080`입니다. Compose의
`RUNTIME_SECRETS_DIR`와 `NGINX_CONFIG_FILE`은 **Compose 파일이 있는 `infra/docker/`
기준 상대 경로**입니다. 스크립트의 `--dir`·`--runtime-secrets-dir`은 현재 작업
디렉터리 기준입니다. 경로가 다른 서버에서는 절대 경로로 지정하면 혼동을 줄일 수 있습니다.
`PUBLIC_BASE_URL`은 브라우저가 사용하는 정확한 origin(스킴·호스트·포트)이어야 하며,
frontend와 backend 모두 같은 값으로 실행합니다.

### Secret 파일 권한과 실행 사용자

생성기는 디렉터리 0700, 파일 0600 권한을 사용하고 기존 파일을 보존합니다. Linux
Compose의 파일 기반 secret은 호스트 파일 권한을 그대로 적용할 수 있습니다.
07번 서비스는 `node` 사용자(UID 1000)로 실행하므로
`internal_service_token_07`은 그 UID가 읽을 수 있어야 합니다. UID 1000 계정에서
생성하는 것이 기본 운영 조건입니다. 다른 UID로 생성했다면 운영자가 **해당 파일만**
UID 1000 소유로 조정하고 secret 검증은 파일을 읽을 권한이 있는 계정으로 실행하세요.
파일을 0644로 공개해서 해결하지 마세요. 07번의 재생성 가능한 SQLite 상태는 UID/GID
1000, 권한 0700, 64MiB tmpfs에만 기록합니다. 루트 파일시스템은 읽기 전용이며 검색
요청이 끝나면 임시 디렉터리를 삭제합니다. 이전 버전의 `challenge_07_state` 볼륨은
더 이상 연결하지 않으며 자동으로 삭제하지 않습니다. 보존 정책을 확인한 뒤 해당
볼륨만 별도로 정리하세요.

frontend는 비특권 사용자로 실행합니다. backend와 01~06·08 서비스는 기존 0600 secret
호환성을 위해 root 실행을 유지하되 `no-new-privileges`와 capability 제한을 적용합니다.
`DAC_OVERRIDE`는 소유자가 다른 secret을 읽는 데 필요하므로 유지합니다. 전부 비특권
사용자로 전환하려면 secret·볼륨의 UID/ACL 운영 방식을 먼저 통일해야 합니다.

### HTTPS

세션·클리어 쿠키는 `Secure`입니다. 실제 참가자가 접속하는 외부 도메인은 반드시 HTTPS를
사용해야 합니다. 기본 Nginx 설정은 HTTP 진입점이므로 실제 운영에서는 TLS를 제공하는
외부 리버스 프록시 또는 검증한 TLS Nginx 설정이 필요합니다. 외부 프록시 뒤에서 실행할
경우 backend의 신뢰 프록시 설정과 Nginx의 IP 처리까지 함께 검토하세요. 현재 Nginx는
클라이언트가 보낸 `X-Forwarded-For`를 버리고 직접 연결한 주소를 사용합니다. 이 경우
외부 프록시 하나를 모든 참가자의 IP로 인식하면 속도 제한이 공유될 수 있습니다.
TLS 프록시가 사용할 내부 HTTP 포트는 외부 참가자에게 직접 공개하지 않습니다.

## 3. 배포 후 확인

```bash
corepack pnpm preflight:deploy --env-file .env.production
corepack pnpm smoke:runtime --base-url http://localhost:8080
corepack pnpm smoke:challenges --base-url http://localhost:8080
corepack pnpm smoke:admin --base-url http://localhost:8080
corepack pnpm smoke:clear --base-url http://localhost:8080
```

운영 서버에서는 위 URL을 실제 HTTPS origin으로 바꿉니다. Smoke는 테스트 계정을
생성하고, 관리자 smoke는 테스트 계정 하나를 운영자로 승격하며 힌트를 공개합니다.
따라서 **실제 대회 시작 전 별도 리허설 DB**에서 실행하세요. 관리자·클리어 smoke는 Compose 컨테이너의 `POSTGRES_USER`와
`POSTGRES_DB` 설정을 사용합니다. 생성된 테스트 계정과 공개된 힌트를
자동으로 삭제하지 않습니다.

`preflight:deploy`는 환경 파일, 공개 origin, secret 경로·강도·권한, 소스/빌드의 민감
자료 검사, Compose 격리 정책, 실행 상태를 확인합니다. `--skip-docker`,
`--skip-image-pulls`, `--skip-secrets`는 명시적으로 해당 검증을 생략하는 옵션이며,
생략된 항목까지 검증 완료를 의미하지 않습니다. 이미지가 이미 준비되어 있을 때는
`--skip-image-pulls`를 사용할 수 있습니다. 신규 이미지 다운로드에는
`--image-timeout-ms 120000`처럼 충분한 시간을 지정하세요.

운영자 목록은 페이지당 50건으로 조회하며, 최신 점수·제출 수·풀이 인원 집계에는 전역
1,000/5,000건 절단을 적용하지 않습니다. 참가자 운영 통계에서 관리자 연습 데이터는
제외합니다. 서비스 상태는 실제 `/health` 요청 결과를
사용하며 응답 제한과 짧은 캐시를 적용합니다. 브라우저 관리자 힌트 공개 요청은 동일
origin만 허용됩니다. 로그인, 제출, 인증 소비 응답은 캐시하면 안 됩니다.

Redis는 접속 현황 캐시입니다. 미설정·장애 시 온라인 수는 DB의 최근 세션 활동으로
대체하고, Redis 연결이 복구되면 자동으로 다시 사용합니다. 장애 중에도 DB 인증과
heartbeat가 동작하며 과거 heartbeat를 재전송할 대기열을 쌓지 않습니다. Redis 명령은
1초, 연결 후 초기 handshake는 3초로 제한합니다. 공개 `/api/health`는 `SELECT 1`과
`PING`을 사용하며 검사당 1.5초 제한, 동시 요청 병합과 1초 캐시를 적용합니다.

애플리케이션 PostgreSQL 풀은 최대 10개, 연결 획득 2초, SQL 실행 5초, 클라이언트
응답 7초, 트랜잭션 유휴 10초 제한을 사용합니다. 관리용 migration은 별도의 연결에서
실행하며 잠금 대기 10초, 문장 실행 120초, 응답 대기 130초 제한을 사용합니다. 대규모 인덱스 생성은
유지보수 시간에 리허설 데이터를 기준으로 소요 시간을 확인합니다.

### 장애 및 migration 회귀 검증

Runtime integration CI는 일반 사용자 흐름 외에 실제 PostgreSQL에서 migration 재실행,
실패 시 롤백, 동시 실행, 적용 파일 변경 거부를 확인합니다. 또한 Redis를 중지한 채
backend를 재시작하고 세션·로그인·heartbeat를 확인한 뒤 Redis 복구를 검증합니다.
두 장애 검사 스크립트는 `CI=true`와 일회성 `ctf-ci-*` 프로젝트에서만 실행되며,
운영 스택에서 실행할 명령으로 제공하지 않습니다.

## 4. 백업·복원·롤백

배포 전 데이터베이스와 secret을 각각 접근이 제한된 저장소에 백업합니다. 데이터만
복원하고 암호화 키를 잃으면 학번과 플래그를 복호화할 수 없습니다. 백업 파일에는
실제 개인정보가 포함되므로 Git 또는 CI 로그에 올리지 않습니다.

```bash
umask 077
mkdir -p backups
docker compose -f infra/docker/docker-compose.yml --env-file .env.production \
  exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > backups/campus-ctf.dump
```

별도 리허설 환경에 `pg_restore`로 복원한 뒤 migration/seed·로그인·최종 제출을
확인합니다. 복원은 대상 DB를 덮어쓸 수 있으므로 운영 DB에 직접 시험하지 않습니다.
롤백할 때는 이전 커밋과 그 버전의 이미지·환경 설정으로 되돌리고 DB 호환성을 확인합니다.
후속 보강은 기존 테이블의 데이터를 변경하지 않는 조회 인덱스 3개와 migration 이력
테이블을 추가합니다. `down -v`는 PostgreSQL, Redis와 관련 볼륨을
삭제하므로 정상 배포나 롤백에 사용하지 않습니다.

### Migration 이력

`db:migrate`는 `packages/db/drizzle/`의 `0000_*.sql`, `0001_*.sql`처럼 연속된 파일을
순서대로 적용합니다. 이력이 없는 기존 설치는 원래의 멱등 초기 스키마를 확인·적용한
뒤 신규 인덱스를 추가합니다. 이미 적용한 파일의 SHA-256과 이름은
`ctf_schema_migrations`에 기록하며, 파일 변경·누락 또는 버전 간격을 발견하면 중단합니다.
CRLF/LF 체크아웃 차이는 정규화합니다. 적용한 파일을 편집하지 말고 새 번호를 추가하세요.

`corepack pnpm --filter @campus-ctf/db generate`는 검토용 SQL을 `drizzle-drafts/`에
생성합니다. 이 폴더는 Git과 migration 실행 대상에서 제외합니다. 기존 초기 스키마는
Drizzle의 snapshot 이력 없이 작성되었으므로 생성된 초안 전체를 운영 DB에 바로 적용하지
마세요. 필요한 차이만 검토해 다음 번호의 `drizzle/NNNN_description.sql`로 작성하고
기존 DB 복제본에서 검증합니다.

동일 연결의 트랜잭션과 advisory lock 안에서 적용하므로 여러 runner가 동시에 실행되어도
중복 적용하지 않습니다. SQL 실패 시 같은 실행에서의 신규 변경과 이력 기록을 함께
롤백합니다. 변경 이력이 더 최신인 DB에 오래된 runner를 실행하면 누락된 migration을
감지해 중단하므로, 애플리케이션 롤백과 DB 복원을 별도로 계획해야 합니다.

## 5. Secret 교체

`secrets:generate --force`는 모든 값을 교체합니다. 기존 데이터가 있는 환경의 일반적인
교체 명령으로 사용하지 않습니다. 현재 코드는 자동 복호화 키 이전 도구를 제공하지
않으므로 종류별 영향을 확인하고 유지보수 시간에 작업해야 합니다.

| 항목 | 교체 영향과 절차 |
| --- | --- |
| `SESSION_SECRET` | 기존 세션과 관련 HMAC 참조가 달라집니다. 참가자 재로그인과 운영 참조 변화에 대비합니다. |
| `CLEAR_VIEW_TOKEN_SECRET` | 미소비 클리어 인증 토큰이 무효화됩니다. 인증 확인이 진행 중일 때 교체하지 않습니다. |
| `CLAIM_TOKEN_SECRET` | 발행된 claim 토큰이 무효화됩니다. 서비스 상태와 함께 확인합니다. |
| `INTERNAL_SERVICE_TOKEN_01`~`08` | backend와 해당 문제 서비스의 값을 함께 바꾸고 재시작합니다. 서로 다른 토큰을 사용합니다. |
| `FLAG_ENCRYPTION_KEY`, `STUDENT_ID_ENCRYPTION_KEY` | 기존 암호문에 대한 재암호화 없이 교체하면 복호화가 실패합니다. 기존 키를 보존하고 별도 데이터 이전 절차를 준비합니다. |
| `FLAG_HASH_PEPPER`, `STUDENT_ID_HASH_PEPPER` | 기존 조회·정답 검증 해시와 불일치합니다. 관련 해시를 원문 복호화 후 다시 계산하는 이전이 필요합니다. |
| `postgres_password` | 파일 교체만으로 이미 초기화된 DB 비밀번호는 바뀌지 않습니다. DB 역할 비밀번호와 mounted secret을 함께 갱신합니다. |

운영 모드에서는 짧거나 재사용한 앱 secret, 잘못된 AES 키 표현을 시작 시 거부합니다.
새 비밀번호는 전체 UTF-8 입력을 구분하는 버전 표시 SHA-256+bcrypt(cost 12) 형식으로
저장합니다. 기존 bcrypt 비밀번호도 로그인 가능하며, 기존 긴 비밀번호의 72바이트
절단 한계는 비밀번호를 교체하기 전까지 남습니다. 기존 사용자 암호를 임의로 다시
해시하지 않습니다. 현재 별도 비밀번호 재설정 UI는 없습니다.

## 6. 현재 운영 경계

- 단일 backend·문제 서비스 인스턴스를 기준으로 합니다. 인증 속도 제한 및 08번 grant는
  프로세스 메모리에 있으므로 여러 복제본으로 확장하려면 공유 저장소 또는 세션 고정이
  필요합니다. 재시작하면 메모리 상태가 초기화됩니다.
- 07번 SQLite는 요청별 임시 DB·정렬 파일을 종료/실패/클라이언트 연결 종료 시 정리합니다.
  프로세스당 SQLite heap 8MiB, 전체 상태 tmpfs 64MiB, 최대 8개 동시 실행을 사용합니다.
  기존 버전이 만든 영구 볼륨과 개인정보·감사 로그의 보존 기간은 별도 운영 정책입니다.
- SQL 실행 시간·출력·동시성에 제한이 있으며, 마지막 메모리 경계는 서비스 컨테이너
  제한입니다. 예상 동시 참가자 수로 부하 리허설을 수행해야 합니다.
- 공개 Git 저장소에는 교육용 취약점 구현과 smoke 도우미가 들어 있습니다. 대회 중
  소스 비공개가 필요한 출제 방식이라면 별도 배포·배포물 공개 정책을 마련해야 합니다.
- 참가 자격 확인, 운영자 최초 지정, 개인정보 보존·파기 기간, 실제 대회 일정·TLS 인증서,
  백업 보관 위치는 운영자가 결정해야 합니다. 임의의 학교 정책을 기본값으로 만들지 않습니다.

점검 결과와 검증 범위는 [1차 보강 보고서](review-2026-11-16.md)와
[후속 보강 보고서](review-followup-2026-11-16.md)를 참고하세요.
