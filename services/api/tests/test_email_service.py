"""Unit tests for the transactional email service — the external API call
is mocked; we assert on our own wrapping/error-handling logic, not on
Resend's wire behavior."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.core.config import get_settings
from app.services.email import EmailDeliveryError, send_password_reset_email


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestSendPasswordResetEmail:
    def test_raises_when_api_key_missing(self, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "")
        with pytest.raises(EmailDeliveryError, match="not configured"):
            send_password_reset_email("user@example.com", "https://example.com/reset")

    def test_sends_with_expected_payload(self, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        with patch("app.services.email.resend.Emails.send") as mock_send:
            send_password_reset_email("user@example.com", "https://example.com/reset?token=abc")

        mock_send.assert_called_once()
        (payload,) = mock_send.call_args.args
        assert payload["to"] == ["user@example.com"]
        assert "https://example.com/reset?token=abc" in payload["html"]

    def test_wraps_sdk_failures_in_email_delivery_error(self, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        with patch("app.services.email.resend.Emails.send", side_effect=RuntimeError("network down")):
            with pytest.raises(EmailDeliveryError) as exc_info:
                send_password_reset_email("user@example.com", "https://example.com/reset")

        # The wrapping error must not leak the raw SDK exception text.
        assert "network down" not in str(exc_info.value)
        assert exc_info.value.__cause__ is not None
