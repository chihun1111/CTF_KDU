# 프로젝트 후속 보강 검토 — 2026-11-16

기준은 1차 보강 완료 커밋 `e984e55`입니다. 동일한
`improve/project-hardening-2026-11-16` 브랜치에서 추가 검토와 수정을 수행했습니다.
이번에는 이전 수정자가 다른 영역을 교차 검토하고, 장애·동시 요청·데이터 증가·입력
경계에서 실제로 실패하는 경우를 재현했습니다. 의도된 CTF SQL injection과 길이 확장
풀이 경로는 유지합니다.

## 확인한 문제와 수정

| 영역 | 확인한 문제 | 수정 및 회귀 근거 |
| --- | --- | --- |
| 운영 통계 | 전역 1,000/5,000건 제한 때문에 활동이 많은 계정이 다른 참가자의 최신 점수·제출 수·접속·풀이 인원을 가림 | 5,101건의 실제 데이터로 실패 재현 후 페이지 대상 SQL 집계 및 distinct 인원 계산으로 변경 |
| 최근 접속 | 최신순 세션을 Map에 덮어쓰면서 오래된 시각 선택 | 유효하고 취소되지 않은 세션의 max(last_seen_at), 정확한 만료 경계 적용 |
| 운영 데이터 구분 | 가입 인원은 참가자 기준인데 제출·클리어에는 관리자 연습 데이터가 혼입 | 요약과 목록의 집계 대상을 참가자로 일치 |
| 제출 조회 비용 | 한 페이지를 보면서 모든 제출 결과 행을 로드 | 해당 페이지의 제출 ID로 제한, 조회 인덱스 3개 추가 |
| API Origin 검사 | Express는 대소문자 무관 경로를 허용하지만 guard는 `/api/`만 보호 | 실제 HTTP 요청에서 `/API/` 변경 요청 우회를 재현하고 경로 판정 일치 |
| 내부 claim | 비활성·미등록 challenge에 저장하지 않은 토큰을 성공 응답 | 조회 실패 시 404, 토큰 발급 중단 |
| 입력 검증 | 플래그 220/200자 차이, 비밀번호 UTF-16/Unicode 문자수 차이 | 프런트와 서버의 허용 범위 일치, 경계·한글·이모지 회귀 검사 |
| 가입·로그인 | 쿠키가 저장되지 않아도 성공 이동, 잘못된 세션 응답 허용 | 양쪽 흐름에서 세션 확인 후 역할별 이동, 쿠키·장애 안내 |
| 결과·접근성 | 미제출을 오답으로 표시, 색상에만 의존, 감사 팝업 focus/Escape 누락 | 미제출 상태와 텍스트 배지, native dialog와 hash·닫기 focus 처리, 미정의 색상 변수 수정 |
| 클리어 응답 | 200이지만 구조·날짜가 잘못된 응답이 렌더링 500을 유발 | no-store 복구 안내, 제출 화면 링크, 소비 요청 자동 재시도 없음 |
| 세션 식별 | 동일 쿠키의 `%` 인코딩 표현을 별도 SQLite 파일·grant 세션으로 인식 | backend와 같은 1회 디코딩·형식·중복 검증으로 정규화 |
| SQLite 수명 | 읽기 전용 퍼즐 DB가 요청 종료 후 영구 누적 | 요청별 독립 DB·finally 정리, 첫 화면은 DB 미생성, 64MiB tmpfs |
| SQLite 자원 | 작은 출력으로도 큰 blob·정렬 메모리를 사용, 스필 파일의 외부 기록 가능 | 프로세스 heap 8MiB, 요청 디렉터리 SQLITE_TMPDIR, 읽기 전용 root, 동시8·실행2초·출력256KiB 제한 |
| 요청 취소 | 브라우저 연결 종료 후에도 내부 fetch·SQLite 실행 지속 | 8개 서비스의 취소 전파, 07 SQLite 종료를 기다린 후 파일 정리 |
| 금고 grant 경합 | 같은 세션의 두 번째 check가 먼저 전달한 수령 링크를 무효화 | 유효한 미사용 grant 재사용, 기존 만료·세션당1개·1회 사용 유지 |
| 금고 미리 읽기 | prefetch·임베디드 요청이 수령 권한을 먼저 소비 | 소비 전에 요청 목적·Fetch Metadata 검사, 정상 풀이 fetch 허용 |
| Redis 장애 | 시작 대기, offline 명령 누적, 연결은 됐지만 응답이 없는 경우 복구 정지 | 선택적 background 연결, 대기열 상한·offline 거부, 명령1초·handshake3초 제한과 소켓 교체 |
| 온라인 수·health | KEYS 전체 검색과 사용자 COUNT, 캐시 장애 heartbeat500, 미설정 Redis를 정상으로 표시 | SCAN·PING·SELECT1, DB 활동 fallback, 동시 검사 병합·deadline·캐시, 만료 memory 항목 삭제·상한 |
| PostgreSQL 연결 | 무제한 대기, 실제 Drizzle의 BEGIN 실패가 획득 연결을 반환하지 않음 | 연결·SQL·응답·유휴 제한, 연결 소유 transaction 어댑터와 실패 시 폐기 |
| migration | 최초 스키마만 재실행하며 적용 이력·변경 검출·동시 실행 보호가 없음 | 순차 버전·SHA-256 이력, 전용 연결·트랜잭션 advisory lock, 실패 rollback과 적용 파일 변경 거부 |
| 빌드 민감 자료 검사 | 최적화기가 화면의 공개 예시 문자열을 합치면 실제 플래그 유출로 오탐 | 정확히 점 세 개인 공개 예시만 허용, 인접한 플래그·긴 payload는 계속 거절하는 회귀 검사 |

## 검증 방법과 범위

로컬 전체 `pnpm test`는 **357/357 통과**, 실패·skip 0입니다. 1차 306개에서
회귀 검사를 51개 추가했습니다.

| 검사 묶음 | 통과 |
| --- | --- |
| 공개 저장소·검증 스크립트 | 64 |
| backend | 176 |
| frontend | 26 |
| 8개 문제 서비스 | 85 |
| config / shared | 4 / 2 |

전체 production build와 TypeScript 검사는 통과했습니다. 마지막 Unicode 수정 후
프런트엔드 production build도 재확인했고 민감 자료 검사 334개 파일이 통과했습니다.
운영·개발 의존성 audit는 모두 0건입니다. Drizzle 초안 생성도 12개 테이블과 신규
인덱스를 생성하는 것을 확인했으며 실제 DB에 적용하지 않았습니다.

단위 mock만으로 확인하지 않고 다음 실제 실행 경계를 포함했습니다.

- Nest/Express HTTP 서버에서 Origin 검사의 대소문자 우회 재현.
- PostgreSQL Drizzle가 생성한 운영 집계 SELECT를 5,101건의 데이터와 함께 실행해
  전역 절단·잘못된 최신 세션·관리자 혼입·페이지 밖 결과 로드를 확인.
- 실제 설치 Drizzle의 transaction을 실행하여 BEGIN 실패, nested savepoint,
  checked-out 연결 오류와 반환·폐기 확인.
- 실제 TCP 서버에서 Redis 초기 handshake 정지 및 명령 응답 정지를 주입하고,
  자동 재연결·명령 deadline·대기열 용량 검증.
- 실제 SQLite CLI에서 8개 동시 요청, 초과 요청의 복구, 초기화/쿼리 실패, 취소,
  내부 heap 제한, 요청 디렉터리의 정렬 스필 생성 및 정리 검증.
- 기존 서버를 별도 경로에서 실행해 쿠키 표현별 잔여 DB와 금고 grant 경합을 재현.
- SQL UNION 풀이와 실제 SHA-256 길이 확장 풀이, 참가자별 격리 회귀 유지.

Runtime integration에는 기존 네 가지 사용자 흐름 외에 다음 두 검사를 추가했습니다.

1. 실제 PostgreSQL의 격리된 schema에서 migration 재실행, 실패 시 데이터·이력 rollback,
   동시 runner 1회 적용, 이미 적용한 파일 변경 거부. 검사 schema는 종료 시 제거합니다.
2. Redis와 backend를 중지하고 Redis 없이 Compose로 backend 시작, 기존 세션·heartbeat·
   로그인 검증, Redis 재시작 후 backend 추가 재시작 없이 복구 확인.

장애 주입 도구는 일회성 CI 프로젝트에만 실행하도록 보호했습니다. 성공 여부는
[보강 브랜치 Actions](https://github.com/chihun1111/CTF_KDU/actions?query=branch%3Aimprove%2Fproject-hardening-2026-11-16)의
해당 커밋 결과로 확인합니다. 실제 운영 데이터나 서버에 장애를 주입하지 않았습니다.

## 배포 시 확인할 변경

- `db:migrate`를 먼저 실행하여 `ctf_schema_migrations`와 3개 조회 인덱스를 적용합니다.
  기존 migration 파일은 변경하지 않았으며 사용자·플래그·제출 데이터 변환도 없습니다.
  적용된 파일을 수정하거나 삭제하면 이후 migration이 거부됩니다. 새 파일로 변경을
  추가하고, 오래된 runner를 최신 DB에 실행하지 않습니다.
  Drizzle 생성 결과는 별도 `drizzle-drafts/`에서 검토하여 적용 이력과 충돌하지 않게 합니다.
- backend는 PostgreSQL의 정상 기동에만 의존합니다. Redis는 먼저 준비되지 않아도
  프로세스 시작과 인증을 막지 않으며, 캐시 장애 중 온라인 수는 DB 활동 기준입니다.
- 07번 기존 `challenge_07_state` volume은 더 이상 연결하지 않습니다. 기존 volume은
  자동 삭제하지 않으므로 보존 정책에 따라 따로 정리합니다. 새 임시 상태는 요청 종료와
  컨테이너 수명에 따라 정리되고 전체 크기가 제한됩니다.
- 정상 migration의 긴 실행과 일반 API의 응답 제한은 별도로 설정했습니다. 운영 데이터가
  큰 경우 인덱스 생성 시간과 잠금 영향을 유지보수 시간 전에 리허설합니다.

## 남은 운영 결정과 한계

실제 도메인의 TLS·프록시, 예상 동시 참가자 부하, 다중 복제본의 공유 상태, 개인정보·감사
로그·백업 보존, 참가 자격 확인과 최초 관리자 지정은 운영 환경에 맞게 결정해야 합니다.
기존 bcrypt 계정의 긴 비밀번호 한계는 안전한 비밀번호 교체·복구 기능 설계가 필요합니다.
일부 서비스의 root 실행은 secret UID/ACL 정책 정리 전까지 유지합니다.

브라우저 자동화는 이 환경에서 Chromium의 소켓 권한 제한으로 실행하지 못했습니다.
따라서 프런트엔드의 컴포넌트·라우트·입력·dialog 동작 검사와 production build를
실제 브라우저 E2E 및 부하 검증으로 표현하지 않습니다.

## 참고한 구현 계약

- [node-redis 운영 설정](https://redis.io/docs/latest/develop/clients/nodejs/produsage/)
- [node-postgres Pool](https://node-postgres.com/apis/pool), [Client timeout 설정](https://node-postgres.com/apis/client)
- [PostgreSQL 17 transaction-level advisory lock](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS)

상세 실행·복구 절차는 [운영 가이드](operations.md)에 반영했습니다.
