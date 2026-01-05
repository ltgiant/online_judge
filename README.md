# Online Judge – Docker 배포/운영 안내

## 목차
0. 소개
1. 서비스 개요
2. 환경 변수
3. 개발/배포 워크플로우
4. systemd 관리(배포용)
5. DB 덤프/복원
6. 모니터링/로그
7. NGINX / Cloudflare 흐름
8. 컴포넌트별 흐름
9. 기타(이메일러 등)

## 0. 소개
- 프로그래밍 문제를 풀고 채점 결과를 실시간으로 받는 온라인 저지(프론트/백엔드/채점 워커/DB 분리) 서비스.

## 1. 서비스 개요
- 구성: 프론트(Next.js 16), 백엔드(FastAPI, Python), 워커(Python judge), DB(Azure PostgreSQL 17.7)
- 포트: 백엔드 8000, 프론트 3000 (개발용은 8100/3100/55432)
- 라우팅: 브라우저 → Cloudflare(HTTPS) → NGINX(443) → `/api`는 백엔드(8000), `/`는 프론트(3000)로 프록시.
- DB 사용: 백엔드/워커 모두 Azure Postgres에 접속. 백엔드는 제출을 `submissions` 테이블에 `queued` 상태로 기록하고, 워커는 같은 테이블을 폴링하여 `queued` 건을 집어 채점 후 `submission_results`/`submissions`(status, score, time)을 업데이트.
- 워커 트리거: 별도 큐 없이 워커 컨테이너(`online_judge-worker`)가 상시 실행되며 주기적으로 DB를 조회해 새 제출을 가져와 처리한다.

## 2. 환경 변수
- `env/.env.prod`: 운영 (Azure DB, JWT, SMTP, `NEXT_PUBLIC_API_BASE=https://cotea.io/api`)
- `env/.env.dev`: 개발 (로컬 DB 컨테이너, 포트 오버라이드 8100/3100/55432)
- `env/env.example`: 키 이름 참고용  
> 비밀(.env.prod)은 Git에 올리지 말고 서버/시크릿 스토어에만 보관.

## 3. 개발/배포 워크플로우
- 공통: Git으로 코드 버전 관리 → (옵션) Docker 이미지에 태그 → 서버에서 `docker compose` 실행.
- 태그/재시작 정책 권장: 서비스별 이미지 태그 고정(`backend:1.0.0`, `frontend:1.0.0`, `worker:1.0.0`) 후 compose에서 해당 태그 사용, `restart: always` 적용 시 장애 시 자동 재기동/롤백 용이.
- 개발 예시
  1) `git pull`
  2) 로컬 DB 컨테이너 포함 실행: `docker compose -p oj-dev --env-file env/.env.dev up -d db backend worker frontend`
  3) 코드 수정 후 필요하면 프론트/백엔드 빌드(`docker compose -p oj-dev --env-file env/.env.dev build frontend backend`)
  4) 테스트 끝나면 `git add/commit/push`
- 배포 예시
  1) 서버에서 `git pull` (또는 태그/이미지 pull)
  2) Azure DB 사용, DB 컨테이너 생략: `docker compose -p oj-prod --env-file env/.env.prod up -d backend worker frontend --no-deps`
  3) 프론트는 prod API 베이스로 이미 빌드됨 (.env.prod)
- 스키마 변경 반영(로컬→Azure)
  1) 로컬 DB에서 마이그레이션/DDL 적용 후 덤프:  
     `PGPASSWORD="ojpass" pg_dump -Fc -h localhost -p 5432 -U oj -d oj > dump_host.pg`
  2) Azure에 복원(덮어쓰기 주의): README의 “DB 덤프/복원” 절차로 `pg_restore` 실행
  3) 필요 시 백엔드/워커 재시작: `docker compose -p oj-prod --env-file .env.prod up -d backend worker frontend --no-deps`

## 4. systemd 관리(배포용)
- 유닛: `/etc/systemd/system/online-judge.service`
- 실행: `/usr/bin/docker compose -p oj-prod --env-file env/.env.prod up -d backend worker frontend --no-deps`
- 시작/중지:
  ```bash
  sudo systemctl start online-judge.service
  sudo systemctl stop online-judge.service
  sudo systemctl enable online-judge.service   # 부팅 시 자동 시작
  sudo systemctl disable online-judge.service
  sudo systemctl status online-judge.service
  ```

## 5. DB 덤프/복원 (예시)
```bash
# 로컬 DB -> 덤프
PGPASSWORD="ojpass" pg_dump -Fc -h localhost -p 5432 -U oj -d oj > dump_host.pg

# Azure로 복원(덮어쓰기 주의)
docker run --rm \
  -e PGHOST=oj-prod.postgres.database.azure.com \
  -e PGPORT=5432 \
  -e PGUSER=oj \
  -e PGDATABASE=postgres \
  -e PGPASSWORD="(azure-pass)" \
  -e PGSSLMODE=require \
  -v "$PWD/dump_host.pg:/dump.pg:ro" \
  postgres:17 \
  pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    --clean --if-exists --format=custom /dump.pg
```

## 6. 모니터링/로그
- 실시간 로그: `docker compose logs -f backend worker frontend`
- systemd 로그(배포): `sudo journalctl -u online-judge -f` (또는 `-n 200`)
- 헬스: 임시로 `/docs` 또는 `/` curl; 추후 `/health` 추가 예정
- 상태: `docker compose ps`, `docker ps`

## 7. NGINX / Cloudflare 흐름
- Cloudflare: HTTPS 프록시, 오리진은 NGINX(서버 IP:443)
- NGINX 라우팅:
  - `/api/` → `http://127.0.0.1:8000/` (프리픽스 제거)
  - `/` → `http://127.0.0.1:3000`
- 프론트 빌드 시 `NEXT_PUBLIC_API_BASE=https://cotea.io/api` 로 설정하면 `/api/...` 요청이 백엔드로 전달됨.
- 개발 시(로컬): Cloudflare/NGINX 없이 직접 포트로 접근. 프런트 3100, 백엔드 8100, 로컬 DB 컨테이너는 55432. API 베이스를 `http://localhost:8100` 등으로 맞추고 브라우저에서 직접 호출한다.

## 8. 컴포넌트별 흐름
- 백엔드: (작성 예정)
- 프론트: (작성 예정)
- DB: (작성 예정)
- 워커: (작성 예정)

## 9. 기타(이메일러 등)
- (작성 예정)
