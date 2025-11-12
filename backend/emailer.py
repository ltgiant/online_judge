import os
import smtplib
from email.message import EmailMessage


class SMTPConfigError(RuntimeError):
    """Raised when mandatory SMTP settings are missing."""


def _smtp_config():
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    from_addr = os.getenv("SMTP_FROM", user)
    use_starttls = os.getenv("SMTP_STARTTLS", "1") == "1"

    if not host:
        raise SMTPConfigError("SMTP_HOST is not configured.")
    if not from_addr:
        raise SMTPConfigError("SMTP_FROM or SMTP_USER must be configured.")
    if user and not password:
        raise SMTPConfigError("SMTP_PASS must be configured when SMTP_USER is set.")

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_addr": from_addr,
        "use_starttls": use_starttls,
    }


def send_verify_email(to_email: str, verify_url: str):
    cfg = _smtp_config()

    msg = EmailMessage()
    msg["Subject"] = "Verify your account"
    msg["From"] = cfg["from_addr"]
    msg["To"] = to_email
    msg.set_content(
        f"Click the link to verify your account:\n\n{verify_url}\n\nThis link expires soon."
    )

    with smtplib.SMTP(cfg["host"], cfg["port"]) as smtp:
        if cfg["use_starttls"]:
            smtp.starttls()
        if cfg["user"]:
            smtp.login(cfg["user"], cfg["password"])
        smtp.send_message(msg)
