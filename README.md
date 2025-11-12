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

- User authentication (Register / Login / JWT)
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

File	Variable	Example
backend/.env	JWT_SECRET	dev-secret
	JWT_EXPIRE_MINUTES	60
oj-frontend/.env.local	NEXT_PUBLIC_API_BASE	http://127.0.0.1:8000


⸻

### Example API Usage

Register
```bash
curl -X POST http://127.0.0.1:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@x.com","password":"secret123"}'
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

