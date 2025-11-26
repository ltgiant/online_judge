CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  pwd_hash       TEXT NOT NULL,
  username       TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'student',
  is_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  verify_token   TEXT,
  verify_expires TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users(verify_token);

CREATE TABLE IF NOT EXISTS problems (
  id           BIGSERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  title        TEXT NOT NULL,
  difficulty   TEXT CHECK (difficulty IN ('easy','medium','hard')) NOT NULL,
  statement_md TEXT NOT NULL,
  languages    TEXT[] NOT NULL DEFAULT ARRAY['python'],
  created_by   BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_students (
  teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (teacher_id, student_id)
);

CREATE TABLE IF NOT EXISTS classes (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  BIGINT REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_teachers (
  class_id   BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS class_students (
  class_id   BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS class_problems (
  class_id    BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  problem_id  BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_id, problem_id)
);

CREATE TABLE IF NOT EXISTS testcases (
  id            BIGSERIAL PRIMARY KEY,
  problem_id    BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  idx           INT NOT NULL,
  input_text    TEXT NOT NULL,
  expected_text TEXT NOT NULL,
  timeout_ms    INT NOT NULL DEFAULT 2000,
  points        INT NOT NULL DEFAULT 1,
  is_public     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS submissions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
  problem_id  BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  language    TEXT NOT NULL CHECK (language = 'python'),
  source_code TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued', -- queued|running|accepted|wrong_answer|tle|runtime_error|system_error|compile_error
  score       INT DEFAULT 0,
  time_ms     INT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS submission_results (
  id             BIGSERIAL PRIMARY KEY,
  submission_id  BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  testcase_id    BIGINT NOT NULL REFERENCES testcases(id),
  verdict        TEXT NOT NULL,     -- ok|wa|tle|re
  time_ms        INT DEFAULT 0,
  stdout         TEXT,
  stderr         TEXT
);

-- 채점 워커가 “경합 없이” 작업 집기 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
