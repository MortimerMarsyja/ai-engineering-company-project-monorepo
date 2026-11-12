"""Registration-whitelist domain models (admin-managed).

An entry here means that email is allowed to complete self-registration
via POST /api/v1/users. See app/routers/allowed_emails.py.
"""

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import EMAIL_PATTERN


class AllowedEmailCreate(BaseModel):
    email: str = Field(..., pattern=EMAIL_PATTERN)

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class AllowedEmailResponse(BaseModel):
    id: str
    email: str
    added_by: int | None
    created_at: str
    # True when an account with this email already exists — purely
    # informational, so an admin can tell "pending" entries apart from
    # ones whose owner already registered.
    registered: bool

    model_config = ConfigDict(from_attributes=True)
