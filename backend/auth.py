# backend/auth.py
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
import secrets
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
        cur.execute("""
            SELECT
                id,          
                email,        
                pwd_hash,    
                role,        
                username,     
                is_verified
            FROM users
            WHERE email=%s
        """, (email,))
        return cur.fetchone()

def get_user_by_id(user_id: int):
    with DB() as cur:
        cur.execute("""
            SELECT
                id,
                email,
                pwd_hash,
                role,
                username,
                is_verified
            FROM users
            WHERE id=%s
        """, (user_id,))
        return cur.fetchone()

def create_user_with_verify(email: str, username: str, pw_plain: str, *, ttl_minutes=30):
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    with DB() as cur:
        cur.execute("""
            INSERT INTO users(email, pwd_hash, role, username, is_verified, verify_token, verify_expires)
            VALUES (%s, %s, 'student', %s, false, %s, %s)
            RETURNING id
        """, (email, hash_password(pw_plain), username, token, expires))
        uid = cur.fetchone()[0]
    return uid, token, expires

def consume_verify_token(token: str) -> bool:
    now = datetime.now(timezone.utc)
    with DB() as cur:
        cur.execute("""
            SELECT id, verify_expires FROM users WHERE verify_token=%s
        """, (token,))
        row = cur.fetchone()
        if not row:
            return False
        uid, exp = row
        if not exp or exp < now:
            return False
        cur.execute("""
            UPDATE users
            SET is_verified=true, verify_token=NULL, verify_expires=NULL
            WHERE id=%s
        """, (uid,))
        return True
