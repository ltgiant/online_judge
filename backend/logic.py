import secrets
import string
from .db import DB

def list_problems():
    with DB() as cur:
        cur.execute("""
            SELECT p.id, p.slug, p.title, p.difficulty
            FROM problems p
            WHERE NOT EXISTS (
                SELECT 1 FROM class_problems cp WHERE cp.problem_id = p.id
            )
            ORDER BY p.id DESC
        """)
        return [dict(id=r[0], slug=r[1], title=r[2], difficulty=r[3]) for r in cur.fetchall()]

def get_problem(pid: int):
    with DB() as cur:
        cur.execute("SELECT id, slug, title, difficulty, statement_md FROM problems WHERE id=%s", (pid,))
        row = cur.fetchone()
        if not row: return None
        cur.execute("SELECT idx, input_text, expected_text FROM testcases WHERE problem_id=%s AND is_public=TRUE ORDER BY idx", (pid,))
        pub_tcs = [{"idx": r[0], "input_text": r[1], "expected_text": r[2]} for r in cur.fetchall()]
        return {
            "id": row[0], "slug": row[1], "title": row[2], "difficulty": row[3],
            "statement_md": row[4], "public_samples": pub_tcs
        }

def create_problem(data, author_id=None):
    with DB() as cur:
        cur.execute("""
          INSERT INTO problems(slug, title, difficulty, statement_md, created_by)
          VALUES (%s,%s,%s,%s,%s) RETURNING id
        """, (data.slug, data.title, data.difficulty, data.statement_md, author_id))
        return cur.fetchone()[0]

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

def class_has_problem(class_id: int, problem_id: int) -> bool:
    with DB() as cur:
        cur.execute("""
            SELECT 1 FROM class_problems WHERE class_id=%s AND problem_id=%s
        """, (class_id, problem_id))
        return cur.fetchone() is not None

def add_problem_to_class(class_id: int, problem_id: int, assigned_by: int | None):
    with DB() as cur:
        cur.execute("""
            INSERT INTO class_problems(class_id, problem_id, assigned_by)
            VALUES (%s,%s,%s)
            ON CONFLICT (class_id, problem_id) DO NOTHING
        """, (class_id, problem_id, assigned_by))

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
            SELECT p.id, p.slug, p.title, p.difficulty, cp.assigned_at, cp.assigned_by, u.username, u.email
            FROM class_problems cp
            JOIN problems p ON p.id = cp.problem_id
            LEFT JOIN users u ON u.id = cp.assigned_by
            WHERE cp.class_id=%s
            ORDER BY cp.assigned_at DESC
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
            WHERE cs.class_id=%s
            ORDER BY s.created_at DESC
            LIMIT 200
        """, (class_id,))
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

def store_problem_testcases(problem_id: int, testcases: list[dict], *, replace_existing: bool):
    with DB() as cur:
        if replace_existing:
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
        cur.execute("SELECT class_id FROM class_problems WHERE problem_id=%s", (problem_id,))
        return [r[0] for r in cur.fetchall()]

def teacher_has_problem_access(teacher_id: int, problem_id: int) -> bool:
    with DB() as cur:
        cur.execute("""
            SELECT 1
            FROM class_teachers ct
            JOIN class_problems cp ON cp.class_id = ct.class_id
            WHERE ct.teacher_id=%s AND cp.problem_id=%s
        """, (teacher_id, problem_id))
        return cur.fetchone() is not None

def student_has_problem_access(student_id: int, problem_id: int) -> bool:
    with DB() as cur:
        cur.execute("""
            SELECT 1
            FROM class_students cs
            JOIN class_problems cp ON cp.class_id = cs.class_id
            WHERE cs.student_id=%s AND cp.problem_id=%s
        """, (student_id, problem_id))
        return cur.fetchone() is not None

def remove_problem_from_class(class_id: int, problem_id: int):
    with DB() as cur:
        cur.execute(
            "DELETE FROM class_problems WHERE class_id=%s AND problem_id=%s",
            (class_id, problem_id),
        )
        cur.execute(
            """
            SELECT 1
            FROM class_problems
            WHERE problem_id=%s
            """,
            (problem_id,),
        )
        if not cur.fetchone():
            cur.execute(
                "DELETE FROM submissions WHERE problem_id=%s",
                (problem_id,),
            )
            cur.execute(
                "DELETE FROM testcases WHERE problem_id=%s",
                (problem_id,),
            )
            cur.execute(
                "DELETE FROM problems WHERE id=%s",
                (problem_id,),
            )

def delete_class(class_id: int):
    with DB() as cur:
        cur.execute("SELECT problem_id FROM class_problems WHERE class_id=%s", (class_id,))
        problem_ids = [r[0] for r in cur.fetchall()]
        cur.execute("DELETE FROM classes WHERE id=%s", (class_id,))
        for pid in problem_ids:
            cur.execute(
                "SELECT 1 FROM class_problems WHERE problem_id=%s",
                (pid,),
            )
            if not cur.fetchone():
                cur.execute("DELETE FROM submissions WHERE problem_id=%s", (pid,))
                cur.execute("DELETE FROM testcases WHERE problem_id=%s", (pid,))
                cur.execute("DELETE FROM problems WHERE id=%s", (pid,))

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
