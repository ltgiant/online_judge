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
- Role-based access control (student / teacher / admin)
- Teachers/admins can author problems and review submissions from their assigned students
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
│   └── sql/             # Schema + docs (see sql/README.md)
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

### Teacher/Admin Workflow

1. Promote users to `teacher` or `admin` roles directly in the `users` table (e.g. `UPDATE users SET role='teacher' WHERE email='prof@x.com';`).
2. Teachers/admins can create new problems through `POST /admin/problems` (body follows the `ProblemCreate` schema).
3. Admins assign students to teachers by calling `POST /admin/teacher-assign`, which fills the `teacher_students` join table.
4. Once assigned, teachers gain read access to their students’ submissions via `GET /teacher/students/{student_id}/submissions`, and they can open individual submissions/results without sharing credentials.

Schema changes that power this workflow:

- `problems.created_by` references the authoring user.
- `teacher_students` enforces teacher ↔ student relationships (unique per pair).
- `classes`, `class_teachers`, `class_students` organize virtual classrooms with join codes.
- `class_problems` links problems to specific classes so assignments stay organized.

⸻

### Class Management

1. Teachers visit `/teacher/classes` (frontend) or call `POST /teacher/classes` to create a class. Each class receives a unique join code.
2. Classes can have multiple teachers (`POST /teacher/classes/{class_id}/teachers`) and students (`POST /teacher/classes/{class_id}/students`).
3. Teachers can assign problems to classes (existing or brand-new) via `POST /teacher/classes/{class_id}/problems`.
4. Problems assigned to classes are hidden from the global `/problems` list; only members (students, teachers, or admins) of those classes can open the statements.
5. Teachers automatically see the submission history of every student in any class they belong to (no extra configuration needed) through `GET /teacher/classes/{id}/submissions`.
6. Use `GET /teacher/classes` to list your classes and `GET /teacher/classes/{id}` to fetch teacher/student/problem rosters.
7. The Next.js page at `http://localhost:3000/teacher/classes` lists classes and lets you create new ones; each class has its own management page at `/teacher/classes/[id]` for rosters, problems, testcases (CSV upload), and submissions.
8. Students have a read-only view of their assigned classes and problems at `/student/classes`.

When you store JSON testcases for function-based grading, the frontend automatically pretty-prints the arguments/expected values in the public samples so students see just the raw values (no `args`/`kwargs` boilerplate).

⸻

### Authoring Problems & Testcases

You can evaluate solutions in two ways:

- **Stdout-based (legacy):** Students read from `stdin` and print the exact expected string. `testcases.input_text` contains the raw stdin payload, and `expected_text` is the expected stdout.
- **Function-based (recommended):** Students implement an `answer(...)` function and the judge compares its *return value*. To enable this mode, store JSON in both `input_text` and `expected_text`:
  - `input_text`: `{"args": [arg1, arg2, ...], "kwargs": {"named": value}}` (the judge passes these to `answer(*args, **kwargs)`). A bare JSON array `[...]` is treated as positional args only.
  - `expected_text`: JSON representing the expected return value (lists, tuples, dicts, numbers, strings, etc.).
  - Example (Two Sum): `input_text` = `{"args": [4, [2,7,11,15], 9]}`, `expected_text` = `[1, 2]`.
  - When uploading CSV testcases, quote the JSON so each cell stays intact.

The frontend editor now scaffolds a default `answer(...)` stub; students no longer need to print anything for function-based problems.

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

Create a class (teacher/admin)
```bash
curl -X POST http://127.0.0.1:8000/teacher/classes \
  -H "Authorization: Bearer <TEACHER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Intro to Algorithms","description":"Spring cohort"}'
```

Assign a student to a teacher (admin only)
```bash
curl -X POST http://127.0.0.1:8000/admin/teacher-assign \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"teacher_id":2,"student_id":5}'
```

List submissions for a teacher's student
```bash
curl -X GET http://127.0.0.1:8000/teacher/students/5/submissions \
  -H "Authorization: Bearer <TEACHER_TOKEN>"
```

Manage class membership
```bash
# Add student
curl -X POST http://127.0.0.1:8000/teacher/classes/10/students \
  -H "Authorization: Bearer <TEACHER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"student_email":"student@example.com"}'

# Add co-teacher
curl -X POST http://127.0.0.1:8000/teacher/classes/10/teachers \
  -H "Authorization: Bearer <TEACHER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"teacher_email":"assistant@example.com"}'
```

Assign a problem to a class
```bash
curl -X POST http://127.0.0.1:8000/teacher/classes/10/problems \
  -H "Authorization: Bearer <TEACHER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"problem_id":42}'
```

Create a new problem directly in a class
```bash
curl -X POST http://127.0.0.1:8000/teacher/classes/10/problems \
  -H "Authorization: Bearer <TEACHER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
        "new_problem": {
          "slug": "sum-two-numbers",
          "title": "Sum Two Numbers",
          "difficulty": "easy",
          "statement_md": "Given A and B..."
        }
      }'
```

List submissions for an entire class
```bash
curl -X GET http://127.0.0.1:8000/teacher/classes/10/submissions \
  -H "Authorization: Bearer <TEACHER_TOKEN>"
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
