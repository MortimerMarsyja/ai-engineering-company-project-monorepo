# Database Seeders - Complete Guide

Learn how to populate your database with test data using the seeder scripts.

## Table of Contents
- [What are Seeders?](#what-are-seeders)
- [Available Seeders](#available-seeders)
- [Quick Start](#quick-start)
- [Detailed Usage](#detailed-usage)
- [What Gets Created](#what-gets-created)
- [Common Workflows](#common-workflows)
- [Troubleshooting](#troubleshooting)

---

## What are Seeders?

**Seeders** are scripts that populate your database with initial or test data. They're useful for:
- **Development**: Get sample data to work with immediately
- **Testing**: Create consistent test data
- **Demos**: Show features with realistic data
- **Resetting**: Quickly restore to a known state

Think of them as "database starter packs" that save you from manually creating users, suppliers, etc.

---

## Available Seeders

Brasaland has **2 seeder scripts**:

### 1. `seed.py` - Suppliers Seeder
**What it does:** Populates the database with sample **Brasa Points suppliers** (loyalty program members).

**Creates:**
- 8 sample suppliers across different locations (Colombia and USA)
- Mix of active and suspended suppliers
- Different product categories (Meat, Produce, Beverages, etc.)
- Realistic contact information

### 2. `seed_users.py` - Users Seeder
**What it does:** Creates test **users with different roles** (admin, manager, user).

**Creates:**
- 1 Admin user (full access)
- 2 Manager users (one in Colombia, one in Miami)
- 3 Regular users
- All users have linked profiles with name, phone, and address
- Passwords are securely hashed

---

## Quick Start

### Running Both Seeders

```bash
# Make sure you're in the API directory
cd services/api

# Activate virtual environment
source .venv/bin/activate

# Run suppliers seeder
python seed.py

# Run users seeder
python seed_users.py
```

### One-Command Reset

```bash
# Delete database and reseed everything
rm db.json && python seed.py && python seed_users.py
```

---

## Detailed Usage

### Seeder #1: Suppliers (`seed.py`)

#### Command
```bash
python seed.py
```

#### What You'll See
```
🌱 Seeding Brasaland suppliers into TinyDB …
   Database: /path/to/db.json

  ✅ Inserted: Camila Ospina <camila.ospina@email.com>
  ✅ Inserted: Santiago Rodríguez <santiago.r@email.com>
  ✅ Inserted: María Fernanda López <mafe.lopez@email.com>
  ✅ Inserted: Juan Esteban Giraldo <jegiraldo@email.com>
  ✅ Inserted: Andrea Mejía <andrea.mejia@email.com>
  ✅ Inserted: Carlos Andrés Pérez <carlos.perez@email.com>
  ✅ Inserted: Isabella Martinez <isa.martinez@email.com>
  ✅ Inserted: Laura Valentina Restrepo <laura.restrepo@email.com>

──────────────────────────────────────────────────
  📊 Summary
     Inserted : 8
     Skipped  : 0
     Total in DB: 8
──────────────────────────────────────────────────

Done! ✨
```

#### Suppliers Created

| Name | Email | Location | Category | Rate | Status |
|------|-------|----------|----------|------|--------|
| Camila Ospina | camila.ospina@email.com | Medellín, Colombia | Meat | 4.5 | Active |
| Santiago Rodríguez | santiago.r@email.com | Bogotá, Colombia | Produce | 4.2 | Active |
| María Fernanda López | mafe.lopez@email.com | Miami, USA | Beverages | 4.8 | Active |
| Juan Esteban Giraldo | jegiraldo@email.com | Medellín, Colombia | Dairy | 3.9 | Active |
| Andrea Mejía | andrea.mejia@email.com | Orlando, USA | Seafood | 4.1 | Active |
| Carlos Andrés Pérez | carlos.perez@email.com | Cali, Colombia | Spices | 4.6 | Active |
| Isabella Martinez | isa.martinez@email.com | Miami, USA | Meat | 4.3 | **Suspended** |
| Laura Valentina Restrepo | laura.restrepo@email.com | Medellín, Colombia | Produce | 3.7 | Active |

#### Smart Features
- **Duplicate Detection**: Running the seeder again won't create duplicates
  ```
  ⏭  Skipped (duplicate): Camila Ospina <camila.ospina@email.com>
  ```
- **Idempotent**: Safe to run multiple times
- **Realistic Data**: Includes dietary preferences, favorite locations, etc.

---

### Seeder #2: Users (`seed_users.py`)

#### Command
```bash
python seed_users.py
```

#### What You'll See
```
🌱 Seeding Brasaland users into TinyDB …

  ✅ Inserted: admin@brasaland.com (id=1, role=admin)
  ✅ Inserted: manager@brasaland.com (id=2, role=manager)
  ✅ Inserted: manager.miami@brasaland.com (id=3, role=manager)
  ✅ Inserted: user1@brasaland.com (id=4, role=user)
  ✅ Inserted: user2@brasaland.com (id=5, role=user)
  ✅ Inserted: user3@brasaland.com (id=6, role=user)

──────────────────────────────────────────────────
  📊 Summary
     Inserted   : 6
     Skipped    : 0
     Total in DB: 6
──────────────────────────────────────────────────

Done! ✨
```

#### Users Created

| Email | Password | Role | Name | Location |
|-------|----------|------|------|----------|
| admin@brasaland.com | `Admin123!` | **admin** | Admin Brasaland | Medellín, Colombia |
| manager@brasaland.com | `Manager123!` | **manager** | Valentina Gómez | Bogotá, Colombia |
| manager.miami@brasaland.com | `Manager123!` | **manager** | Daniel Herrera | Miami, USA |
| user1@brasaland.com | `User123!` | user | Camila Ospina | Medellín, Colombia |
| user2@brasaland.com | `User123!` | user | Santiago Rodríguez | Bogotá, Colombia |
| user3@brasaland.com | `User123!` | user | Andrea Mejía | Orlando, USA |

⚠️ **Security Note:** These passwords are for **development only**. Never use these in production!

#### User Roles Explained

**Admin** (`admin`)
- Full access to everything
- Can manage all users
- Can modify system settings

**Manager** (`manager`)
- Can manage resources
- Can update users
- Limited administrative access

**User** (`user`)
- Standard access
- Can view and update own profile
- Cannot modify other users

#### Smart Features
- **Automatic Profile Creation**: Each user gets a linked profile
- **Password Hashing**: Passwords are securely hashed with bcrypt
- **Duplicate Detection**: Running again won't create duplicates
  ```
  ⏭  Skipped (duplicate): admin@brasaland.com
  ```
- **Uses Service Layer**: Creates users the same way the API would

---

## What Gets Created

### Database Structure After Seeding

```json
{
  "suppliers": [
    {
      "id": 1,
      "full_name": "Camila Ospina",
      "email": "camila.ospina@email.com",
      "phone": "+57 310 123 4567",
      "country": "Colombia",
      "city": "Medellín",
      "favorite_location": "Brasaland El Poblado",
      "product_category": "Meat",
      "rate": 4.5,
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
    // ... 7 more suppliers
  ],

  "users": [
    {
      "id": 1,
      "email": "admin@brasaland.com",
      "hashed_password": "$2b$12$...",
      "role": "admin",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
    // ... 5 more users
  ],

  "profiles": [
    {
      "id": "uuid-here",
      "user_id": 1,
      "name": "Admin Brasaland",
      "phone": "+57 300 000 0001",
      "address": "Cra. 43A #1-50, Medellín"
    }
    // ... 5 more profiles
  ]
}
```

---

## Common Workflows

### First-Time Setup
```bash
cd services/api
source .venv/bin/activate
python seed.py           # Create suppliers
python seed_users.py     # Create users
```

### Reset Everything
```bash
# Backup first (optional)
cp db.json db.backup.json

# Delete and reseed
rm db.json
python seed.py
python seed_users.py
```

### Test Login Flow
```bash
# After running seed_users.py
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@brasaland.com","password":"Admin123!"}'
```

### Add More Data
```bash
# Run seeders, then manually add more via API or frontend
python seed.py
python seed_users.py

# Now use the application to add more suppliers, users, etc.
```

### Check What Was Created

**View database:**
```bash
cat db.json
# or
open db.json
```

**Via API:**
```bash
# Start server first
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Then in another terminal (need to login first to get token)
curl http://localhost:8000/api/v1/suppliers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## How Seeders Work

### Under the Hood

Both seeders follow the same pattern:

```
1. Connect to db.json (TinyDB)
   ↓
2. Check for existing records (by email)
   ↓
3. For each new record:
   - Add timestamps
   - Insert into database
   - Print success message
   ↓
4. Skip duplicates
   ↓
5. Print summary
```

### Seed.py Flow
```python
def seed():
    db = TinyDB("db.json")
    suppliers_table = db.table("suppliers")

    # Get existing emails to avoid duplicates
    existing_emails = {doc["email"] for doc in suppliers_table.all()}

    for supplier in INITIAL_SUPPLIERS:
        if supplier["email"] not in existing_emails:
            suppliers_table.insert({
                **supplier,
                "created_at": now,
                "updated_at": now,
            })
```

### Seed_users.py Flow
```python
def seed():
    for data in INITIAL_USERS:
        try:
            # Uses the same service layer as the API
            user = users_service.create_user(UserCreate(**data))
        except ValueError:
            # Email already exists, skip
            print("Skipped (duplicate)")
```

**Key Difference:**
- `seed.py` inserts directly into database
- `seed_users.py` uses the service layer (hashes passwords, creates profiles)

---

## Troubleshooting

### "ModuleNotFoundError: No module named 'app'"

**Problem:** Running from wrong directory or virtual environment not activated.

**Solution:**
```bash
cd services/api
source .venv/bin/activate
python seed_users.py
```

### "TinyDB file is locked"

**Problem:** Database file is in use by another process.

**Solution:**
```bash
# Stop the backend server
# Then run the seeder
python seed.py
```

### Nothing Gets Created

**Problem:** Records already exist (duplicates detected).

**Solution:**
```bash
# Check the output for "Skipped (duplicate)" messages

# If you want to start fresh:
rm db.json
python seed.py
python seed_users.py
```

### Wrong Passwords After Seeding

**Problem:** Using old passwords after re-seeding.

**Solution:** Always use the passwords documented above:
- Admin: `Admin123!`
- Manager: `Manager123!`
- User: `User123!`

### Seeder Creates But Login Fails

**Problem:** Backend not reading the updated database.

**Solution:**
```bash
# Stop the backend (Ctrl+C)
# Re-run seeders
python seed_users.py
# Restart backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## Advanced Usage

### Running Seeders with UV

The seed files support running with `uv` (if you have it installed):

```bash
# Instead of: python seed.py
uv run seed

# Instead of: python seed_users.py
uv run seed-users
```

### Modifying Seed Data

Want to add your own test data? Edit the seeder files:

**Add a supplier:**
```python
# In seed.py, add to INITIAL_SUPPLIERS list:
{
    "full_name": "Your Name",
    "email": "your.email@example.com",
    "phone": "+57 300 123 4567",
    "country": "Colombia",
    "city": "Medellín",
    "favorite_location": "Brasaland El Poblado",
    "dietary_preferences": ["No restrictions"],
    "how_did_you_find_us": "Social media",
    "date_of_birth": "1990-01-01",
    "accepts_terms": True,
    "wants_email_offers": True,
    "product_category": "Meat",
    "rate": 4.5,
    "status": "active",
},
```

**Add a user:**
```python
# In seed_users.py, add to INITIAL_USERS list:
{
    "email": "your.email@brasaland.com",
    "password": "YourPassword123!",
    "role": UserRole.USER,
    "name": "Your Name",
    "phone": "+57 300 123 4567",
    "address": "Your Address",
},
```

### Creating Your Own Seeder

Template for a new seeder (e.g., `seed_incidents.py`):

```python
from datetime import datetime, timezone
from pathlib import Path
from tinydb import TinyDB

DB_PATH = Path(__file__).parent / "db.json"

INITIAL_INCIDENTS = [
    {
        "incident_id": "BRS-000001",
        "date": "2024-01-15",
        "location_id": "COL-01",
        "category": "CUSTOMER_COMPLAINT",
        "description": "Cold food served",
        "status": "CLOSED",
        "reporter_id": "MGR-01",
        "satisfaction_score": 4,
    },
    # ... more incidents
]

def seed():
    db = TinyDB(DB_PATH)
    incidents = db.table("incidents")

    now = datetime.now(timezone.utc).isoformat()

    for incident in INITIAL_INCIDENTS:
        incidents.insert({
            **incident,
            "created_at": now,
            "updated_at": now,
        })
        print(f"  ✅ Inserted: {incident['incident_id']}")

    db.close()

if __name__ == "__main__":
    seed()
```

---

## Test Data Reference

### All Login Credentials

```
┌─────────────────────────────┬──────────────┬──────────┐
│ Email                       │ Password     │ Role     │
├─────────────────────────────┼──────────────┼──────────┤
│ admin@brasaland.com         │ Admin123!    │ admin    │
│ manager@brasaland.com       │ Manager123!  │ manager  │
│ manager.miami@brasaland.com │ Manager123!  │ manager  │
│ user1@brasaland.com         │ User123!     │ user     │
│ user2@brasaland.com         │ User123!     │ user     │
│ user3@brasaland.com         │ User123!     │ user     │
└─────────────────────────────┴──────────────┴──────────┘
```

### Supplier Locations

**Colombia:**
- 5 suppliers across Medellín, Bogotá, and Cali

**USA:**
- 3 suppliers in Miami and Orlando

### Data Variety

The seeders create:
- ✅ Different user roles (admin, manager, user)
- ✅ Active and suspended suppliers
- ✅ Multiple product categories
- ✅ Different dietary preferences
- ✅ Various referral sources
- ✅ Realistic contact information
- ✅ Geographic diversity (Colombia & USA)

---

## Summary

| Seeder | What It Creates | Run With | Safe to Re-run? |
|--------|-----------------|----------|-----------------|
| `seed.py` | 8 suppliers | `python seed.py` | ✅ Yes (skips duplicates) |
| `seed_users.py` | 6 users + profiles | `python seed_users.py` | ✅ Yes (skips duplicates) |

**Best Practice:** Run both seeders after first-time setup or when you need to reset your database.

**Remember:** These are **development tools**. Never use seeded passwords in production!

---

## Next Steps

1. **Run the seeders** to populate your database
2. **Test login** with one of the seeded users
3. **Explore the API** with real data
4. **Modify seeders** to add your own test data
5. **Build features** with confidence knowing you have consistent test data

Happy seeding! 🌱
