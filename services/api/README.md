# Brasaland Backend API - Beginner's Guide

> A comprehensive guide to understanding and running the Brasaland Python backend API

## 📚 Documentation

- **[README.md](./README.md)** (this file) - Complete beginner's guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Visual diagrams and architecture deep dive
- **[QUICKSTART.md](./QUICKSTART.md)** - Quick reference and cheat sheet
- **[SEEDERS.md](./SEEDERS.md)** - Database seeding guide with all test credentials

## Table of Contents
- [What is This?](#what-is-this)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure Explained](#project-structure-explained)
- [How the Application Works](#how-the-application-works)
- [Available API Endpoints](#available-api-endpoints)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

---

## What is This?

This is the **backend API** for Brasaland, a restaurant management system. Think of it as the "brain" of the application that:
- Stores and manages data (users, suppliers, incidents, hiring candidates)
- Handles authentication (login/logout)
- Provides endpoints that the frontend (React/Next.js apps) can call to get or save data

**Technology Used:**
- **Python 3.10+**: The programming language
- **FastAPI**: A modern, fast web framework for building APIs
- **TinyDB**: A simple JSON-based database (perfect for development)
- **Uvicorn**: The server that runs the API

---

## Prerequisites

Before you start, you need to have these installed on your computer:

### 1. Python 3.10 or higher
**What it is:** The programming language used to write this backend.

**Check if you have it:**
```bash
python3 --version
```

**Install it:**
- **Mac:** `brew install python@3.10`
- **Windows:** Download from [python.org](https://www.python.org/downloads/)
- **Linux:** `sudo apt install python3.10`

### 2. pip (Python Package Manager)
**What it is:** A tool to install Python libraries (comes with Python).

**Check if you have it:**
```bash
pip --version
```

---

## Getting Started

Follow these steps **the first time** you set up the project:

### Step 1: Navigate to the API Directory
```bash
cd services/api
```

### Step 2: Create a Virtual Environment
**What is a virtual environment?** It's an isolated Python environment for this project, so dependencies don't conflict with other Python projects on your computer.

```bash
python3 -m venv .venv
```

This creates a `.venv` folder (you'll see it appear in your file explorer).

### Step 3: Activate the Virtual Environment

**On Mac/Linux:**
```bash
source .venv/bin/activate
```

**On Windows:**
```bash
.venv\Scripts\activate
```

**How to know it worked?** Your terminal prompt should now show `(.venv)` at the beginning.

### Step 4: Install Dependencies
**What are dependencies?** External libraries this project needs (FastAPI, Uvicorn, etc.).

```bash
pip install -r requirements.txt
```

This will install about 30+ packages. It might take a minute or two.

### Step 5: (Optional) Set Up Environment Variables
Environment variables are settings that change how the app runs.

```bash
# Copy the example file
cp .env.example .env

# Edit .env with your preferred text editor
# Most defaults work fine for development!
```

### Step 6: Run the Development Server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**What this command does:**
- `uvicorn`: The server program
- `app.main:app`: Tells it to run the `app` object from `app/main.py`
- `--reload`: Auto-restarts when you change code (great for development!)
- `--host 0.0.0.0`: Makes it accessible from other devices on your network
- `--port 8000`: Runs on port 8000

**Success looks like:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [12345] using WatchFiles
INFO:     Started server process [12346]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### Step 7: Test It!
Open your browser and visit:
- **API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

## Project Structure Explained

Here's what each folder and file does:

```
services/api/
├── app/                          # Main application code
│   ├── main.py                   # Entry point - creates the FastAPI app
│   ├── core/                     # Core functionality
│   │   ├── config.py            # Settings/configuration (reads .env)
│   │   ├── deps.py              # Dependencies (like auth checks)
│   │   └── security.py          # Password hashing, JWT tokens
│   ├── models/                   # Data structures
│   │   ├── schemas.py           # API request/response models
│   │   ├── user.py              # User-specific models
│   │   └── profile.py           # Profile-specific models
│   ├── routers/                  # API endpoints (routes)
│   │   ├── auth.py              # Login, logout, password reset
│   │   ├── health.py            # Health check endpoint
│   │   ├── users.py             # User management
│   │   ├── profiles.py          # User profile management
│   │   ├── suppliers.py         # Supplier management
│   │   ├── incidents.py         # Incident tracking
│   │   └── records.py           # Hiring pipeline candidates
│   └── services/                 # Business logic
│       ├── users.py             # User CRUD operations
│       ├── profiles.py          # Profile CRUD operations
│       ├── records.py           # Candidate CRUD operations
│       ├── incidents.py         # Incident analysis
│       ├── email.py             # Email sending
│       └── password_resets.py   # Password reset logic
├── tests/                        # Automated tests
│   ├── test_auth.py             # Authentication tests
│   ├── test_users.py            # User endpoint tests
│   └── ...
├── db.json                       # Database file (TinyDB JSON format)
├── requirements.txt              # Python dependencies list
├── .env.example                  # Example environment variables
├── seed.py                       # Script to populate test data
└── README.md                     # This file!
```

### Key Files Explained

#### `app/main.py` - The Entry Point
This file creates the FastAPI application and registers all the routers (endpoints).

```python
# Simplified version of what it does:
app = FastAPI()                    # Create the app
app.include_router(auth.router)    # Add /auth endpoints
app.include_router(users.router)   # Add /users endpoints
# ... and so on
```

#### `app/routers/*` - API Endpoints
Each file defines endpoints for a specific resource:

```python
# Example from routers/health.py
@router.get("/health")
async def health_check():
    return {"status": "ok"}
```

When you visit `http://localhost:8000/health`, this function runs.

#### `app/services/*` - Business Logic
Services contain the "how" of operations (database queries, data processing):

```python
# Example from services/users.py
def create_user(email, password):
    # 1. Hash the password
    # 2. Save to database
    # 3. Return the new user
```

Routers call services to do the actual work.

#### `app/models/schemas.py` - Data Validation
Defines what data looks like and validates it:

```python
class UserCreate(BaseModel):
    email: str
    password: str
    name: str | None = None
```

If someone tries to create a user without an email, FastAPI automatically rejects it.

#### `db.json` - The Database
A simple JSON file that stores all data. In production, you'd use PostgreSQL or MySQL, but TinyDB is great for learning!

---

## How the Application Works

### The Request Journey

Let's trace what happens when a user logs in:

```
1. Frontend sends POST request to /api/v1/auth/login
   ↓
2. FastAPI receives request at app/routers/auth.py
   ↓
3. Router validates data using models/schemas.py
   ↓
4. Router calls services/users.py to check credentials
   ↓
5. Service queries db.json using TinyDB
   ↓
6. Service verifies password using core/security.py
   ↓
7. Service generates JWT token
   ↓
8. Service returns token to router
   ↓
9. Router returns token to frontend
   ↓
10. Frontend stores token and uses it for future requests
```

### The Three-Layer Architecture

This backend uses a **layered architecture**:

```
┌─────────────────────────────────┐
│  ROUTERS (app/routers/)         │  ← Handles HTTP requests/responses
│  - Receives requests             │
│  - Validates input               │
│  - Returns responses             │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│  SERVICES (app/services/)       │  ← Contains business logic
│  - Processes data                │
│  - Talks to database             │
│  - Applies business rules        │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│  DATABASE (db.json)             │  ← Stores data
│  - TinyDB JSON storage           │
└─────────────────────────────────┘
```

**Why this separation?**
- **Routers** focus only on HTTP stuff (requests, responses)
- **Services** focus only on business logic (what to do with data)
- If you change the database, you only modify services, not routers
- If you change the API structure, you only modify routers, not services

### Authentication Flow

Protected endpoints require a JWT token:

```
1. User logs in → Gets JWT token
2. Frontend stores token
3. Frontend sends token in Authorization header: "Bearer <token>"
4. Backend validates token using core/deps.py
5. If valid → Request proceeds
6. If invalid → Returns 401 Unauthorized
```

---

## Available API Endpoints

All endpoints are prefixed with `/api/v1/` (e.g., `/api/v1/users`)

### Authentication (`/auth`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | Login with email/password | No |
| GET | `/auth/me` | Get current user info | Yes |
| POST | `/auth/forgot-password` | Request password reset | No |
| POST | `/auth/reset-password` | Reset password with token | No |

### Users (`/users`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/users` | Register new user | No |
| GET | `/users` | List all users | Yes |
| GET | `/users/{id}` | Get user by ID | Yes |
| PUT | `/users/{id}` | Update user | Yes (Staff only) |
| DELETE | `/users/{id}` | Delete user | Yes |

### Profiles (`/profiles`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/profiles/me` | Get current user's profile | Yes |
| PATCH | `/profiles/me` | Update current user's profile | Yes |
| POST | `/profiles/me/change-password` | Change password | Yes |

### Suppliers (`/suppliers`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/suppliers` | List all suppliers | Yes |
| POST | `/suppliers` | Create supplier | Yes |
| GET | `/suppliers/{id}` | Get supplier by ID | Yes |
| PUT | `/suppliers/{id}` | Update supplier | Yes |
| PATCH | `/suppliers/{id}/rate` | Update supplier rate | Yes |
| PATCH | `/suppliers/{id}/status` | Update supplier status | Yes |

### Incidents (`/incidents`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/incidents` | List incidents | Yes |
| POST | `/incidents` | Create incident | Yes |
| GET | `/incidents/{id}` | Get incident by ID | Yes |
| PUT | `/incidents/{id}` | Update incident | Yes |
| POST | `/incidents/analyze` | Analyze CSV file | Yes |

### Records - Hiring Pipeline (`/records`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/records` | List candidates (paginated) | Yes |
| POST | `/records` | Create candidate | Yes |
| GET | `/records/{id}` | Get candidate by ID | Yes |
| PUT | `/records/{id}` | Update candidate | Yes |
| PATCH | `/records/{id}` | Update status/stage | Yes |
| DELETE | `/records/{id}` | Delete candidate | Yes |
| GET | `/records/{id}/notes` | Get candidate notes | Yes |
| POST | `/records/{id}/notes` | Add note to candidate | Yes |
| DELETE | `/records/{id}/notes/{note_id}` | Delete note | Yes |

### Health Check
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/health` | Check if API is running | No |

**Interactive Docs:** Visit [http://localhost:8000/docs](http://localhost:8000/docs) to try all endpoints!

---

## Common Tasks

### Starting the Server (After Initial Setup)

```bash
# 1. Navigate to the API directory
cd services/api

# 2. Activate virtual environment
source .venv/bin/activate

# 3. Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Stopping the Server

Press `Ctrl + C` in the terminal where the server is running.

### Adding Test Data

Brasaland has **2 seeder scripts** to populate your database with test data:

```bash
# Seed suppliers (Brasa Points members)
python seed.py

# Seed users (admin, managers, regular users)
python seed_users.py
```

**Quick reset:**
```bash
rm db.json && python seed.py && python seed_users.py
```

**What gets created:**
- **seed.py**: 8 sample suppliers across Colombia and USA
- **seed_users.py**: 6 users with different roles
  - admin@brasaland.com / `Admin123!`
  - manager@brasaland.com / `Manager123!`
  - user1@brasaland.com / `User123!`

📖 **Detailed guide:** See [SEEDERS.md](./SEEDERS.md) for complete documentation, all credentials, and customization options.

### Viewing the Database

The database is just a JSON file! Open `db.json` in any text editor to see all data:

```bash
# Mac
open db.json

# Linux
xdg-open db.json

# Or just open it in VS Code
code db.json
```

### Adding a New Endpoint

Example: Adding a new endpoint to get user statistics

**1. Create the endpoint in a router:**

```python
# app/routers/users.py

@router.get("/stats")
async def get_user_stats(current_user: dict = Depends(get_current_user)):
    stats = users_service.get_statistics()
    return {"data": stats}
```

**2. Add the business logic in a service:**

```python
# app/services/users.py

def get_statistics():
    db = _get_db()
    users = db.table(USERS_TABLE).all()
    return {
        "total": len(users),
        "active": len([u for u in users if u.get("is_active")])
    }
```

**3. Test it:**

Visit `http://localhost:8000/api/v1/users/stats` (after logging in)

### Running Tests

```bash
# Run all tests
pytest tests/ -v

# Run a specific test file
pytest tests/test_auth.py -v

# Run with coverage report
pytest tests/ --cov=app
```

### Updating Dependencies

```bash
# Activate virtual environment first
source .venv/bin/activate

# Install a new package
pip install package-name

# Update requirements.txt
pip freeze > requirements.txt
```

---

## Troubleshooting

### "Command not found: uvicorn"

**Problem:** Virtual environment is not activated.

**Solution:**
```bash
source .venv/bin/activate
```

### "Address already in use" or Port 8000 is busy

**Problem:** Another process is using port 8000.

**Solution:**
```bash
# Find and kill the process on port 8000
lsof -ti:8000 | xargs kill -9

# Or use a different port
uvicorn app.main:app --reload --port 8001
```

### "Module not found" errors

**Problem:** Dependencies not installed or wrong Python version.

**Solution:**
```bash
# Make sure virtual environment is activated
source .venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Changes not reflecting

**Problem:** Server not reloading automatically.

**Solution:**
1. Make sure you used `--reload` flag
2. Restart the server manually (Ctrl+C, then run uvicorn again)

### "Authentication service is unavailable"

**Problem:** Backend is not running.

**Solution:**
```bash
# Start the backend server
cd services/api
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Database errors or weird data

**Problem:** Corrupted `db.json` file.

**Solution:**
```bash
# Backup the current database
cp db.json db.json.backup

# Delete and recreate with seed data
rm db.json
python seed.py
```

---

## Development Tips

### Use the Interactive Docs

FastAPI automatically generates interactive API documentation:

- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

You can test all endpoints directly from your browser!

### Check Server Logs

The terminal where you run `uvicorn` shows all requests:

```
INFO:     127.0.0.1:52345 - "GET /api/v1/users HTTP/1.1" 200 OK
INFO:     127.0.0.1:52345 - "POST /api/v1/auth/login HTTP/1.1" 401 Unauthorized
```

This helps debug issues!

### Understanding HTTP Status Codes

- **200 OK:** Request successful
- **201 Created:** Resource created successfully
- **204 No Content:** Success, no data to return (like DELETE)
- **400 Bad Request:** Invalid data sent
- **401 Unauthorized:** Need to login
- **403 Forbidden:** Logged in but don't have permission
- **404 Not Found:** Resource doesn't exist
- **409 Conflict:** Duplicate data (like email already exists)
- **500 Internal Server Error:** Bug in the code

---

## Next Steps

Now that you understand the backend, you can:

1. **Explore the code:** Read through the routers to see how endpoints work
2. **Try the API:** Use the interactive docs to create users, add data, etc.
3. **Make changes:** Add new endpoints or modify existing ones
4. **Connect the frontend:** Start the Next.js apps and see how they talk to this API
5. **Read FastAPI docs:** [https://fastapi.tiangolo.com/](https://fastapi.tiangolo.com/)

---

## Need Help?

- **FastAPI Documentation:** [https://fastapi.tiangolo.com/](https://fastapi.tiangolo.com/)
- **Python Tutorial:** [https://docs.python.org/3/tutorial/](https://docs.python.org/3/tutorial/)
- **TinyDB Documentation:** [https://tinydb.readthedocs.io/](https://tinydb.readthedocs.io/)

Happy coding!
