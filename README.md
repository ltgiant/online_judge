# Online Judge (MVP)

A minimal **Online Judge platform** built with **FastAPI**, **Next.js**, and **PostgreSQL**.  
Users can register, log in, solve programming problems, submit code, and get real-time verdicts.  
This is a lightweight **MVP (Minimum Viable Product)** version inspired by platforms like LeetCode and Baekjoon.

---

## ⚙️ Tech Stack

| Layer | Technology | Description |
|--------|-------------|-------------|
| **Frontend** | [Next.js 16](https://nextjs.org/) | React-based framework (Pages Router) |
|  | [Tailwind CSS v4](https://tailwindcss.com/) | Modern utility-first CSS |
|  | [Axios](https://axios-http.com/) | API client with JWT auth |
|  | [Monaco Editor](https://github.com/microsoft/monaco-editor) | In-browser code editor (like VS Code) |
|  | [React Markdown](https://github.com/remarkjs/react-markdown) | Render problem statements in Markdown |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) | High-performance Python API framework |
|  | [Pydantic](https://docs.pydantic.dev/) | Data validation & schema definition |
|  | [psycopg2](https://www.psycopg.org/) | PostgreSQL driver |
|  | [python-jose](https://python-jose.readthedocs.io/) | JWT-based authentication |
|  | [passlib](https://passlib.readthedocs.io/) | Secure password hashing |
| **Database** | [PostgreSQL](https://www.postgresql.org/) | Persistent storage for users, problems, submissions |
| **Worker** | Python | Executes submitted code, runs testcases, stores verdicts |

---

## Core Features

- User authentication with JWT + email verification (SMTP or dev echo)
- Problem list & detailed view with Markdown rendering
- Code submission & real-time result polling
- PostgreSQL persistence
- Simple worker to execute and evaluate user code (Python)
- Clean separation of **frontend / backend / worker**

---

## Project Structure
```
Online_Judge/
├── backend/             # FastAPI backend
│   ├── app.py           # Main API entrypoint
│   ├── auth.py          # JWT, password hash
│   ├── logic.py         # Submission logic
│   ├── db.py            # PostgreSQL connection
│   └── sql/init.sql     # Table schema
│
├── judge/               # Worker (executor)
│   └── worker.py
│
├── oj-frontend/         # Next.js frontend
│   ├── pages/           # Routes
│   ├── styles/
│   └── package.json
│
├── requirements.txt     # Python dependencies
├── README.md
└── .gitignore
```
---

## Run Locally

### 1. Setup database (PostgreSQL)
```bash
psql -U postgres
CREATE DATABASE oj;
CREATE USER oj WITH PASSWORD 'ojpass';
GRANT ALL PRIVILEGES ON DATABASE oj TO oj;
\q
```

Then run:

```bash
psql "host=localhost dbname=oj user=oj password=ojpass" -f backend/sql/init.sql
```

⸻

### 2. Backend (FastAPI)
```bash
cd backend
conda activate oj      # or your venv
pip install -r ../requirements.txt
uvicorn app:app --reload
```
→ Runs on http://127.0.0.1:8000

⸻

### 3. Worker (Judge)
```bash
cd judge
python worker.py
```

⸻

### 4. Frontend (Next.js)
```bash
cd oj-frontend
npm install
npm run dev
```
→ Opens on http://localhost:3000

⸻

### Environment Variables

| File | Variable | Description | Example |
|------|----------|-------------|---------|
| `backend/.env` | `POSTGRES_HOST/PORT/DB/USER/PASSWORD` | DB connection settings | `localhost`, `oj`, etc. |
|  | `JWT_SECRET` | Secret key for signing access tokens | `replace_with_long_random_string` |
|  | `JWT_EXPIRE_MINUTES` | Access-token lifetime | `60` |
|  | `VERIFY_BASE_URL` | Public base URL that serves `/auth/verify` | `http://127.0.0.1:8000` |
|  | `DEV_ECHO_VERIFY_TOKEN` | When `1`, API response includes the verification link (useful on localhost without SMTP) | `1` |
|  | `SMTP_HOST` | SMTP server hostname (leave empty to disable email sending) | `smtp.sendgrid.net` |
|  | `SMTP_PORT` | SMTP port | `587` |
|  | `SMTP_USER` / `SMTP_PASS` | Credentials for the SMTP server | `apikey` / `secret` |
|  | `SMTP_FROM` | From header shown to users | `OJ <no-reply@example.com>` |
|  | `SMTP_STARTTLS` | Set to `1` to enable STARTTLS | `1` |
| `oj-frontend/.env.local` | `NEXT_PUBLIC_API_BASE` | Backend URL the frontend should call | `http://127.0.0.1:8000` |

> Tip: keep `SMTP_HOST` empty and `DEV_ECHO_VERIFY_TOKEN=1` while developing locally.  
> For production, fill every SMTP variable and set `DEV_ECHO_VERIFY_TOKEN=0` to require real emails.

⸻

### Account Verification Flow

1. User signs up via `/signup`; the backend creates the account in a non-verified state.
2. If SMTP is configured, a verification email is sent containing `VERIFY_BASE_URL/auth/verify?token=...`.  
   - Failures are logged and surfaced in the API response.
3. In local/dev mode (`DEV_ECHO_VERIFY_TOKEN=1`), the `/auth/register` response also contains `verify_url`, so you can click it directly without SMTP.
4. Users must open the verification link before `/auth/login` will succeed (`Email not verified` otherwise).
5. After login, the frontend stores the JWT in `localStorage` and `/me` reflects whether the account is verified (`me.is_verified`).

⸻

### Example API Usage

Register
```bash
curl -X POST http://127.0.0.1:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
        "email":"test@x.com",
        "username":"tester",
        "password":"secret123",
        "password_confirm":"secret123"
      }'
```
Login
```bash
curl -X POST http://127.0.0.1:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@x.com","password":"secret123"}'
```

⸻

MVP Status

- User auth
- Problem list/detail
- Code submission & judging
- Result display
Next steps → user submission history, admin panel, sandboxing

⸻

📝 License

MIT License © 2025 [JihoonSeo]

⸻

Credits

Built with using FastAPI & Next.js
Inspired by Baekjoon, LeetCode, and AtCoder.
