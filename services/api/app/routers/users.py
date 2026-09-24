"""Example users router — replace with your domain endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.models.schemas import ApiResponse, UserCreate, UserResponse

router = APIRouter(prefix="/users", tags=["users"])

# In-memory store for demo purposes — replace with a real DB
_users: list[dict] = []
_next_id: int = 1


@router.post("/", response_model=ApiResponse, status_code=201)
async def create_user(payload: UserCreate):
    """Create a new user."""
    global _next_id
    user = {
        "id": _next_id,
        **payload.model_dump(),
        "created_at": datetime.now(timezone.utc),
    }
    _users.append(user)
    _next_id += 1
    return ApiResponse(message="User created", data=UserResponse.model_validate(user).model_dump())


@router.get("/", response_model=ApiResponse)
async def list_users():
    """List all users."""
    return ApiResponse(
        data=[UserResponse.model_validate(u).model_dump() for u in _users]
    )


@router.get("/{user_id}", response_model=ApiResponse)
async def get_user(user_id: int):
    """Get a single user by ID."""
    for u in _users:
        if u["id"] == user_id:
            return ApiResponse(data=UserResponse.model_validate(u).model_dump())
    raise HTTPException(status_code=404, detail="User not found")


@router.delete("/{user_id}", response_model=ApiResponse)
async def delete_user(user_id: int):
    """Delete a user by ID."""
    global _users
    before = len(_users)
    _users = [u for u in _users if u["id"] != user_id]
    if len(_users) == before:
        raise HTTPException(status_code=404, detail="User not found")
    return ApiResponse(message="User deleted")
