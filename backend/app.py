# backend/app.py (중요 부분만 발췌/추가)
import os
import json
import sys
import csv
import io
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
import secrets

# Ensure project root on sys.path so "backend" package can be imported when running from backend/
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from fastapi import FastAPI, Depends, HTTPException, status, Header, UploadFile, File, Form
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from backend import logic

from backend.auth import (
    create_access_token,
    decode_access_token,
    get_user_by_email,
    get_user_by_id,
    verify_password,
    create_user_with_verify,
    consume_verify_token,
)
from backend.emailer import send_verify_email, SMTPConfigError, is_smtp_configured
from backend.schemas import SubmissionCreate, ProblemCreate  # import early for type usage

logger = logging.getLogger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="OJ Backend (MVP)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://35.216.0.27:3000",  # GCE 외부 IP:3000 추가
    ],
    allow_credentials=False,
    allow_methods=["*"],   # OPTIONS 포함
    allow_headers=["*"],   # Authorization, Content-Type 등
)
# ---------- 인증 스키마 ----------
class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=8)
    password_confirm: str

    @field_validator("password_confirm")
    @classmethod
    def pw_match(cls, v, info):
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("passwords_do_not_match")
        return v

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class MeOut(BaseModel):
    id: int
    email: EmailStr
    username: str | None = None
    role: str
    is_verified: bool

class TeacherAssignIn(BaseModel):
    teacher_id: int
    student_id: int

class ClassCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)

class ClassStudentAddIn(BaseModel):
    student_email: EmailStr

class ClassTeacherAddIn(BaseModel):
    teacher_email: EmailStr

class ClassProblemAssignIn(BaseModel):
    problem_id: int | None = None
    new_problem: ProblemCreate | None = None

    @model_validator(mode="after")
    def validate_choice(cls, values):
        pid = values.problem_id
        newp = values.new_problem
        if (pid is None and newp is None) or (pid is not None and newp is not None):
            raise ValueError("Provide either problem_id or new_problem")
        return values

def _str_to_bool(val: str | None, default: bool = False) -> bool:
    if val is None or val == "":
        return default
    return val.strip().lower() in {"1", "true", "yes", "y"}


def ensure_role(me: MeOut, allowed: set[str]):
    if me.role not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def can_access_student(me: MeOut, student_id: int) -> bool:
    if me.id == student_id:
        return True
    if me.role == "admin":
        return True
    if me.role == "teacher" and logic.teacher_can_access_student(me.id, student_id):
        return True
    return False

def get_current_user(authorization: str | None = Header(default=None)) -> MeOut:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    data = decode_access_token(token, JWT_SECRET)
    if not data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    row = get_user_by_email(data.email)
    if not row or row[0] != data.user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    uid, email, _, role, username, is_verified = row
    return MeOut(id=uid, email=email, username=username, role=role, is_verified=is_verified)

def get_optional_user(authorization: str | None = Header(default=None)) -> MeOut | None:
    if not authorization:
        return None
    return get_current_user(authorization=authorization)

def _format_sample_value(raw: str) -> tuple[str, bool]:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw, False

    def fmt(obj):
        if obj is None:
            return "null"
        if isinstance(obj, bool):
            return "true" if obj else "false"
        if isinstance(obj, (int, float)):
            return str(obj)
        if isinstance(obj, str):
            return obj
        if isinstance(obj, list):
            if all(isinstance(x, (int, float, str, bool)) or x is None for x in obj):
                return " ".join(fmt(x) for x in obj)
            return "\n".join(fmt(x) for x in obj)
        if isinstance(obj, dict):
            if set(obj.keys()).issubset({"args", "kwargs"}):
                lines = []
                for v in obj.get("args", []):
                    lines.append(fmt(v))
                for k, v in obj.get("kwargs", {}).items():
                    lines.append(f"{k}={fmt(v)}")
                return "\n".join(lines)
            return json.dumps(obj, ensure_ascii=False, indent=2)
        return str(obj)

    return fmt(data), True

def _parse_csv_testcases(content: bytes):
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded") from None

    reader = csv.DictReader(io.StringIO(text))
    required_cols = {"idx", "input_text", "expected_text"}
    if not required_cols.issubset({(col or "").strip() for col in reader.fieldnames or []}):
        raise HTTPException(status_code=400, detail=f"CSV must contain headers: {', '.join(sorted(required_cols))}")

    cases = []
    seen_idx = set()
    for row in reader:
        line_no = reader.line_num
        try:
            idx_val = int(row.get("idx", "").strip())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Line {line_no}: idx must be an integer")
        if idx_val in seen_idx:
            raise HTTPException(status_code=400, detail=f"Line {line_no}: duplicate idx {idx_val} in upload")
        seen_idx.add(idx_val)

        input_text = row.get("input_text")
        expected_text = row.get("expected_text")
        if input_text is None or expected_text is None:
            raise HTTPException(status_code=400, detail=f"Line {line_no}: input_text and expected_text are required")
        input_text = input_text.strip("\n")
        expected_text = expected_text.strip("\n")
        timeout_raw = row.get("timeout_ms", "").strip()
        points_raw = row.get("points", "").strip()
        try:
            timeout_ms = int(timeout_raw) if timeout_raw else 2000
            points = int(points_raw) if points_raw else 1
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Line {line_no}: timeout_ms/points must be integers")
        is_public = _str_to_bool(row.get("is_public"), default=False)

        cases.append(
            {
                "idx": idx_val,
                "input_text": input_text,
                "expected_text": expected_text,
                "timeout_ms": timeout_ms,
                "points": points,
                "is_public": is_public,
            }
        )

    if not cases:
        raise HTTPException(status_code=400, detail="CSV contains no data rows")
    return cases

# ---------- 인증 라우트 ----------
DEV_ECHO_VERIFY_TOKEN = os.getenv("DEV_ECHO_VERIFY_TOKEN", "1") == "1"  # 개발용: 토큰을 응답에 노출
VERIFY_BASE_URL = os.getenv("VERIFY_BASE_URL", "http://127.0.0.1:8000")


def build_verify_url(token: str) -> str:
    base = VERIFY_BASE_URL.rstrip("/")
    return f"{base}/auth/verify?token={token}"

@app.post("/auth/register")
def api_register(inp: RegisterIn):
    if get_user_by_email(inp.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    uid, token, exp = create_user_with_verify(inp.email, inp.username, inp.password)
    verify_url = build_verify_url(token)

    smtp_configured = is_smtp_configured()
    smtp_error: Exception | None = None

    if smtp_configured:
        try:
            send_verify_email(inp.email, verify_url)
        except SMTPConfigError as cfg_err:
            logger.error("SMTP configuration error: %s", cfg_err)
            smtp_error = cfg_err
        except Exception as send_err:  # pragma: no cover - defensive
            logger.exception("Failed to send verification email")
            smtp_error = send_err

        if smtp_error and not DEV_ECHO_VERIFY_TOKEN:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to send verification email: {smtp_error}",
            )
    elif not DEV_ECHO_VERIFY_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="SMTP is not configured; cannot send verification email.",
        )

    # 실제 운영: 여기서 이메일 발송(smtp)로 토큰 링크 전달
    # dev 모드: 응답에 토큰/만료를 포함해서 프론트에서 바로 확인 가능
    payload = {"user_id": uid, "email": inp.email, "verify_expires": exp.isoformat()}
    if smtp_error:
        payload["email_delivery"] = "failed"
        payload["email_error"] = str(smtp_error)
    elif smtp_configured:
        payload["email_delivery"] = "sent"
    else:
        payload["email_delivery"] = "dev_echo"
    if DEV_ECHO_VERIFY_TOKEN:
        payload["verify_token"] = token
        payload["verify_url"] = verify_url
    return payload

@app.get("/auth/verify")
def api_verify(token: str):
    ok = consume_verify_token(token)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"detail": "Email verified. You can now login."}

@app.post("/auth/login", response_model=TokenOut)
def api_login(inp: LoginIn):
    row = get_user_by_email(inp.email)
    if not row or not verify_password(inp.password, row[2]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # row: id, email, pwd_hash, role, username, is_verified
    if not row[5]:
        raise HTTPException(status_code=401, detail="Email not verified")
    token = create_access_token(row[0], row[1], os.getenv("JWT_SECRET", "dev-secret"), int(os.getenv("JWT_EXPIRE_MINUTES","60")))
    return TokenOut(access_token=token)

@app.get("/me", response_model=MeOut)
def api_me(me: MeOut = Depends(get_current_user)):
    # get_current_user를 username/is_verified까지 채우도록 살짝 수정
    # (간단히 다시 조회)
    row = get_user_by_email(me.email)
    return MeOut(id=row[0], email=row[1], username=row[4], role=row[3], is_verified=row[5])

# ---------- 제출 생성 라우트 수정 ----------

@app.post("/submissions")
def api_create_submission(data: SubmissionCreate, me: MeOut = Depends(get_current_user)):
    sid = logic.create_submission(me.id, data)   # ← 더 이상 FAKE_USER_ID 안 씀
    # 즉시 상태 반환(프론트 폴링용)
    return {"submission_id": sid, "status": "queued"}

# ---------- 문제 목록 및 상세 ----------
from backend.db import DB
from typing import List

class Problem(BaseModel):
    id: int
    slug: str
    title: str
    difficulty: str

@app.get("/problems", response_model=List[Problem])
def list_problems():
    """모든 문제 목록 (공개)"""
    with DB() as cur:
        cur.execute("""
            SELECT id, slug, title, difficulty
            FROM problems p
            WHERE NOT EXISTS (
                SELECT 1 FROM class_problems cp WHERE cp.problem_id = p.id
            )
            ORDER BY id
        """)
        rows = cur.fetchall()
        return [Problem(id=r[0], slug=r[1], title=r[2], difficulty=r[3]) for r in rows]


class ProblemDetail(Problem):
    statement_md: str
    public_samples: list[dict]
    expects_json: bool = False

@app.get("/problems/{pid}", response_model=ProblemDetail)
def get_problem(pid: int, me: MeOut | None = Depends(get_optional_user)):
    """특정 문제 상세 (공개 + 공개 샘플만)"""
    with DB() as cur:
        cur.execute(
            "SELECT id, slug, title, difficulty, statement_md FROM problems WHERE id=%s",
            (pid,),
        )
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Problem not found")

        class_ids = logic.problem_class_ids(pid)
        if class_ids:
            if not me:
                raise HTTPException(status_code=401, detail="Authentication required")
            allowed = False
            if me.role == "admin":
                allowed = True
            elif me.role == "teacher" and logic.teacher_has_problem_access(me.id, pid):
                allowed = True
            elif me.role == "student" and logic.student_has_problem_access(me.id, pid):
                allowed = True
            if not allowed:
                raise HTTPException(status_code=403, detail="Forbidden")

        cur.execute(
            """
            SELECT idx, input_text, expected_text
            FROM testcases
            WHERE problem_id=%s AND is_public=true
            ORDER BY idx
            """,
            (pid,),
        )
        samples_db = cur.fetchall()
        samples: list[dict] = []
        expects_json = False
        for t in samples_db:
            input_text = t[1]
            expected_text = t[2]
            rendered_input, was_json_in = _format_sample_value(input_text)
            rendered_expected, was_json_out = _format_sample_value(expected_text)
            if was_json_in or was_json_out:
                expects_json = True
            samples.append({
                "idx": t[0],
                "input_text": rendered_input,
                "expected_text": rendered_expected,
            })

        return ProblemDetail(
            id=r[0],
            slug=r[1],
            title=r[2],
            difficulty=r[3],
            statement_md=r[4],
            public_samples=samples,
            expects_json=expects_json,
        )

# ---------- 관리자/교사 기능 ----------
@app.get("/admin/problems", response_model=List[Problem])
def admin_list_public_problems(me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"admin"})
    probs = logic.list_problems()
    return [Problem(**p) for p in probs]

@app.post("/admin/problems")
def admin_create_problem(data: ProblemCreate, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"admin"})
    pid = logic.create_problem(data, author_id=me.id)
    return {"problem_id": pid}

@app.delete("/admin/problems/{pid}")
def admin_delete_problem(pid: int, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"admin"})
    logic.delete_problem(pid)
    return {"detail": "problem_deleted"}

@app.post("/admin/teacher-assign")
def admin_assign_teacher(payload: TeacherAssignIn, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"admin"})
    if payload.teacher_id == payload.student_id:
        raise HTTPException(status_code=400, detail="Teacher and student must be different")
    teacher = get_user_by_id(payload.teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if teacher[3] not in ("teacher", "admin"):
        raise HTTPException(status_code=400, detail="Target user is not a teacher")
    student = get_user_by_id(payload.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student[3] != "student":
        raise HTTPException(status_code=400, detail="Target user is not a student")
    logic.assign_student_to_teacher(payload.teacher_id, payload.student_id)
    return {"detail": "assigned"}

@app.get("/teacher/students/{student_id}/submissions")
def teacher_student_submissions(student_id: int, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    student = get_user_by_id(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student[3] != "student":
        raise HTTPException(status_code=400, detail="Target user is not a student")
    if me.role == "teacher" and not logic.teacher_can_access_student(me.id, student_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    submissions = logic.list_submissions_for_student(student_id)
    return {
        "student_id": student_id,
        "student_email": student[1],
        "student_username": student[4],
        "submissions": [_serialize_submission_dict(s) for s in submissions],
    }

@app.post("/teacher/classes")
def teacher_create_class(data: ClassCreateIn, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Class name is required")
    description = data.description.strip() if data.description else None
    owner_id = me.id
    created = logic.create_class(name, description, owner_id)
    cls = logic.get_class(created["id"])
    return {
        "class_id": created["id"],
        "code": created["code"],
        "name": cls["name"],
        "description": cls["description"],
        "created_at": _to_iso(cls["created_at"]),
    }

@app.get("/teacher/classes")
def teacher_list_classes(me: MeOut = Depends(get_current_user), teacher_id: int | None = None):
    ensure_role(me, {"teacher", "admin"})
    target_teacher = teacher_id if (me.role == "admin" and teacher_id) else me.id
    classes = logic.list_classes_for_teacher(target_teacher)
    return [
        {
            "id": c["id"],
            "name": c["name"],
            "code": c["code"],
            "description": c["description"],
            "created_at": _to_iso(c["created_at"]),
            "student_count": c["student_count"],
        }
        for c in classes
    ]

@app.get("/teacher/classes/{class_id}")
def teacher_get_class(class_id: int, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    students = logic.list_class_students(class_id)
    teachers = logic.list_class_teachers(class_id)
    return {
        "id": cls["id"],
        "code": cls["code"],
        "name": cls["name"],
        "description": cls["description"],
        "created_at": _to_iso(cls["created_at"]),
        "teachers": teachers,
        "students": students,
    }

@app.post("/teacher/classes/{class_id}/students")
def teacher_add_student_to_class(class_id: int, payload: ClassStudentAddIn, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    student = get_user_by_email(payload.student_email)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student[3] != "student":
        raise HTTPException(status_code=400, detail="Target user is not a student")
    logic.add_student_to_class(class_id, student[0])
    return {"detail": "student_added", "student_id": student[0]}

@app.post("/teacher/classes/{class_id}/teachers")
def teacher_add_teacher_to_class(class_id: int, payload: ClassTeacherAddIn, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    teacher = get_user_by_email(payload.teacher_email)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if teacher[3] not in ("teacher", "admin"):
        raise HTTPException(status_code=400, detail="Target user is not a teacher")
    logic.add_teacher_to_class(class_id, teacher[0])
    return {"detail": "teacher_added", "teacher_id": teacher[0]}

@app.delete("/teacher/classes/{class_id}")
def teacher_delete_class(class_id: int, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    logic.delete_class(class_id)
    return {"detail": "class_deleted"}

@app.get("/teacher/classes/{class_id}/problems")
def teacher_list_class_problems(class_id: int, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    problems = logic.list_class_problems(class_id)
    return [
        {
            "id": p["id"],
            "slug": p["slug"],
            "title": p["title"],
            "difficulty": p["difficulty"],
            "assigned_at": _to_iso(p["assigned_at"]),
            "assigned_by": p["assigned_by"],
            "assigned_by_name": p["assigned_by_name"],
        }
        for p in problems
    ]

@app.post("/teacher/classes/{class_id}/problems")
def teacher_add_problem_to_class(class_id: int, payload: ClassProblemAssignIn, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    problem_id = payload.problem_id
    if payload.new_problem:
        problem_id = logic.create_problem(payload.new_problem, author_id=me.id)
    else:
        prob = logic.get_problem(problem_id)
        if not prob:
            raise HTTPException(status_code=404, detail="Problem not found")

    logic.add_problem_to_class(class_id, problem_id, me.id)
    return {"detail": "problem_assigned", "problem_id": problem_id}

@app.delete("/teacher/classes/{class_id}/problems/{problem_id}")
def teacher_remove_problem_from_class(class_id: int, problem_id: int, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not logic.class_has_problem(class_id, problem_id):
        raise HTTPException(status_code=404, detail="Problem not in class")
    logic.remove_problem_from_class(class_id, problem_id)
    return {"detail": "problem_removed"}

@app.get("/student/classes")
def student_list_classes(me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"student"})
    classes = logic.list_classes_for_student(me.id)
    return [
        {
            "id": c["id"],
            "name": c["name"],
            "code": c["code"],
            "description": c["description"],
            "created_at": _to_iso(c["created_at"]),
        }
        for c in classes
    ]

@app.get("/student/classes/{class_id}")
def student_get_class(class_id: int, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"student"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if not logic.student_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    problems = logic.list_class_problems(class_id)
    teachers = logic.list_class_teachers(class_id)
    return {
        "id": cls["id"],
        "name": cls["name"],
        "code": cls["code"],
        "description": cls["description"],
        "created_at": _to_iso(cls["created_at"]),
        "teachers": teachers,
        "problems": [
            {
                "id": p["id"],
                "slug": p["slug"],
                "title": p["title"],
                "difficulty": p["difficulty"],
            }
            for p in problems
        ],
    }

@app.get("/problems/{pid}/my-submissions")
def get_my_submissions(pid: int, me: MeOut = Depends(get_current_user)):
    class_ids = logic.problem_class_ids(pid)
    if class_ids:
        allowed = False
        if me.role == "admin":
            allowed = True
        elif me.role == "teacher" and logic.teacher_has_problem_access(me.id, pid):
            allowed = True
        elif me.role == "student" and logic.student_has_problem_access(me.id, pid):
            allowed = True
        if not allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
    submissions = logic.list_user_submissions_for_problem(me.id, pid, limit=15)
    solved = logic.user_solved_problem(me.id, pid)
    return {
        "solved": solved,
        "submissions": [
            {
                "id": s["id"],
                "status": s["status"],
                "score": s["score"],
                "time_ms": s["time_ms"],
                "created_at": _to_iso(s["created_at"]),
                "finished_at": _to_iso(s["finished_at"]),
            }
            for s in submissions
        ],
    }
@app.post("/teacher/classes/{class_id}/problems/{problem_id}/testcases/upload")
async def teacher_upload_testcases(
    class_id: int,
    problem_id: int,
    replace: bool = Form(True),
    file: UploadFile = File(...),
    me: MeOut = Depends(get_current_user),
):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not logic.class_has_problem(class_id, problem_id):
        raise HTTPException(status_code=400, detail="Problem is not assigned to this class")

    content = await file.read()
    cases = _parse_csv_testcases(content)

    logic.store_problem_testcases(problem_id, cases, replace_existing=replace)
    return {"detail": "testcases_uploaded", "count": len(cases), "replace_existing": replace}

@app.post("/admin/problems/{problem_id}/testcases/upload")
async def admin_upload_testcases(
    problem_id: int,
    replace: bool = Form(True),
    file: UploadFile = File(...),
    me: MeOut = Depends(get_current_user),
):
    ensure_role(me, {"admin"})
    content = await file.read()
    cases = _parse_csv_testcases(content)
    logic.store_problem_testcases(problem_id, cases, replace_existing=replace)
    return {"detail": "testcases_uploaded", "count": len(cases), "replace_existing": replace}

@app.get("/teacher/classes/{class_id}/submissions")
def teacher_list_class_submissions(class_id: int, me: MeOut = Depends(get_current_user)):
    ensure_role(me, {"teacher", "admin"})
    cls = logic.get_class(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if me.role == "teacher" and not logic.teacher_in_class(me.id, class_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    submissions = logic.list_class_submissions(class_id)
    return [
        {
            "submission_id": s["submission_id"],
            "status": s["status"],
            "score": s["score"],
            "time_ms": s["time_ms"],
            "created_at": _to_iso(s["created_at"]),
            "finished_at": _to_iso(s["finished_at"]),
            "student_id": s["student_id"],
            "student_username": s["student_username"] or s["student_email"],
            "student_email": s["student_email"],
            "problem_id": s["problem_id"],
            "problem_title": s["problem_title"],
            "problem_slug": s["problem_slug"],
        }
        for s in submissions
    ]
# ---------- 제출 조회/결과 ----------
from datetime import timezone

def _to_iso(dt):
    if not dt:
        return None
    if dt.tzinfo:
        return dt.astimezone(timezone.utc).isoformat()
    return dt.replace(tzinfo=timezone.utc).isoformat()

def _row_to_submission(r):
    # r: id,status,score,time_ms,created_at,finished_at,user_id
    return {
        "id": r[0],
        "status": r[1],
        "score": r[2],
        "time_ms": r[3],
        "created_at": _to_iso(r[4]),
        "finished_at": _to_iso(r[5]),
    }


def _serialize_submission_dict(d: dict):
    return {
        "id": d["id"],
        "problem_id": d["problem_id"],
        "status": d["status"],
        "score": d["score"],
        "time_ms": d["time_ms"],
        "created_at": _to_iso(d["created_at"]),
        "finished_at": _to_iso(d["finished_at"]),
    }

@app.get("/submissions/{sid}")
def api_get_submission(sid: int, me: MeOut = Depends(get_current_user)):
    with DB() as cur:
        cur.execute("""
            SELECT id, status, score, time_ms, created_at, finished_at, user_id
            FROM submissions
            WHERE id=%s
        """, (sid,))
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Submission not found")
        owner_id = r[6]
        if not can_access_student(me, owner_id):
            raise HTTPException(status_code=403, detail="Forbidden")
        return _row_to_submission(r)

@app.get("/submissions/{sid}/results")
def api_get_submission_results(sid: int, me: MeOut = Depends(get_current_user)):
    with DB() as cur:
        # 권한 체크
        cur.execute("SELECT user_id FROM submissions WHERE id=%s", (sid,))
        rr = cur.fetchone()
        if not rr:
            raise HTTPException(status_code=404, detail="Submission not found")
        owner_id = rr[0]
        if not can_access_student(me, owner_id):
            raise HTTPException(status_code=403, detail="Forbidden")

        cur.execute("""
            SELECT t.idx, r.verdict, r.time_ms, r.stdout, r.stderr
            FROM submission_results r
            JOIN testcases t ON r.testcase_id = t.id
            WHERE r.submission_id = %s
            ORDER BY t.idx
        """, (sid,))
        rows = cur.fetchall()
        return [
            {"idx": x[0], "verdict": x[1], "time_ms": x[2], "stdout": x[3], "stderr": x[4]}
            for x in rows
        ]
