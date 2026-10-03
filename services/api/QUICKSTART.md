# Backend Quick Start - Cheat Sheet

A one-page reference for common commands and workflows.

## First Time Setup

```bash
# 1. Navigate to backend
cd services/api

# 2. Create virtual environment
python3 -m venv .venv

# 3. Activate it
source .venv/bin/activate              # Mac/Linux
.venv\Scripts\activate                 # Windows

# 4. Install dependencies
pip install -r requirements.txt

# 5. (Optional) Copy environment variables
cp .env.example .env

# 6. Populate test data
python seed.py

# 7. Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Daily Workflow

```bash
# Start working
cd services/api
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Visit in browser
open http://localhost:8000/docs
```

## Essential Commands

```bash
# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Start server on different port
uvicorn app.main:app --reload --port 8001

# Stop server
Ctrl + C

# Populate test data (seeders)
python seed.py           # Add suppliers
python seed_users.py     # Add users

# Reset database with fresh test data
rm db.json && python seed.py && python seed_users.py

# Run tests
pytest tests/ -v

# Install new package
pip install package-name
pip freeze > requirements.txt

# Deactivate virtual environment
deactivate
```

**📖 Seeders:** See [SEEDERS.md](./SEEDERS.md) for all test credentials and detailed seeding guide.

## Useful URLs

| URL | Purpose |
|-----|---------|
| http://localhost:8000/docs | Interactive API docs (Swagger) |
| http://localhost:8000/redoc | Alternative API docs (ReDoc) |
| http://localhost:8000/health | Health check endpoint |

## File Quick Reference

| Path | Purpose |
|------|---------|
| `app/main.py` | Application entry point |
| `app/routers/*.py` | API endpoints |
| `app/services/*.py` | Business logic |
| `app/models/schemas.py` | Data validation models |
| `app/core/config.py` | Settings & environment variables |
| `app/core/security.py` | Password & JWT functions |
| `db.json` | Database (can open in any text editor) |
| `requirements.txt` | Python dependencies |
| `.env` | Environment variables |

## Adding a New Endpoint - Template

### 1. Add to Router

```python
# app/routers/users.py

@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    """Get user statistics."""
    stats = users_service.get_statistics()
    return {"data": stats}
```

### 2. Add to Service

```python
# app/services/users.py

def get_statistics():
    """Calculate user statistics."""
    db = _get_db()
    users = db.table(USERS_TABLE).all()

    return {
        "total": len(users),
        "active": len([u for u in users if u.get("is_active")])
    }
```

### 3. Test It

Visit: `http://localhost:8000/api/v1/users/stats`

## Common Errors & Solutions

| Error | Solution |
|-------|----------|
| `command not found: uvicorn` | Activate virtual environment: `source .venv/bin/activate` |
| `Address already in use` | Kill process: `lsof -ti:8000 \| xargs kill -9` |
| `Module not found` | Install dependencies: `pip install -r requirements.txt` |
| Changes not reflecting | Check `--reload` flag or restart server |
| Backend not running | Start: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` |

## API Endpoint Patterns

All endpoints follow the pattern: `http://localhost:8000/api/v1/{resource}`

### Authentication (No Auth Required)
```bash
POST   /api/v1/auth/login           # Login
POST   /api/v1/auth/forgot-password # Request reset
POST   /api/v1/auth/reset-password  # Reset with token
```

### Protected Endpoints (Auth Required)
```bash
GET    /api/v1/auth/me              # Current user info

GET    /api/v1/users                # List users
POST   /api/v1/users                # Create user
GET    /api/v1/users/{id}           # Get user
PUT    /api/v1/users/{id}           # Update user
DELETE /api/v1/users/{id}           # Delete user

GET    /api/v1/profiles/me          # Get profile
PATCH  /api/v1/profiles/me          # Update profile

GET    /api/v1/records              # List candidates
POST   /api/v1/records              # Create candidate
GET    /api/v1/records/{id}         # Get candidate
PATCH  /api/v1/records/{id}         # Update status/stage
DELETE /api/v1/records/{id}         # Delete candidate

GET    /api/v1/records/{id}/notes   # Get notes
POST   /api/v1/records/{id}/notes   # Add note
```

## Testing with curl

```bash
# Health check
curl http://localhost:8000/health

# Login (get token)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}'

# Use token
curl http://localhost:8000/api/v1/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Database Quick Reference

```bash
# View database
cat db.json
# or
open db.json

# Backup database
cp db.json db.backup.json

# Reset database
rm db.json
python seed.py

# Database structure
{
  "users": [...],
  "profiles": [...],
  "suppliers": [...],
  "incidents": [...],
  "records": [...],
  "candidate_notes": [...]
}
```

## Debugging Tips

1. **Check server logs** - Look at terminal where uvicorn is running
2. **Use API docs** - http://localhost:8000/docs to test endpoints
3. **Inspect database** - Open db.json to see actual data
4. **Read error messages** - FastAPI gives detailed validation errors
5. **Check JWT token** - Decode at https://jwt.io to see contents

## Virtual Environment Tips

```bash
# Check if activated
which python           # Should show .venv/bin/python

# See installed packages
pip list

# See outdated packages
pip list --outdated

# Freeze current state
pip freeze > requirements.txt
```

## Project Structure (Visual)

```
services/api/
├── app/
│   ├── main.py           ← Start here
│   ├── core/             ← Config, security, dependencies
│   ├── models/           ← Data validation schemas
│   ├── routers/          ← API endpoints
│   └── services/         ← Business logic
├── tests/                ← Automated tests
├── db.json              ← Database
├── requirements.txt     ← Dependencies
└── .env                 ← Configuration
```

## Need More Help?

- **Full documentation:** See `README.md`
- **Architecture details:** See `ARCHITECTURE.md`
- **FastAPI docs:** https://fastapi.tiangolo.com/
- **Python tutorial:** https://docs.python.org/3/tutorial/

---

**Remember:** Always activate the virtual environment before working!
