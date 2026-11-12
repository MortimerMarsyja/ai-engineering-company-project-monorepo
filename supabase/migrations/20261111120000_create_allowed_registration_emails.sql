-- Admin-managed email whitelist for self-registration.
--
-- POST /api/v1/users (self-service account registration) is checked
-- against this table before a new account is created — see
-- app/routers/users.py::register_user and app/services/allowed_emails.py.
-- An email not present here is rejected with 403, never silently
-- allowed. Managed exclusively by admins via GET/POST/DELETE
-- /api/v1/allowed-emails (app/routers/allowed_emails.py).
--
-- This gates the *public registration endpoint* only — it has no effect
-- on accounts created any other way (seed_users.py, a future admin-
-- created-user flow) and removing a row only blocks *future* registration
-- attempts for that email; it never touches an account already created.

CREATE TABLE IF NOT EXISTS allowed_registration_emails (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text NOT NULL UNIQUE,
    added_by    integer REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE allowed_registration_emails IS
    'Admin-managed whitelist of emails allowed to self-register via POST /api/v1/users. Removing a row only blocks future registration attempts for that email — it does not affect accounts already created.';
