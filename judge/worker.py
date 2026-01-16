import os, time, json
import psycopg2
from psycopg2.extras import DictCursor
from dotenv import load_dotenv
from runner_py import run_python, run_python_answer, run_python_robot

load_dotenv()
PG_SSLMODE = os.getenv("PG_SSLMODE", "require")
DSN = (
    f"dbname={os.getenv('POSTGRES_DB')} "
    f"user={os.getenv('POSTGRES_USER')} "
    f"password={os.getenv('POSTGRES_PASSWORD')} "
    f"host={os.getenv('POSTGRES_HOST')} "
    f"port={os.getenv('POSTGRES_PORT')} "
    f"sslmode={PG_SSLMODE}"
)

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
        cur.execute("""
            SELECT s.problem_id, s.language, s.source_code, p.problem_type
            FROM submissions s
            JOIN problems p ON p.id = s.problem_id
            WHERE s.id=%s
        """, (sid,))
        return cur.fetchone()

def load_robot_config(conn, pid):
    with conn.cursor(cursor_factory=DictCursor) as cur:
        cur.execute("""
          SELECT grid, start, walls, coins, goal, config
          FROM robot_problems WHERE problem_id=%s
        """, (pid,))
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

def try_parse_structured(tc):
    try:
        data = json.loads(tc["input_text"])
        expected = json.loads(tc["expected_text"])
        if isinstance(data, (dict, list)) and isinstance(expected, (dict, list, int, float, str, bool, type(None))):
            return data, expected
    except json.JSONDecodeError:
        pass
    return None, None

def normalize(val):
    if isinstance(val, dict):
        return {k: normalize(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [normalize(v) for v in val]
    if isinstance(val, set):
        return sorted(normalize(v) for v in val)
    return val

def parse_payload_output(out: str) -> tuple[any, str]:
    """Extract (result, stdout) from harness output, tolerating leading noise."""
    if not out:
        return None, ""
    try:
        parsed = json.loads(out)
        if isinstance(parsed, dict):
            return parsed.get("result"), parsed.get("stdout", "")
    except json.JSONDecodeError:
        pass
    brace = out.find("{")
    if brace != -1:
        try:
            parsed = json.loads(out[brace:])
            leading = out[:brace].strip()
            user_stdout = parsed.get("stdout", "")
            if leading:
                user_stdout = leading + ("\n" + user_stdout if user_stdout else "")
            return parsed.get("result"), user_stdout
        except json.JSONDecodeError:
            pass
    return None, out

def parse_robot_output(out: str) -> dict | None:
    if not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        pass
    brace = out.find("{")
    if brace != -1:
        try:
            return json.loads(out[brace:])
        except json.JSONDecodeError:
            pass
    return None

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
        pid = sub["problem_id"]
        lang = sub["language"]
        src = sub["source_code"]
        problem_type = (sub.get("problem_type") or "standard").strip()
        tcs = load_testcases(conn, pid)

        if problem_type == "robot":
            if not tcs:
                finalize(conn, sid, "system_error", 0, 0)
                continue

            tc = tcs[0]
            tcid = tc["id"]
            timeout_ms = tc["timeout_ms"]

            cfg = load_robot_config(conn, pid)
            if not cfg:
                insert_result(conn, sid, tcid, "re", 0, "", "Robot config not found")
                finalize(conn, sid, "system_error", 0, 0)
                continue

            config = cfg.get("config") or {
                "grid": cfg["grid"],
                "start": cfg["start"],
                "walls": cfg["walls"],
                "coins": cfg["coins"],
                "goal": cfg["goal"],
            }

            code, out, err, elapsed = run_python_robot(src, config, timeout_ms)
            max_time = elapsed
            final_status = "accepted"

            if code == 124:
                verdict = "tle"
                final_status = "tle"
                stdout_to_store = ""
            elif code != 0:
                verdict = "re"
                final_status = "runtime_error"
                stdout_to_store = ""
            else:
                payload = parse_robot_output(out or "")
                if not payload:
                    verdict = "re"
                    final_status = "runtime_error"
                    stdout_to_store = out
                else:
                    is_valid = bool(payload.get("is_valid", True))
                    is_correct = bool(payload.get("is_correct", False))
                    if not is_valid:
                        verdict = "re"
                        final_status = "runtime_error"
                    elif is_correct:
                        verdict = "ok"
                    else:
                        verdict = "wa"
                        final_status = "wrong_answer"
                    stdout_to_store = json.dumps(payload, ensure_ascii=False)

            insert_result(conn, sid, tcid, verdict, elapsed, stdout_to_store, err)
            conn.commit()
            score = 1 if verdict == "ok" else 0
            finalize(conn, sid, final_status, score, max_time)
            continue

        total_ok = 0
        max_time = 0
        final_status = "accepted"

        for tc in tcs:
            tcid = tc["id"]
            structured_input, structured_expected = try_parse_structured(tc)

            if structured_input is not None:
                code, out, err, elapsed = run_python_answer(src, structured_input, tc["timeout_ms"])
                max_time = max(max_time, elapsed)
                if code == 124:
                    verdict = "tle"; final_status = "tle"
                    stdout_to_store = ""
                elif code != 0:
                    verdict = "re"; final_status = "runtime_error"
                    _, parsed_stdout = parse_payload_output(out or "")
                    stdout_to_store = json.dumps({"return": None, "stdout": parsed_stdout}, ensure_ascii=False)
                else:
                    actual, captured_stdout = parse_payload_output(out or "")
                    if actual is None and captured_stdout == "":
                        verdict = "runtime_error"; final_status = "runtime_error"
                    else:
                        if normalize(actual) == normalize(structured_expected):
                            verdict = "ok"; total_ok += 1
                        else:
                            verdict = "wa"
                            if final_status == "accepted":
                                final_status = "wrong_answer"
                    if verdict == "ok":
                        stdout_to_store = ""  # skip storing return/stdout for accepted cases
                    else:
                        stdout_to_store = json.dumps({"return": actual, "stdout": captured_stdout}, ensure_ascii=False)
                insert_result(conn, sid, tcid, verdict, elapsed, stdout_to_store, err)
                conn.commit()
                if verdict != "ok":
                    break  # stop at first failing/timeout/runtime_error testcase
                continue  # structured case handled, skip plain stdin runner

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

            stdout_to_store = "" if verdict == "ok" else out
            insert_result(conn, sid, tcid, verdict, elapsed, stdout_to_store, err)
            conn.commit()
            if verdict != "ok":
                break  # stop at first failing/timeout/runtime_error testcase

        finalize(conn, sid, final_status, total_ok, max_time)

if __name__ == "__main__":
    main()
