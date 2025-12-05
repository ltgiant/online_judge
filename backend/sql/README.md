# Database Schema Overview

This folder contains the SQL definitions for the Online Judge backend.  
Apply `init.sql` to provision a fresh PostgreSQL database or to roll out schema upgrades manually.

## Tables

### `users`
Stores every account (student / teacher / admin).

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `bigserial` | Primary key |
| `email` | `text` | Unique login identifier |
| `pwd_hash` | `text` | Hash produced by Passlib |
| `username` | `text` | Display name |
| `role` | `text` | `student`, `teacher`, or `admin` |
| `is_verified` | `boolean` | Email verified flag |
| `verify_token`, `verify_expires` | `text`, `timestamptz` | Email verification workflow |
| `created_at` | `timestamptz` | Defaults to `now()` |

### `teacher_students`
Many-to-many mapping between teachers and their assigned students.  
Teachers gain visibility into the submissions of mapped students.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `teacher_id` | `bigint` | FK → `users.id`, `ON DELETE CASCADE` |
| `student_id` | `bigint` | FK → `users.id`, `ON DELETE CASCADE` |
| `created_at` | `timestamptz` | Defaults to `now()` |
| Primary key | `(teacher_id, student_id)` | Prevents duplicates |

### `classes`
Virtual classrooms that group teachers and students under a code.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `bigserial` | Primary key |
| `code` | `text` | Unique join/share code |
| `name` | `text` | Class name displayed in UI |
| `description` | `text` | Optional |
| `created_by` | `bigint` | FK → `users.id` (teacher/admin who created it) |
| `created_at` | `timestamptz` | Defaults to `now()` |

### `class_teachers`
Assigns teachers/admins to a class. The creator is automatically inserted.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `class_id` | `bigint` | FK → `classes.id`, cascade delete |
| `teacher_id` | `bigint` | FK → `users.id`, cascade delete |
| `created_at` | `timestamptz` | Defaults to `now()` |
| Primary key | `(class_id, teacher_id)` | Prevents duplicates |

### `class_students`
Tracks which students belong to which class.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `class_id` | `bigint` | FK → `classes.id`, cascade delete |
| `student_id` | `bigint` | FK → `users.id`, cascade delete |
| `created_at` | `timestamptz` | Defaults to `now()` |
| Primary key | `(class_id, student_id)` | Prevents duplicates |

### `class_problems`
Links problems to a class (one problem can appear in multiple classes).

| Column | Type | Notes |
| ------ | ---- | ----- |
| `class_id` | `bigint` | FK → `classes.id`, cascade delete |
| `problem_id` | `bigint` | FK → `problems.id`, cascade delete |
| `assigned_by` | `bigint` | FK → `users.id` (teacher/admin who made the assignment) |
| `assigned_at` | `timestamptz` | Defaults to `now()` |
| Primary key | `(class_id, problem_id)` | Prevents duplicates |

### `problems`
Metadata for each coding problem.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `bigserial` | Primary key |
| `slug` | `text` | Unique human-friendly identifier |
| `title` | `text` | Problem name |
| `difficulty` | `text` | Enum: `easy`, `medium`, `hard` |
| `statement_md` | `text` | Markdown prompt |
| `starter_code` | `text` | Optional starter/template code shown in the editor |
| `languages` | `text[]` | Currently defaults to `{'python'}` |
| `created_by` | `bigint` | FK → `users.id`, nullable for legacy rows |
| `created_at`, `updated_at` | `timestamptz` | Audit timestamps |

### `testcases`
Example and private test cases tied to a problem.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `problem_id` | `bigint` | FK → `problems.id`, cascade delete |
| `idx` | `int` | Ordering |
| `input_text`, `expected_text` | `text` | Judge inputs/outputs (plain stdin/stdout or JSON payloads for `answer(...)` problems) |
| `timeout_ms`, `points` | `int` | Constraints and scoring |
| `is_public` | `boolean` | Controls exposure to students |

### `submissions`
Records a student's code submission.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `user_id` | `bigint` | FK → `users.id` |
| `problem_id` | `bigint` | FK → `problems.id` |
| `language` | `text` | Currently `python` |
| `source_code` | `text` | Raw code |
| `status` | `text` | `queued`, `running`, `accepted`, etc. |
| `score`, `time_ms` | `int` | Aggregated judge metrics |
| `created_at`, `finished_at` | `timestamptz` | Timing data |

### `submission_results`
Stores per-testcase verdicts for a submission.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `submission_id` | `bigint` | FK → `submissions.id` |
| `testcase_id` | `bigint` | FK → `testcases.id` |
| `verdict` | `text` | `ok`, `wa`, `tle`, `re`, etc. |
| `time_ms` | `int` | Per-test runtime |
| `stdout`, `stderr` | `text` | Captured program output |

## Indices
- `idx_users_verify_token` speeds up token lookups during email verification.
- `idx_submissions_status` helps the worker claim queued submissions quickly.

## Applying the Schema

```bash
psql "host=localhost dbname=oj user=oj password=ojpass" -f backend/sql/init.sql
```

If your database already exists, translate any new statements into `ALTER TABLE` commands before running them in production.
