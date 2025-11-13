import os
import smtplib
from email.message import EmailMessage

SMTP_TIMEOUT = int(os.getenv("SMTP_TIMEOUT", "10"))  # seconds


class SMTPConfigError(RuntimeError):
    """Raised when the SMTP sender is not fully configured or sending fails."""


def _smtp_config() -> dict:
    host = (os.getenv("SMTP_HOST") or "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    user = (os.getenv("SMTP_USER") or "").strip()
    password = os.getenv("SMTP_PASS")
    from_addr = (os.getenv("SMTP_FROM") or user).strip()
    use_starttls = os.getenv("SMTP_STARTTLS", "1") == "1"

    if not host:
        raise SMTPConfigError("SMTP_HOST is not configured.")
    if not from_addr:
        raise SMTPConfigError("SMTP_FROM or SMTP_USER must be configured.")
    if user and not (password or "").strip():
        raise SMTPConfigError("SMTP_PASS must be configured when SMTP_USER is set.")

    return {
        "host": host,
        "port": port,
        "user": user or None,
        "password": (password or "").strip() or None,
        "from_addr": from_addr,
        "use_starttls": use_starttls,
    }


def is_smtp_configured() -> bool:
    """Best-effort check; returns True only when mandatory fields are set."""
    try:
        _smtp_config()
    except SMTPConfigError:
        return False
    return True


def send_verify_email(to_email: str, verify_url: str):
    cfg = _smtp_config()

    msg = EmailMessage()
    msg["Subject"] = "Verify your Online Judge Account"
    msg["From"] = cfg["from_addr"]
    msg["To"] = to_email
    msg.set_content(
        f"Click the link to verify your account:\n\n{verify_url}\n\nThis link expires in a short time."
    )

    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=SMTP_TIMEOUT) as smtp:
            if cfg["use_starttls"]:
                smtp.starttls()
            if cfg["user"]:
                smtp.login(cfg["user"], cfg["password"])
            smtp.send_message(msg)
    except smtplib.SMTPException as exc:
        raise SMTPConfigError("SMTP send failed.") from exc
