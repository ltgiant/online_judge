# backend/auth.py
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

from backend.db import DB  # 당신의 DB 컨텍스트 래퍼

pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

class TokenData(BaseModel):
    user_id: int
    email: EmailStr
    exp: int

def hash_password(pw: str) -> str:
    return pwd_ctx.hash(pw)

def verify_password(pw: str, hashed: str) -> bool:
    return pwd_ctx.verify(pw, hashed)

def create_access_token(user_id: int, email: str, secret: str, minutes: int) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {"user_id": user_id, "email": email, "exp": now + timedelta(minutes=minutes)}
    return jwt.encode(payload, secret, algorithm="HS256")

def decode_access_token(token: str, secret: str) -> Optional[TokenData]:
    try:
        data = jwt.decode(token, secret, algorithms=["HS256"])
        return TokenData(**data)
    except JWTError:
        return None

def get_user_by_email(email: str):
    with DB() as cur:
        cur.execute("SELECT id, email, pwd_hash, role FROM users WHERE email=%s", (email,))
        row = cur.fetchone()
        return row  # (id, email, pwd_hash, role) or None

def create_user(email: str, pw_plain: str) -> int:
    with DB() as cur:
        cur.execute(
            "INSERT INTO users(email, pwd_hash, role) VALUES (%s,%s,'student') RETURNING id",
            (email, hash_password(pw_plain))
        )
        return cur.fetchone()[0]