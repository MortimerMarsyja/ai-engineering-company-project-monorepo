"""Transactional email delivery through Resend."""

import logging

import resend

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Raised when a transactional email could not be sent.

    The message is always safe to log; it never carries the recipient
    address or the underlying SDK/network exception's raw text, since
    that can embed request details we don't want duplicated in logs.
    """


def send_password_reset_email(email: str, reset_url: str) -> None:
    settings = get_settings()
    if not settings.RESEND_API_KEY:
        raise EmailDeliveryError("Email service is not configured (missing RESEND_API_KEY)")

    resend.api_key = settings.RESEND_API_KEY

    try:
        resend.Emails.send(
            {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [email],
                "subject": "Reset your Brasaland password",
                "html": (
                    "<h1>Reset your password</h1>"
                    "<p>Use the link below within 15 minutes to set a new password.</p>"
                    f'<p><a href="{reset_url}">Reset password</a></p>'
                    "<p>If you did not request this, you can ignore this email.</p>"
                ),
            }
        )
    except Exception as exc:
        # Network failure, Resend API error, bad response shape, etc. —
        # narrow to this one external call so nothing else in the caller
        # gets accidentally swallowed by a broader try/except.
        raise EmailDeliveryError("Failed to send password reset email") from exc