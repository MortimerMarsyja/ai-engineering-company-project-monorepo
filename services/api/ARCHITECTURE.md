# Brasaland Backend - Architecture Deep Dive

This document provides a visual guide to understanding how the Brasaland backend works.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Brasaland Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐         ┌─────────────────┐            │
│  │  Backoffice UI  │         │  Main Website   │            │
│  │  (Next.js)      │         │  (Next.js)      │            │
│  │  Port 3002      │         │  Port 3000      │            │
│  └────────┬────────┘         └────────┬────────┘            │
│           │                           │                      │
│           └───────────┬───────────────┘                      │
│                       │                                      │
│                       │ HTTP Requests                        │
│                       ↓                                      │
│            ┌──────────────────────┐                          │
│            │   Backend API        │                          │
│            │   (FastAPI/Python)   │                          │
│            │   Port 8000          │                          │
│            └──────────┬───────────┘                          │
│                       │                                      │
│                       ↓                                      │
│            ┌──────────────────────┐                          │
│            │   Database           │                          │
│            │   (TinyDB/db.json)   │                          │
│            └──────────────────────┘                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Request Flow - Example: User Login

```
┌──────────┐                                                   ┌──────────┐
│          │  1. POST /api/v1/auth/login                       │          │
│ Frontend │  {"email": "user@example.com", "password": "..."}│ Backend  │
│          ├──────────────────────────────────────────────────→│          │
└──────────┘                                                   └────┬─────┘
                                                                    │
                                                    2. Request hits auth.py router
                                                                    │
                                                                    ↓
                                           ┌─────────────────────────────────┐
                                           │  app/routers/auth.py            │
                                           │  - Receives request              │
                                           │  - Validates JSON body           │
                                           └────────────┬────────────────────┘
                                                        │
                                        3. Router calls service layer
                                                        │
                                                        ↓
                                           ┌─────────────────────────────────┐
                                           │  app/services/users.py          │
                                           │  authenticate(email, password)   │
                                           └────────────┬────────────────────┘
                                                        │
                                         4. Service queries database
                                                        │
                                                        ↓
                                           ┌─────────────────────────────────┐
                                           │  db.json                        │
                                           │  Find user by email             │
                                           └────────────┬────────────────────┘
                                                        │
                                         5. Verify password (core/security.py)
                                                        │
                                                        ↓
                                           ┌─────────────────────────────────┐
                                           │  app/core/security.py           │
                                           │  verify_password(...)           │
                                           └────────────┬────────────────────┘
                                                        │
                                           6. Generate JWT token
                                                        │
                                                        ↓
                                           ┌─────────────────────────────────┐
                                           │  app/core/security.py           │
                                           │  create_access_token(user_id)   │
                                           └────────────┬────────────────────┘
                                                        │
                                           7. Return token to router
                                                        │
┌──────────┐                                           ↓                ┌──────────┐
│          │  8. Response with token                   │                │          │
│ Frontend │←──────────────────────────────────────────┴────────────────┤ Backend  │
│          │  {"access_token": "eyJ...", "token_type": "bearer"}        │          │
└────┬─────┘                                                            └──────────┘
     │
     │ 9. Store token in browser
     ↓
localStorage.setItem('token', response.access_token)
```

## Backend Internal Architecture

### Three-Layer Pattern

```
┌────────────────────────────────────────────────────────────────┐
│                        HTTP REQUEST                            │
│                   (from frontend/client)                       │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ↓
┌────────────────────────────────────────────────────────────────┐
│                    LAYER 1: ROUTERS                            │
│                   (app/routers/*.py)                           │
├────────────────────────────────────────────────────────────────┤
│  Responsibilities:                                             │
│  • Receive HTTP requests                                       │
│  • Validate request data (using Pydantic models)               │
│  • Check authentication (JWT tokens)                           │
│  • Call appropriate service functions                          │
│  • Format and return HTTP responses                            │
│                                                                 │
│  Example: routers/users.py                                     │
│  @router.post("/users")                                        │
│  async def create_user(payload: UserCreate):                   │
│      user = users_service.create_user(payload)                 │
│      return {"data": user}                                     │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ↓
┌────────────────────────────────────────────────────────────────┐
│                   LAYER 2: SERVICES                            │
│                  (app/services/*.py)                           │
├────────────────────────────────────────────────────────────────┤
│  Responsibilities:                                             │
│  • Implement business logic                                    │
│  • Interact with database (TinyDB)                             │
│  • Handle data transformations                                 │
│  • Enforce business rules                                      │
│  • Call other services if needed                               │
│                                                                 │
│  Example: services/users.py                                    │
│  def create_user(payload):                                     │
│      # 1. Check if email exists                                │
│      # 2. Hash password                                        │
│      # 3. Save to database                                     │
│      # 4. Create linked profile                                │
│      # 5. Return user object                                   │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ↓
┌────────────────────────────────────────────────────────────────┐
│                   LAYER 3: DATABASE                            │
│                      (db.json)                                 │
├────────────────────────────────────────────────────────────────┤
│  Responsibilities:                                             │
│  • Store all application data                                  │
│  • TinyDB provides CRUD operations                             │
│                                                                 │
│  Structure:                                                    │
│  {                                                             │
│    "users": [...],                                             │
│    "profiles": [...],                                          │
│    "suppliers": [...],                                         │
│    "incidents": [...],                                         │
│    "records": [...],                                           │
│    "candidate_notes": [...]                                    │
│  }                                                             │
└────────────────────────────────────────────────────────────────┘
```

## Project File Structure (Detailed)

```
services/api/
│
├── app/                           # Main application package
│   │
│   ├── main.py                    # Application entry point
│   │                              # - Creates FastAPI app
│   │                              # - Configures CORS
│   │                              # - Registers all routers
│   │
│   ├── core/                      # Core functionality
│   │   ├── config.py             # Configuration management
│   │   │                          # - Reads environment variables
│   │   │                          # - Defines app settings (API_V1_PREFIX, SECRET_KEY, etc.)
│   │   │
│   │   ├── deps.py               # Dependency injection
│   │   │                          # - get_current_user(): Validates JWT tokens
│   │   │                          # - require_staff(): Checks user roles
│   │   │
│   │   └── security.py           # Security utilities
│   │                              # - hash_password(): Hashes passwords with bcrypt
│   │                              # - verify_password(): Checks password against hash
│   │                              # - create_access_token(): Generates JWT tokens
│   │                              # - decode_token(): Validates JWT tokens
│   │
│   ├── models/                    # Data models & schemas
│   │   ├── schemas.py            # API request/response models
│   │   │                          # - UserCreate, IncidentCreate, etc.
│   │   │                          # - Validates incoming data
│   │   │                          # - Defines response structure
│   │   │
│   │   ├── user.py               # User-specific models
│   │   │                          # - UserRole enum
│   │   │                          # - UserUpdate model
│   │   │
│   │   └── profile.py            # Profile-specific models
│   │                              # - ProfileUpdate model
│   │
│   ├── routers/                   # API endpoints
│   │   │
│   │   ├── auth.py               # Authentication endpoints
│   │   │                          # POST /api/v1/auth/login
│   │   │                          # GET  /api/v1/auth/me
│   │   │                          # POST /api/v1/auth/forgot-password
│   │   │                          # POST /api/v1/auth/reset-password
│   │   │
│   │   ├── users.py              # User management
│   │   │                          # POST   /api/v1/users
│   │   │                          # GET    /api/v1/users
│   │   │                          # GET    /api/v1/users/{id}
│   │   │                          # PUT    /api/v1/users/{id}
│   │   │                          # DELETE /api/v1/users/{id}
│   │   │
│   │   ├── profiles.py           # Profile management
│   │   │                          # GET   /api/v1/profiles/me
│   │   │                          # PATCH /api/v1/profiles/me
│   │   │                          # POST  /api/v1/profiles/me/change-password
│   │   │
│   │   ├── suppliers.py          # Supplier management
│   │   │                          # CRUD operations for suppliers
│   │   │
│   │   ├── incidents.py          # Incident tracking
│   │   │                          # CRUD operations + CSV analysis
│   │   │
│   │   ├── records.py            # Hiring pipeline
│   │   │                          # CRUD operations for candidates
│   │   │                          # Notes management
│   │   │
│   │   └── health.py             # Health check
│   │                              # GET /health
│   │
│   └── services/                  # Business logic layer
│       │
│       ├── users.py              # User operations
│       │                          # - create_user()
│       │                          # - get_user_by_email()
│       │                          # - authenticate()
│       │                          # - update_user()
│       │                          # - delete_user()
│       │
│       ├── profiles.py           # Profile operations
│       │                          # - create_profile()
│       │                          # - get_profile_by_user_id()
│       │                          # - update_profile()
│       │
│       ├── records.py            # Candidate operations
│       │                          # - create_record()
│       │                          # - list_records()
│       │                          # - create_note()
│       │                          # - get_notes_by_record_id()
│       │
│       ├── incidents.py          # Incident operations & analysis
│       ├── email.py              # Email sending (Resend API)
│       └── password_resets.py    # Password reset logic
│
├── tests/                         # Test suite
│   ├── test_auth.py              # Authentication tests
│   ├── test_users.py             # User endpoint tests
│   ├── test_profiles.py          # Profile tests
│   └── ...
│
├── db.json                        # Database (TinyDB)
├── requirements.txt               # Python dependencies
├── .env.example                   # Environment variables template
├── seed.py                        # Populate database with test data
└── README.md                      # Main documentation
```

## Data Flow: Creating a Candidate Record

```
Frontend                Router                  Service                Database
   │                      │                        │                      │
   │  POST /records       │                        │                      │
   │  {                   │                        │                      │
   │    "full_name": "...",                        │                      │
   │    "email": "...",   │                        │                      │
   │    ...               │                        │                      │
   │  }                   │                        │                      │
   ├─────────────────────→│                        │                      │
   │                      │                        │                      │
   │              1. Validate JWT token            │                      │
   │                      │                        │                      │
   │              2. Validate request body         │                      │
   │                 (RecordCreate schema)         │                      │
   │                      │                        │                      │
   │                      │  create_record(payload)│                      │
   │                      ├───────────────────────→│                      │
   │                      │                        │                      │
   │                      │                3. Generate UUID               │
   │                      │                        │                      │
   │                      │                4. Build document              │
   │                      │                        │                      │
   │                      │                        │  Insert into         │
   │                      │                        │  "records" table     │
   │                      │                        ├─────────────────────→│
   │                      │                        │                      │
   │                      │                        │  Return doc_id       │
   │                      │                        │←─────────────────────┤
   │                      │                        │                      │
   │                      │                5. Get created record          │
   │                      │                        │                      │
   │                      │                        ├─────────────────────→│
   │                      │                        │←─────────────────────┤
   │                      │                        │                      │
   │                      │  Return record object  │                      │
   │                      │←───────────────────────┤                      │
   │                      │                        │                      │
   │                      │  6. Build HTTP response                       │
   │                      │     (CandidateResponse)                       │
   │                      │                        │                      │
   │  201 Created         │                        │                      │
   │  {                   │                        │                      │
   │    "id": "uuid...",  │                        │                      │
   │    "full_name": "...",                        │                      │
   │    ...               │                        │                      │
   │  }                   │                        │                      │
   │←─────────────────────┤                        │                      │
   │                      │                        │                      │
```

## Authentication & Authorization

### JWT Token Flow

```
┌─────────────────┐
│  1. User Login  │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  2. Backend validates credentials       │
│     - Check email exists                │
│     - Verify password hash              │
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  3. Generate JWT Token                  │
│     Token contains:                     │
│     {                                   │
│       "sub": user_id,                   │
│       "email": "user@example.com",      │
│       "role": "user",                   │
│       "exp": timestamp                  │
│     }                                   │
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  4. Frontend stores token               │
│     localStorage.setItem('token', ...)  │
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  5. Subsequent requests include token   │
│     Authorization: Bearer <token>       │
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│  6. Backend validates token on each     │
│     protected endpoint                  │
│     - Decode token                      │
│     - Check signature                   │
│     - Verify expiration                 │
│     - Extract user info                 │
└─────────────────────────────────────────┘
```

### Protected Endpoint Example

```python
# app/routers/records.py

@router.get("/records")
async def list_records(
    current_user: dict = Depends(get_current_user)  # ← Dependency injection
):
    # If we reach here, the token is valid
    # current_user contains: {"id": 1, "email": "...", "role": "..."}

    records = records_service.list_records()
    return records
```

How `get_current_user` works:

```python
# app/core/deps.py

async def get_current_user(token: str = Depends(oauth2_scheme)):
    # 1. Extract token from Authorization header
    # 2. Decode and validate token
    # 3. Get user from database
    # 4. Return user object
    # 5. If any step fails → raise 401 Unauthorized
```

## Database Schema (TinyDB)

```json
{
  "users": [
    {
      "id": 1,
      "email": "user@example.com",
      "hashed_password": "bcrypt_hash_here",
      "is_active": true,
      "role": "user",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],

  "profiles": [
    {
      "id": "uuid-here",
      "user_id": 1,
      "name": "John Doe",
      "phone": "+1 555-1234",
      "address": "123 Main St"
    }
  ],

  "records": [
    {
      "id": "uuid-here",
      "full_name": "Jane Smith",
      "email": "jane@example.com",
      "phone": "+1 555-5678",
      "position": "Software Engineer",
      "linkedin_url": "https://linkedin.com/in/janesmith",
      "cv_url": null,
      "status": "received",
      "stage": "pending",
      "experience_years": 5,
      "applied_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    }
  ],

  "candidate_notes": [
    {
      "id": "uuid-here",
      "record_id": "candidate-uuid",
      "content": "Great technical skills",
      "created_at": "2024-01-16T14:30:00Z"
    }
  ],

  "suppliers": [...],
  "incidents": [...],
  "password_resets": [...]
}
```

## Common Patterns

### 1. CRUD Operations Pattern

Every resource follows this pattern:

```python
# In services/resource.py

def create_resource(data):
    # 1. Validate business rules
    # 2. Generate ID
    # 3. Insert into database
    # 4. Return created object

def list_resources():
    # 1. Query database
    # 2. Transform data
    # 3. Return list

def get_resource_by_id(id):
    # 1. Query database
    # 2. Return object or None

def update_resource(id, data):
    # 1. Check exists
    # 2. Validate business rules
    # 3. Update database
    # 4. Return updated object

def delete_resource(id):
    # 1. Check exists
    # 2. Delete from database
    # 3. Return success boolean
```

### 2. Error Handling Pattern

```python
# In routers/

@router.post("/users")
async def create_user(payload: UserCreate):
    try:
        user = users_service.create_user(payload)
        return {"data": user}
    except ValueError as exc:
        # Business rule violation (e.g., duplicate email)
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        # Unexpected error
        raise HTTPException(status_code=500, detail="Internal server error")
```

### 3. Relationship Pattern (Users ↔ Profiles)

```
┌─────────────┐         1:1         ┌─────────────┐
│    User     │◄───────────────────►│   Profile   │
├─────────────┤                     ├─────────────┤
│ id          │                     │ id          │
│ email       │                     │ user_id     │
│ password    │                     │ name        │
│ role        │                     │ phone       │
│ is_active   │                     │ address     │
└─────────────┘                     └─────────────┘

Why separate?
- Security: Credentials (email/password) separate from profile data
- Privacy: Profile data can be updated without touching credentials
- Flexibility: Easy to extend profile without affecting auth
```

## Environment Variables

```
.env file structure:

┌────────────────────────────────────────────┐
│  Application Settings                      │
│  - APP_NAME: Display name                  │
│  - APP_VERSION: Semantic version           │
│  - DEBUG: true/false                       │
│  - API_V1_PREFIX: URL prefix (/api/v1)     │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│  Security                                  │
│  - SECRET_KEY: JWT signing key             │
│  - PASSWORD_RESET_EXPIRE_MINUTES: Timeout  │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│  External Services                         │
│  - RESEND_API_KEY: Email service key       │
│  - RESEND_FROM_EMAIL: Sender address       │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│  CORS & Frontend                           │
│  - CORS_ORIGINS: Allowed frontend URLs     │
│  - BACKOFFICE_URL: Password reset links    │
└────────────────────────────────────────────┘
```

## Key Technologies Explained

### FastAPI
- Modern Python web framework
- Automatic API documentation
- Built-in data validation
- Async support for better performance

### Pydantic
- Data validation library
- Defines request/response schemas
- Automatic type checking
- Clear error messages

### TinyDB
- Lightweight JSON database
- Perfect for development/learning
- No server needed
- Easy to inspect (just open db.json)

### Uvicorn
- ASGI server (runs FastAPI apps)
- Fast and lightweight
- Auto-reload during development
- Production-ready

### JWT (JSON Web Tokens)
- Stateless authentication
- Token contains user info
- Cryptographically signed
- No need to store sessions server-side

---

This architecture is designed to be:
- **Simple**: Easy to understand for beginners
- **Scalable**: Can grow from dev to production
- **Maintainable**: Clear separation of concerns
- **Testable**: Each layer can be tested independently
