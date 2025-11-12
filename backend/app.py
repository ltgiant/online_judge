# backend/app.py (중요 부분만 발췌/추가)
import os
from fastapi import FastAPI, Depends, HTTPException, status, Header
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime, timedelta, timezone
import secrets
from backend import logic
import logging

from backend.auth import (
    create_access_token,
    decode_access_token,
    get_user_by_email,
    verify_password,
    create_user_with_verify,
    consume_verify_token,
)
from backend.emailer import send_verify_email, SMTPConfigError

logger = logging.getLogger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="OJ Backend (MVP)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,     # 쿠키 안 쓰면 False
    allow_methods=["*"],         # 반드시 OPTIONS 포함
    allow_headers=["*"],         # Authorization, Content-Type 등 모두 허용
    max_age=86400,               # (선택) 프리플라이트 캐시
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

    smtp_host = (os.getenv("SMTP_HOST") or "").strip()
    smtp_error: Exception | None = None

    if smtp_host:
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
    elif smtp_host:
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
from backend.schemas import SubmissionCreate  # 기존 Pydantic 입력 모델

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
        cur.execute("SELECT id, slug, title, difficulty FROM problems ORDER BY id")
        rows = cur.fetchall()
        return [Problem(id=r[0], slug=r[1], title=r[2], difficulty=r[3]) for r in rows]


class ProblemDetail(Problem):
    statement_md: str
    public_samples: list[dict]

@app.get("/problems/{pid}", response_model=ProblemDetail)
def get_problem(pid: int):
    """특정 문제 상세 (공개 + 공개 샘플만)"""
    with DB() as cur:
        cur.execute(
            "SELECT id, slug, title, difficulty, statement_md FROM problems WHERE id=%s",
            (pid,),
        )
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Problem not found")

        cur.execute(
            """
            SELECT idx, input_text, expected_text
            FROM testcases
            WHERE problem_id=%s AND is_public=true
            ORDER BY idx
            """,
            (pid,),
        )
        samples = [
            {"idx": t[0], "input_text": t[1], "expected_text": t[2]}
            for t in cur.fetchall()
        ]

        return ProblemDetail(
            id=r[0],
            slug=r[1],
            title=r[2],
            difficulty=r[3],
            statement_md=r[4],
            public_samples=samples,
        )
# ---------- 제출 조회/결과 ----------
from datetime import timezone

def _row_to_submission(r):
    # r: id,status,score,time_ms,created_at,finished_at,user_id
    return {
        "id": r[0],
        "status": r[1],
        "score": r[2],
        "time_ms": r[3],
        "created_at": r[4].astimezone(timezone.utc).isoformat() if r[4] else None,
        "finished_at": r[5].astimezone(timezone.utc).isoformat() if r[5] else None,
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
        if r[6] != me.id and me.role != "admin":
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
        if rr[0] != me.id and me.role != "admin":
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
