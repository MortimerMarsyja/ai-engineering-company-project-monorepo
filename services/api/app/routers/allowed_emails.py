"""Registration-whitelist router — admin only.

GET    /allowed-emails        list every whitelisted email
POST   /allowed-emails        whitelist a new email
DELETE /allowed-emails/{id}   remove an email from the whitelist

Only `admin` may use any of these (`require_admin`, stricter than the
`require_staff` gate used elsewhere — a manager must not be able to open
up registration). The whitelist itself is enforced by
app/routers/users.py::register_user.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_admin
from app.models.allowed_email import AllowedEmailCreate, AllowedEmailResponse
from app.models.schemas import ApiResponse
from app.services import allowed_emails as allowed_emails_service

router = APIRouter(prefix="/allowed-emails", tags=["allowed-emails"])


@router.get("/", response_model=ApiResponse[list[AllowedEmailResponse]])
async def list_allowed_emails(current_user: dict = Depends(require_admin)):
    entries = allowed_emails_service.list_allowed_emails()
    return ApiResponse(message=f"Found {len(entries)} allowed email(s)", data=entries)


@router.post("/", response_model=ApiResponse[AllowedEmailResponse], status_code=201)
async def add_allowed_email(
    payload: AllowedEmailCreate,
    current_user: dict = Depends(require_admin),
):
    try:
        entry = allowed_emails_service.add_allowed_email(payload.email, added_by=current_user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return ApiResponse(message="Email added to the allowed list", data=entry)


@router.delete("/{entry_id}", response_model=ApiResponse[None])
async def remove_allowed_email(entry_id: UUID, current_user: dict = Depends(require_admin)):
    if not allowed_emails_service.remove_allowed_email(entry_id):
        raise HTTPException(status_code=404, detail="Allowed email entry not found")
    return ApiResponse(message="Email removed from the allowed list")
