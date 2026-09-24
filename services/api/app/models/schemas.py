"""Pydantic schemas for request / response contracts."""

from datetime import datetime

from pydantic import BaseModel, Field


# ── Health ────────────────────────────────────────────────
class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ── Generic API response wrapper ──────────────────────────
class ApiResponse(BaseModel):
    success: bool = True
    message: str = ""
    data: dict | list | None = None


# ── Example domain models (replace with your company models) ──
class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., pattern=r"^[\w.-]+@[\w.-]+\.\w+$")
    role: str = "member"


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
