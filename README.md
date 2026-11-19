# Life Is Good — Team Portal

Private onboarding portal for the Life's Good Barber Centre team (Cannon Hill & Coorparoo).
New team members sign in and work through their onboarding: employment documents, a safety
induction, the Staff Code of Conduct (module by module with a short quiz
and a signed acknowledgement), a first-week checklist and their official tee. Managers confirm
checklist items and see everyone's progress.

- Static site (HTML/CSS/JS, no build step) hosted on GitHub Pages.
- Supabase for sign-in and data. All rules (reading time, module order, quiz answers,
  signing) are enforced in the database — see `supabase/schema.sql`.
- The Code's content is stored in Supabase and only visible to approved, signed-in staff.
  It is not part of this repository.

Setup instructions: see `SETUP.md`.
