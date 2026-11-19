-- Reset a team member's password (the portal doesn't send emails by default).
-- 1. Change the email and the temporary password below.
-- 2. Run it in Supabase → SQL Editor.
-- 3. Give the person the temporary password; they keep all their progress.

update auth.users
set encrypted_password = extensions.crypt('TEMPORARY-PASSWORD-HERE', extensions.gen_salt('bf')),
    updated_at = now()
where email = lower('person@example.com');
