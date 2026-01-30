# API Reference (Summary)

## Authentication
- Uses Bearer JWT in the `Authorization` header.
- Example:
  ```http
  Authorization: Bearer <token>
  ```

## Error Format
- Default error shape:
  ```json
  {"detail": "message"}
  ```

## Core Endpoints

### Auth
- `POST /auth/register` — Register user (email verification flow)
- `GET /auth/verify` — Verify email via token
- `POST /auth/login` — Login and get JWT
- `GET /me` — Get current user profile

### Problems & Submissions
- `GET /problems` — List problems
- `GET /problems/{pid}` — Problem detail
- `POST /submissions` — Create submission
- `GET /submissions/{sid}` — Submission detail
- `GET /submissions/{sid}/results` — Submission results
- `GET /problems/{pid}/my-submissions` — My submissions for a problem
- `GET /problems/{pid}/draft` — Load saved draft
- `PUT /problems/{pid}/draft` — Save draft

### Teacher / Admin (selected)
- `POST /teacher/classes` — Create class
- `GET /teacher/classes` — List classes
- `GET /teacher/classes/{class_id}` — Class detail
- `POST /teacher/classes/{class_id}/students` — Add student
- `POST /teacher/classes/{class_id}/problems` — Assign problem
- `GET /teacher/classes/{class_id}/submissions` — Class submissions
- `GET /teacher/classes/{class_id}/students/{student_id}/submissions` — Student submissions
- `GET /teacher/classes/{class_id}/problems/{problem_id}/submissions` — Problem submissions
- `GET /admin/problems` — List problems (admin)
- `POST /admin/problems` — Create problem (admin)
- `POST /admin/robot-problems` — Create robot problem (admin)

### Sandbox
- `POST /sandbox/run` — Run code in sandbox (authenticated)
