import json
import secrets
import string
from .db import DB

def list_problems():
    with DB() as cur:
        cur.execute("""
            SELECT p.id, p.slug, p.title, p.difficulty
            FROM problems p
            WHERE NOT EXISTS (
                SELECT 1 FROM class_week_problems cwp WHERE cwp.problem_id = p.id
            )
            ORDER BY p.id DESC
        """)
        return [dict(id=r[0], slug=r[1], title=r[2], difficulty=r[3]) for r in cur.fetchall()]

def get_problem(pid: int):
    with DB() as cur:
        cur.execute("SELECT id, slug, title, difficulty, statement_md, starter_code FROM problems WHERE id=%s", (pid,))
        row = cur.fetchone()
        if not row: return None
        cur.execute("SELECT idx, input_text, expected_text FROM testcases WHERE problem_id=%s AND is_public=TRUE ORDER BY idx", (pid,))
        pub_tcs = [{"idx": r[0], "input_text": r[1], "expected_text": r[2]} for r in cur.fetchall()]
        return {
            "id": row[0], "slug": row[1], "title": row[2], "difficulty": row[3],
            "statement_md": row[4], "starter_code": row[5], "public_samples": pub_tcs
        }

def create_problem(data, author_id=None, problem_type: str = "standard"):
    with DB() as cur:
        cur.execute("""
          INSERT INTO problems(slug, title, difficulty, statement_md, starter_code, created_by, problem_type)
          VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (data.slug, data.title, data.difficulty, data.statement_md, getattr(data, "starter_code", None), author_id, problem_type))
        return cur.fetchone()[0]

def create_robot_problem(data, author_id=None):
    """Create a problem + robot config + placeholder testcase as a single transaction."""
    with DB() as cur:
        cur.execute("""
          INSERT INTO problems(slug, title, difficulty, statement_md, starter_code, created_by, problem_type)
          VALUES (%s,%s,%s,%s,%s,%s,'robot') RETURNING id
        """, (data.slug, data.title, data.difficulty, data.statement_md, getattr(data, "starter_code", None), author_id))
        problem_id = cur.fetchone()[0]

        cfg = data.config
        config_payload = cfg.model_dump()
        cur.execute(
            """
            INSERT INTO robot_problems(problem_id, grid, start, walls, coins, goal, config)
            VALUES (%s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)
            RETURNING pid
            """,
            (
                problem_id,
                json.dumps(cfg.grid),
                json.dumps(cfg.start),
                json.dumps(cfg.walls),
                json.dumps(cfg.coins),
                json.dumps(cfg.goal),
                json.dumps(config_payload),
            ),
        )
        robot_pid = cur.fetchone()[0]

        # Placeholder testcase so robot problems still align with existing submissions flow.
        cur.execute(
            """
            INSERT INTO testcases(problem_id, idx, input_text, expected_text, timeout_ms, points, is_public)
            VALUES (%s, 1, %s, %s, %s, %s, %s)
            """,
            (problem_id, "{}", "{}", 2000, 1, False),
        )

        return {"problem_id": problem_id, "robot_pid": robot_pid}

def get_robot_problem(problem_id: int):
    with DB() as cur:
        cur.execute(
            """
            SELECT p.id, p.slug, p.title, p.difficulty, p.statement_md, p.starter_code,
                   r.pid, r.grid, r.start, r.walls, r.coins, r.goal, r.config
            FROM problems p
            JOIN robot_problems r ON r.problem_id = p.id
            WHERE p.id=%s
            """,
            (problem_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        config = row[12] or {
            "grid": row[7],
            "start": row[8],
            "walls": row[9],
            "coins": row[10],
            "goal": row[11],
        }
        return {
            "problem_id": row[0],
            "slug": row[1],
            "title": row[2],
            "difficulty": row[3],
            "statement_md": row[4],
            "starter_code": row[5],
            "robot_pid": row[6],
            "config": config,
        }

def add_testcase(data):
    with DB() as cur:
        cur.execute("""
          INSERT INTO testcases(problem_id, idx, input_text, expected_text, timeout_ms, points, is_public)
          VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (data.problem_id, data.idx, data.input_text, data.expected_text, data.timeout_ms, data.points, data.is_public))
        return cur.fetchone()[0]

def create_submission(user_id: int, data):
    with DB() as cur:
        cur.execute("""
          INSERT INTO submissions(user_id, problem_id, language, source_code)
          VALUES (%s,%s,'python',%s) RETURNING id
        """, (user_id, data.problem_id, data.source_code))
        return cur.fetchone()[0]

def problem_exists(problem_id: int) -> bool:
    with DB() as cur:
        cur.execute("SELECT 1 FROM problems WHERE id=%s", (problem_id,))
        return cur.fetchone() is not None

def get_user_problem_draft(user_id: int, problem_id: int) -> str | None:
    with DB() as cur:
        cur.execute(
            "SELECT code FROM user_problem_drafts WHERE user_id=%s AND problem_id=%s",
            (user_id, problem_id),
        )
        row = cur.fetchone()
        return row[0] if row else None

def upsert_user_problem_draft(user_id: int, problem_id: int, code: str) -> None:
    with DB() as cur:
        cur.execute("""
            INSERT INTO user_problem_drafts(user_id, problem_id, code)
            VALUES (%s,%s,%s)
            ON CONFLICT (user_id, problem_id)
            DO UPDATE SET code = EXCLUDED.code, updated_at = NOW()
        """, (user_id, problem_id, code))

def get_submission(sid: int):
    with DB() as cur:
        cur.execute("SELECT id, status, score, time_ms, created_at, finished_at FROM submissions WHERE id=%s", (sid,))
        row = cur.fetchone()
        if not row: return None
        return {"id": row[0], "status": row[1], "score": row[2], "time_ms": row[3], "created_at": row[4], "finished_at": row[5]}

def list_submission_results(sid: int):
    with DB() as cur:
        cur.execute("""
          SELECT tr.testcase_id, tr.verdict, tr.time_ms, tr.stdout, tr.stderr, tc.idx
          FROM submission_results tr
          JOIN testcases tc ON tc.id = tr.testcase_id
          WHERE tr.submission_id=%s
          ORDER BY tc.idx
        """, (sid,))
        return [
            {"testcase_id": r[0], "verdict": r[1], "time_ms": r[2], "stdout": r[3], "stderr": r[4], "idx": r[5]}
            for r in cur.fetchall()
        ]

def list_submissions_for_student(student_id: int):
    with DB() as cur:
        cur.execute("""
          SELECT id, problem_id, status, score, time_ms, created_at, finished_at
          FROM submissions
          WHERE user_id=%s
          ORDER BY created_at DESC
        """, (student_id,))
        return [
            {
                "id": r[0],
                "problem_id": r[1],
                "status": r[2],
                "score": r[3],
                "time_ms": r[4],
                "created_at": r[5],
                "finished_at": r[6],
            }
            for r in cur.fetchall()
        ]

def teacher_can_access_student(teacher_id: int, student_id: int) -> bool:
    with DB() as cur:
        cur.execute(
            """
            SELECT
                EXISTS (
                    SELECT 1 FROM teacher_students
                    WHERE teacher_id=%s AND student_id=%s
                ) OR EXISTS (
                    SELECT 1
                    FROM class_teachers ct
                    JOIN class_students cs ON cs.class_id = ct.class_id
                    WHERE ct.teacher_id=%s AND cs.student_id=%s
                )
            """,
            (teacher_id, student_id, teacher_id, student_id),
        )
        row = cur.fetchone()
        return bool(row[0]) if row else False

def assign_student_to_teacher(teacher_id: int, student_id: int):
    with DB() as cur:
        cur.execute("""
          INSERT INTO teacher_students(teacher_id, student_id)
          VALUES (%s,%s)
          ON CONFLICT (teacher_id, student_id) DO NOTHING
        """, (teacher_id, student_id))

def _generate_class_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))

def create_class(name: str, description: str | None, creator_id: int):
    with DB() as cur:
        code = _generate_class_code()
        while True:
            cur.execute("SELECT 1 FROM classes WHERE code=%s", (code,))
            if not cur.fetchone():
                break
            code = _generate_class_code()
        cur.execute("""
            INSERT INTO classes(code, name, description, created_by)
            VALUES (%s,%s,%s,%s) RETURNING id
        """, (code, name, description, creator_id))
        class_id = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO class_teachers(class_id, teacher_id)
            VALUES (%s,%s)
            ON CONFLICT (class_id, teacher_id) DO NOTHING
        """, (class_id, creator_id))
        return {"id": class_id, "code": code}

def list_classes_for_teacher(teacher_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT c.id, c.name, c.code, c.description, c.created_at,
                   COALESCE(st.count, 0) AS student_count
            FROM classes c
            JOIN class_teachers ct ON ct.class_id = c.id
            LEFT JOIN (
                SELECT class_id, COUNT(*) AS count
                FROM class_students
                GROUP BY class_id
            ) st ON st.class_id = c.id
            WHERE ct.teacher_id=%s
            ORDER BY c.created_at DESC
        """, (teacher_id,))
        return [
            {
                "id": r[0],
                "name": r[1],
                "code": r[2],
                "description": r[3],
                "created_at": r[4],
                "student_count": r[5],
            }
            for r in cur.fetchall()
        ]

def list_classes_for_student(student_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT c.id, c.name, c.code, c.description, c.created_at
            FROM classes c
            JOIN class_students cs ON cs.class_id = c.id
            WHERE cs.student_id=%s
            ORDER BY c.created_at DESC
        """, (student_id,))
        return [
            {
                "id": r[0],
                "name": r[1],
                "code": r[2],
                "description": r[3],
                "created_at": r[4],
            }
            for r in cur.fetchall()
        ]

def get_class(class_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT id, code, name, description, created_by, created_at
            FROM classes
            WHERE id=%s
        """, (class_id,))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "code": row[1],
            "name": row[2],
            "description": row[3],
            "created_by": row[4],
            "created_at": row[5],
        }

def get_class_by_code(code: str):
    with DB() as cur:
        cur.execute("""
            SELECT id, code, name, description, created_by, created_at
            FROM classes
            WHERE code=%s
        """, (code,))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "code": row[1],
            "name": row[2],
            "description": row[3],
            "created_by": row[4],
            "created_at": row[5],
        }

def teacher_in_class(teacher_id: int, class_id: int) -> bool:
    with DB() as cur:
        cur.execute(
            "SELECT 1 FROM class_teachers WHERE class_id=%s AND teacher_id=%s",
            (class_id, teacher_id),
        )
        return cur.fetchone() is not None

def student_in_class(student_id: int, class_id: int) -> bool:
    with DB() as cur:
        cur.execute(
            "SELECT 1 FROM class_students WHERE class_id=%s AND student_id=%s",
            (class_id, student_id),
        )
        return cur.fetchone() is not None

def add_teacher_to_class(class_id: int, teacher_id: int):
    with DB() as cur:
        cur.execute("""
            INSERT INTO class_teachers(class_id, teacher_id)
            VALUES (%s,%s)
            ON CONFLICT (class_id, teacher_id) DO NOTHING
        """, (class_id, teacher_id))

def add_student_to_class(class_id: int, student_id: int):
    with DB() as cur:
        cur.execute("""
            INSERT INTO class_students(class_id, student_id)
            VALUES (%s,%s)
            ON CONFLICT (class_id, student_id) DO NOTHING
        """, (class_id, student_id))

def ensure_class_week(class_id: int, week_no: int) -> int:
    with DB() as cur:
        cur.execute(
            """
            INSERT INTO class_weeks(class_id, week_no)
            VALUES (%s,%s)
            ON CONFLICT (class_id, week_no) DO NOTHING
            RETURNING id
            """,
            (class_id, week_no),
        )
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(
            "SELECT id FROM class_weeks WHERE class_id=%s AND week_no=%s",
            (class_id, week_no),
        )
        found = cur.fetchone()
        return found[0] if found else None

def get_class_week_id(class_id: int, week_no: int) -> int | None:
    with DB() as cur:
        cur.execute(
            "SELECT id FROM class_weeks WHERE class_id=%s AND week_no=%s",
            (class_id, week_no),
        )
        row = cur.fetchone()
        return row[0] if row else None

def set_class_week_meta(class_id: int, week_no: int, title: str | None, description: str | None):
    with DB() as cur:
        cur.execute(
            """
            UPDATE class_weeks
            SET title=%s, description=%s
            WHERE class_id=%s AND week_no=%s
            """,
            (title, description, class_id, week_no),
        )

def list_class_weeks(class_id: int) -> list[dict]:
    with DB() as cur:
        cur.execute(
            """
            SELECT id, week_no, title, description, created_at
            FROM class_weeks
            WHERE class_id=%s
            ORDER BY week_no
            """,
            (class_id,),
        )
        return [
            {
                "id": r[0],
                "week_no": r[1],
                "title": r[2],
                "description": r[3],
                "created_at": r[4],
            }
            for r in cur.fetchall()
        ]

def class_has_problem(class_id: int, problem_id: int) -> bool:
    with DB() as cur:
        cur.execute("""
            SELECT 1
            FROM class_week_problems cwp
            JOIN class_weeks cw ON cw.id = cwp.class_week_id
            WHERE cw.class_id=%s AND cwp.problem_id=%s
        """, (class_id, problem_id))
        return cur.fetchone() is not None

def add_problem_to_class(class_id: int, problem_id: int, assigned_by: int | None, week: int | None):
    week_no = week or 1
    week_id = ensure_class_week(class_id, week_no)
    with DB() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(order_index), 0) + 1 FROM class_week_problems WHERE class_week_id=%s",
            (week_id,),
        )
        next_index = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO class_week_problems(class_week_id, problem_id, assigned_by, order_index)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (class_week_id, problem_id) DO NOTHING
        """, (week_id, problem_id, assigned_by, next_index))

def list_class_students(class_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT u.id, u.email, u.username, u.is_verified
            FROM class_students cs
            JOIN users u ON u.id = cs.student_id
            WHERE cs.class_id=%s
            ORDER BY u.username, u.email
        """, (class_id,))
        return [
            {
                "id": r[0],
                "email": r[1],
                "username": r[2],
                "is_verified": r[3],
            }
            for r in cur.fetchall()
        ]

def list_class_teachers(class_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT u.id, u.email, u.username
            FROM class_teachers ct
            JOIN users u ON u.id = ct.teacher_id
            WHERE ct.class_id=%s
            ORDER BY u.username, u.email
        """, (class_id,))
        return [
            {
                "id": r[0],
                "email": r[1],
                "username": r[2],
            }
            for r in cur.fetchall()
        ]

def list_class_problems(class_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT p.id, p.slug, p.title, p.difficulty, cwp.assigned_at, cwp.assigned_by, u.username, u.email,
                   cw.week_no, cwp.order_index
            FROM class_week_problems cwp
            JOIN class_weeks cw ON cw.id = cwp.class_week_id
            JOIN problems p ON p.id = cwp.problem_id
            LEFT JOIN users u ON u.id = cwp.assigned_by
            WHERE cw.class_id=%s
            ORDER BY cw.week_no, cwp.order_index, cwp.assigned_at
        """, (class_id,))
        return [
            {
                "id": r[0],
                "slug": r[1],
                "title": r[2],
                "difficulty": r[3],
                "assigned_at": r[4],
                "assigned_by": r[5],
                "assigned_by_name": r[6] or r[7],
                "week": r[8],
                "order_index": r[9],
            }
            for r in cur.fetchall()
        ]

def list_class_submissions(class_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT s.id, s.status, s.score, s.time_ms, s.created_at, s.finished_at,
                   u.id, u.username, u.email,
                   p.id, p.title, p.slug
            FROM submissions s
            JOIN class_students cs ON cs.student_id = s.user_id
            JOIN users u ON u.id = s.user_id
            JOIN problems p ON p.id = s.problem_id
            JOIN class_week_problems cwp ON cwp.problem_id = s.problem_id
            JOIN class_weeks cw ON cw.id = cwp.class_week_id
            WHERE cs.class_id=%s AND cw.class_id=%s
            ORDER BY s.created_at DESC
            LIMIT 200
        """, (class_id, class_id))
        return [
            {
                "submission_id": r[0],
                "status": r[1],
                "score": r[2],
                "time_ms": r[3],
                "created_at": r[4],
                "finished_at": r[5],
                "student_id": r[6],
                "student_username": r[7],
                "student_email": r[8],
                "problem_id": r[9],
                "problem_title": r[10],
                "problem_slug": r[11],
            }
            for r in cur.fetchall()
        ]

def list_class_submissions_for_student(class_id: int, student_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT s.id, s.problem_id, p.title, p.slug,
                   s.status, s.score, s.time_ms, s.created_at, s.finished_at,
                   s.source_code
            FROM submissions s
            JOIN class_students cs ON cs.student_id = s.user_id AND cs.class_id = %s
            JOIN class_week_problems cwp ON cwp.problem_id = s.problem_id
            JOIN class_weeks cw ON cw.id = cwp.class_week_id AND cw.class_id = cs.class_id
            JOIN problems p ON p.id = s.problem_id
            WHERE s.user_id = %s
            ORDER BY s.created_at DESC
            LIMIT 200
        """, (class_id, student_id))
        return [
            {
                "id": r[0],
                "problem_id": r[1],
                "problem_title": r[2],
                "problem_slug": r[3],
                "status": r[4],
                "score": r[5],
                "time_ms": r[6],
                "created_at": r[7],
                "finished_at": r[8],
                "source_code": r[9],
            }
            for r in cur.fetchall()
        ]

def store_problem_testcases(problem_id: int, testcases: list[dict], *, replace_existing: bool):
    with DB() as cur:
        if replace_existing:
            # Remove old results/submissions to avoid FK errors when replacing testcases
            cur.execute(
                "DELETE FROM submission_results WHERE submission_id IN (SELECT id FROM submissions WHERE problem_id=%s)",
                (problem_id,),
            )
            cur.execute("DELETE FROM submissions WHERE problem_id=%s", (problem_id,))
            cur.execute("DELETE FROM testcases WHERE problem_id=%s", (problem_id,))
        for case in testcases:
            cur.execute("""
                INSERT INTO testcases(problem_id, idx, input_text, expected_text, timeout_ms, points, is_public)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
            """, (
                problem_id,
                case["idx"],
                case["input_text"],
                case["expected_text"],
                case["timeout_ms"],
                case["points"],
                case["is_public"],
            ))

def problem_class_ids(problem_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT cw.class_id
            FROM class_week_problems cwp
            JOIN class_weeks cw ON cw.id = cwp.class_week_id
            WHERE cwp.problem_id=%s
        """, (problem_id,))
        return [r[0] for r in cur.fetchall()]

def teacher_has_problem_access(teacher_id: int, problem_id: int) -> bool:
    with DB() as cur:
        cur.execute("""
            SELECT 1
            FROM class_teachers ct
            JOIN class_weeks cw ON cw.class_id = ct.class_id
            JOIN class_week_problems cwp ON cwp.class_week_id = cw.id
            WHERE ct.teacher_id=%s AND cwp.problem_id=%s
        """, (teacher_id, problem_id))
        return cur.fetchone() is not None

def student_has_problem_access(student_id: int, problem_id: int) -> bool:
    with DB() as cur:
        cur.execute("""
            SELECT 1
            FROM class_students cs
            JOIN class_weeks cw ON cw.class_id = cs.class_id
            JOIN class_week_problems cwp ON cwp.class_week_id = cw.id
            WHERE cs.student_id=%s AND cwp.problem_id=%s
        """, (student_id, problem_id))
        return cur.fetchone() is not None

def remove_problem_from_class(class_id: int, problem_id: int):
    with DB() as cur:
        cur.execute(
            """
            DELETE FROM class_week_problems cwp
            USING class_weeks cw
            WHERE cw.id = cwp.class_week_id
              AND cw.class_id=%s
              AND cwp.problem_id=%s
            """,
            (class_id, problem_id),
        )
        cur.execute(
            "SELECT 1 FROM class_week_problems WHERE problem_id=%s",
            (problem_id,),
        )
        if not cur.fetchone():
            cur.execute("DELETE FROM submissions WHERE problem_id=%s", (problem_id,))
            cur.execute("DELETE FROM testcases WHERE problem_id=%s", (problem_id,))
            cur.execute("DELETE FROM problems WHERE id=%s", (problem_id,))

def delete_class(class_id: int):
    with DB() as cur:
        cur.execute(
            """
            SELECT DISTINCT cwp.problem_id
            FROM class_week_problems cwp
            JOIN class_weeks cw ON cw.id = cwp.class_week_id
            WHERE cw.class_id=%s
            """,
            (class_id,),
        )
        problem_ids = [r[0] for r in cur.fetchall()]
        cur.execute("DELETE FROM classes WHERE id=%s", (class_id,))
        for pid in problem_ids:
            cur.execute(
                "SELECT 1 FROM class_week_problems WHERE problem_id=%s",
                (pid,),
            )
            if not cur.fetchone():
                cur.execute("DELETE FROM submissions WHERE problem_id=%s", (pid,))
                cur.execute("DELETE FROM testcases WHERE problem_id=%s", (pid,))
                cur.execute("DELETE FROM problems WHERE id=%s", (pid,))

def delete_class_week(class_id: int, week_no: int):
    with DB() as cur:
        cur.execute("SELECT id FROM class_weeks WHERE class_id=%s AND week_no=%s", (class_id, week_no))
        row = cur.fetchone()
        if not row:
            return False, "Week not found"
        week_id = row[0]
        cur.execute("SELECT 1 FROM class_week_problems WHERE class_week_id=%s LIMIT 1", (week_id,))
        if cur.fetchone():
            return False, "Week has problems"
        cur.execute("DELETE FROM class_weeks WHERE id=%s", (week_id,))
        return True, None

def list_user_submissions_for_problem(user_id: int, problem_id: int, limit: int = 10):
    with DB() as cur:
        cur.execute("""
            SELECT id, status, score, time_ms, created_at, finished_at
            FROM submissions
            WHERE user_id=%s AND problem_id=%s
            ORDER BY created_at DESC
            LIMIT %s
        """, (user_id, problem_id, limit))
        return [
            {
                "id": r[0],
                "status": r[1],
                "score": r[2],
                "time_ms": r[3],
                "created_at": r[4],
                "finished_at": r[5],
            }
            for r in cur.fetchall()
        ]

def user_solved_problem(user_id: int, problem_id: int) -> bool:
    with DB() as cur:
        cur.execute("""
            SELECT 1
            FROM submissions
            WHERE user_id=%s AND problem_id=%s AND status='accepted'
            LIMIT 1
        """, (user_id, problem_id))
        return cur.fetchone() is not None

def delete_problem(problem_id: int):
    with DB() as cur:
        cur.execute("DELETE FROM problems WHERE id=%s", (problem_id,))

def update_problem(problem_id: int, **fields):
    if not fields:
        return
    columns = []
    params = []
    for key in ("title", "difficulty", "statement_md", "starter_code"):
        if key in fields and fields[key] is not None:
            columns.append(f"{key}=%s")
            params.append(fields[key])
    if not columns:
        return
    columns.append("updated_at=NOW()")
    params.append(problem_id)
    with DB() as cur:
        cur.execute(f"UPDATE problems SET {', '.join(columns)} WHERE id=%s", tuple(params))

def update_class_problem_week(class_id: int, problem_id: int, week: int):
    week_id = ensure_class_week(class_id, week)
    with DB() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(order_index), 0) + 1 FROM class_week_problems WHERE class_week_id=%s",
            (week_id,),
        )
        next_index = cur.fetchone()[0]
        cur.execute(
            """
            UPDATE class_week_problems cwp
            SET class_week_id=%s,
                order_index=%s
            WHERE cwp.problem_id=%s
              AND cwp.class_week_id IN (SELECT id FROM class_weeks WHERE class_id=%s)
            """,
            (week_id, next_index, problem_id, class_id),
        )
        if cur.rowcount == 0:
            cur.execute(
                """
                INSERT INTO class_week_problems(class_week_id, problem_id, order_index)
                VALUES (%s,%s,%s)
                ON CONFLICT (class_week_id, problem_id) DO NOTHING
                """,
                (week_id, problem_id, next_index),
            )

def update_week_problem_order(class_id: int, week_no: int, problem_ids: list[int]) -> bool:
    if not problem_ids:
        return False
    week_id = get_class_week_id(class_id, week_no)
    if not week_id:
        return False
    with DB() as cur:
        cur.execute(
            """
            SELECT problem_id
            FROM class_week_problems
            WHERE class_week_id=%s
            """,
            (week_id,),
        )
        existing = {r[0] for r in cur.fetchall()}
        if set(problem_ids) != existing:
            return False
        order_map = {pid: idx + 1 for idx, pid in enumerate(problem_ids)}
        cur.execute(
            f"""
            UPDATE class_week_problems
            SET order_index = CASE problem_id
                {" ".join(["WHEN %s THEN %s" for _ in problem_ids])}
                ELSE order_index
            END
            WHERE class_week_id=%s AND problem_id = ANY(%s)
            """,
            tuple([v for pair in order_map.items() for v in pair] + [week_id, problem_ids]),
        )
    return True
