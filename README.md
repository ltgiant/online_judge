# Online Judge

## Overview
An online judge service where users solve programming problems and receive real-time grading results. The system runs as separate frontend, backend, judge worker, and database services.

- Components: Frontend (Next.js 16), Backend (FastAPI, Python), Worker (Python judge), DB (PostgreSQL)
- Ports: Backend 8000, Frontend 3000 (Dev: 8100/3100/55432)
- Routing: Browser → Cloudflare (HTTPS) → NGINX (443) → `/api` proxied to backend (8000), `/` proxied to frontend (3000)
- Worker: No separate queue; the worker polls the DB for new submissions and updates results

## Operations
- Deployment, environment variables, systemd setup, and DB dump/restore are documented in `docs/ops.md`.

## Architecture Diagram
```mermaid
flowchart LR
  User((User)) --> CF[Cloudflare]
  CF --> NGINX[NGINX]
  NGINX --> FE[Frontend (Next.js)]
  NGINX --> BE[Backend (FastAPI)]
  BE --> DB[(PostgreSQL)]
  BE --> SMTP[SMTP]
  BE --> Worker[Judge Worker]
  Worker --> DB
```

## Screenshots
![Signup](images/signup.png)
![Student solving a problem](images/student-solve.png)
![Student submissions](images/student-submissions.png)
![Problem list management](images/problem-list-management.png)

## Try It
- After signing up, go to Class → enter Code: `1GK14T` to join and start solving problems.
