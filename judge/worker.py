import os, time
import psycopg2
from psycopg2.extras import DictCursor
from dotenv import load_dotenv
from runner_py import run_python

load_dotenv()
DSN = f"dbname={os.getenv('POSTGRES_DB')} user={os.getenv('POSTGRES_USER')} password={os.getenv('POSTGRES_PASSWORD')} host={os.getenv('POSTGRES_HOST')} port={os.getenv('POSTGRES_PORT')}"

def pick_one(conn):
    with conn.cursor(cursor_factory=DictCursor) as cur:
        cur.execute("""
          BEGIN;
          SELECT id FROM submissions
          WHERE status = 'queued'
          FOR UPDATE SKIP LOCKED
          LIMIT 1;
        """)
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return None
        sid = row["id"]
        cur.execute("UPDATE submissions SET status='running' WHERE id=%s", (sid,))
        cur.execute("COMMIT;")
        return sid

def fetch_submission(conn, sid):
    with conn.cursor(cursor_factory=DictCursor) as cur:
        cur.execute("SELECT problem_id, language, source_code FROM submissions WHERE id=%s", (sid,))
        return cur.fetchone()

def load_testcases(conn, pid):
    with conn.cursor(cursor_factory=DictCursor) as cur:
        cur.execute("""
          SELECT id, idx, input_text, expected_text, timeout_ms
          FROM testcases WHERE problem_id=%s ORDER BY idx
        """, (pid,))
        return cur.fetchall()

def insert_result(conn, sid, tcid, verdict, t_ms, stdout, stderr):
    with conn.cursor() as cur:
        cur.execute("""
          INSERT INTO submission_results(submission_id, testcase_id, verdict, time_ms, stdout, stderr)
          VALUES (%s,%s,%s,%s,%s,%s)
        """, (sid, tcid, verdict, t_ms, stdout, stderr))

def finalize(conn, sid, status, score, max_time):
    with conn.cursor() as cur:
        cur.execute("""
          UPDATE submissions
          SET status=%s, score=%s, time_ms=%s, finished_at=NOW()
          WHERE id=%s
        """, (status, score, max_time, sid))
    conn.commit()

def main():
    conn = psycopg2.connect(DSN)
    conn.autocommit = False
    print("[worker] started")
    while True:
        sid = pick_one(conn)
        if not sid:
            time.sleep(0.5)
            continue

        sub = fetch_submission(conn, sid)
        pid, lang, src = sub["problem_id"], sub["language"], sub["source_code"]
        tcs = load_testcases(conn, pid)

        total_ok = 0
        max_time = 0
        final_status = "accepted"

        for tc in tcs:
            tcid = tc["id"]
            code, out, err, elapsed = run_python(src, tc["input_text"], tc["timeout_ms"])
            max_time = max(max_time, elapsed)

            if code == 124:
                verdict = "tle"; final_status = "tle"
            elif code != 0:
                verdict = "re"; final_status = "runtime_error"
            else:
                verdict = "ok" if out.strip() == tc["expected_text"].strip() else "wa"
                if verdict == "wa" and final_status == "accepted":
                    final_status = "wrong_answer"
                if verdict == "ok":
                    total_ok += 1

            insert_result(conn, sid, tcid, verdict, elapsed, out, err)
            conn.commit()

        finalize(conn, sid, final_status, total_ok, max_time)

if __name__ == "__main__":
    main()