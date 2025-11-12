from .db import DB

def list_problems():
    with DB() as cur:
        cur.execute("SELECT id, slug, title, difficulty FROM problems ORDER BY id DESC")
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

def create_problem(data):
    with DB() as cur:
        cur.execute("""
          INSERT INTO problems(slug, title, difficulty, statement_md)
          VALUES (%s,%s,%s,%s) RETURNING id
        """, (data.slug, data.title, data.difficulty, data.statement_md))
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