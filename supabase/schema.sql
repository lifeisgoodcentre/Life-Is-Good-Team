-- =====================================================================
--  Life's Good Barber Centre — Team Portal (onboarding + Code of Conduct)
--  Database schema, row-level security and server functions.
--
--  Run this in Supabase → SQL Editor, then run private/seed_content.sql
--  (the content, which is kept out of the public GitHub repo).
--  Safe to re-run: everything uses "if not exists" / "create or replace".
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------

create table if not exists public.settings (
  id           int primary key default 1 check (id = 1),
  code_version text not null default '1.0',
  updated_at   timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text,
  full_name       text not null check (length(trim(full_name)) between 2 and 80),
  role            text not null check (role in ('Shop Manager','Shift Leader','Barber','Apprentice','Receptionist')),
  location        text not null check (location in ('Cannon Hill','Coorparoo')),
  status          text not null default 'pending' check (status in ('pending','active','inactive')),
  is_admin        boolean not null default false,
  employment_type text check (employment_type in ('Full-time','Part-time','Casual','Fixed-term')),
  tee_size        text check (tee_size in ('XS','S','M','L','XL','2XL','3XL')),
  tee_received_at timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.profiles add column if not exists employment_type text check (employment_type in ('Full-time','Part-time','Casual','Fixed-term'));
alter table public.profiles add column if not exists tee_size text check (tee_size in ('XS','S','M','L','XL','2XL','3XL'));
alter table public.profiles add column if not exists tee_received_at timestamptz;

-- Learning modules. track: 'code' (Code of Conduct, versioned + signed),
-- 'safety' (WHS induction), 'role' (role-specific training).
-- roles = null means everyone; otherwise only those roles see it.
create table if not exists public.sections (
  id          text primary key,
  ord         int  not null unique,
  track       text not null default 'code' check (track in ('code','safety','role')),
  roles       text[],
  kicker      text not null,
  title       text not null,
  summary     text,
  body_html   text not null,
  min_seconds int  not null default 60 check (min_seconds >= 0)
);
alter table public.sections add column if not exists track text not null default 'code' check (track in ('code','safety','role'));
alter table public.sections add column if not exists roles text[];

create table if not exists public.questions (
  id         uuid primary key,
  section_id text not null references public.sections (id) on delete cascade,
  ord        int  not null,
  prompt     text not null,
  options    jsonb not null,
  unique (section_id, ord)
);

-- Correct answers live in a schema the public API cannot reach.
create table if not exists private.question_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  correct     int  not null,
  explanation text
);

-- code_version = the Code version for 'code' modules, 'base' for the others
-- (so publishing a new Code version doesn't reset the safety induction).
create table if not exists public.progress (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  section_id   text not null references public.sections (id) on delete cascade,
  code_version text not null,
  started_at   timestamptz not null default now(),
  attempts     int not null default 0,
  wrong_total  int not null default 0,
  completed_at timestamptz,
  primary key (user_id, section_id, code_version)
);

create table if not exists public.acknowledgements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  code_version text not null,
  full_name    text not null,
  role         text not null,
  location     text not null,
  signature    text not null,
  signed_at    timestamptz not null default now(),
  user_agent   text,
  unique (user_id, code_version)
);

create table if not exists public.attempt_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  section_id   text not null,
  code_version text not null,
  wrong        uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- First-week checklist: the team member ticks, a manager confirms.
create table if not exists public.checklist_items (
  id     text primary key,
  ord    int  not null unique,
  title  text not null,
  detail text,
  roles  text[]
);
create table if not exists public.checklist_progress (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  item_id      text not null references public.checklist_items (id) on delete cascade,
  done_at      timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, item_id)
);

-- Documents every new starter must receive (e.g. Fair Work Information Statement).
-- employment_types = null means everyone.
create table if not exists public.documents (
  id               text primary key,
  ord              int  not null unique,
  title            text not null,
  description      text,
  url              text not null,
  employment_types text[]
);
create table if not exists public.document_receipts (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  doc_id      text not null references public.documents (id) on delete cascade,
  received_at timestamptz not null default now(),
  primary key (user_id, doc_id)
);

-- ---------------------------------------------------------------------
--  Helpers
-- ---------------------------------------------------------------------

create or replace function public.current_version() returns text
language sql stable security definer set search_path = public as $$
  select code_version from settings where id = 1
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and is_admin)
$$;

-- Which progress "version" a module is tracked under.
create or replace function private.ver_for(p_section text) returns text
language sql stable as $$
  select case when (select track from public.sections where id = p_section) = 'code'
              then public.current_version() else 'base' end
$$;

-- Does this module apply to this person's role?
create or replace function private.applies(p_uid uuid, p_section text) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.sections s join public.profiles p on p.id = p_uid
    where s.id = p_section and (s.roles is null or p.role = any (s.roles)))
$$;

-- Number of earlier modules in the same track this person hasn't completed.
drop function if exists private.missing_before(uuid, text, text);
create or replace function private.missing_before(p_uid uuid, p_section text) returns int
language sql stable as $$
  select count(*)::int
  from public.sections s
  join public.sections t on t.id = p_section
  join public.profiles p on p.id = p_uid
  where s.track = t.track and s.ord < t.ord
    and (s.roles is null or p.role = any (s.roles))
    and not exists (
      select 1 from public.progress pr
      where pr.user_id = p_uid and pr.section_id = s.id
        and pr.code_version = private.ver_for(s.id) and pr.completed_at is not null)
$$;

-- One-line onboarding summary for a person (used by the manager view).
create or replace function private.user_summary(p_uid uuid) returns jsonb
language sql stable as $$
  with p as (select * from public.profiles where id = p_uid),
  s as (
    select s.track,
           exists (select 1 from public.progress pr
                   where pr.user_id = p_uid and pr.section_id = s.id
                     and pr.code_version = private.ver_for(s.id) and pr.completed_at is not null) as done
    from public.sections s, p
    where s.roles is null or p.role = any (s.roles)),
  c as (
    select cp.done_at, cp.confirmed_at
    from public.checklist_items ci cross join p
    left join public.checklist_progress cp on cp.item_id = ci.id and cp.user_id = p_uid
    where ci.roles is null or p.role = any (ci.roles)),
  d as (
    select r.received_at
    from public.documents dd cross join p
    left join public.document_receipts r on r.doc_id = dd.id and r.user_id = p_uid
    where dd.employment_types is null or p.employment_type = any (dd.employment_types))
  select jsonb_build_object(
    'code_total',   (select count(*) from s where track = 'code'),
    'code_done',    (select count(*) from s where track = 'code' and done),
    'safety_total', (select count(*) from s where track = 'safety'),
    'safety_done',  (select count(*) from s where track = 'safety' and done),
    'role_total',   (select count(*) from s where track = 'role'),
    'role_done',    (select count(*) from s where track = 'role' and done),
    'checklist_total',     (select count(*) from c),
    'checklist_done',      (select count(*) from c where done_at is not null),
    'checklist_confirmed', (select count(*) from c where confirmed_at is not null),
    'docs_total',    (select count(*) from d),
    'docs_received', (select count(*) from d where received_at is not null),
    'signed_at', (select a.signed_at from public.acknowledgements a
                  where a.user_id = p_uid and a.code_version = public.current_version()))
$$;

-- ---------------------------------------------------------------------
--  Row-level security: reads are scoped, all writes go through functions
-- ---------------------------------------------------------------------

alter table public.settings           enable row level security;
alter table public.profiles           enable row level security;
alter table public.sections           enable row level security;
alter table public.questions          enable row level security;
alter table public.progress           enable row level security;
alter table public.acknowledgements   enable row level security;
alter table public.attempt_log        enable row level security;
alter table public.checklist_items    enable row level security;
alter table public.checklist_progress enable row level security;
alter table public.documents          enable row level security;
alter table public.document_receipts  enable row level security;
-- private schema is not exposed by the API; RLS with no policies is an extra lock (definer functions bypass it as owner)
alter table private.question_keys     enable row level security;

drop policy if exists settings_read   on public.settings;
drop policy if exists profiles_read   on public.profiles;
drop policy if exists sections_read   on public.sections;
drop policy if exists questions_read  on public.questions;
drop policy if exists progress_read   on public.progress;
drop policy if exists acks_read       on public.acknowledgements;
drop policy if exists attempts_read   on public.attempt_log;
drop policy if exists checklist_read  on public.checklist_items;
drop policy if exists checkprog_read  on public.checklist_progress;
drop policy if exists documents_read  on public.documents;
drop policy if exists receipts_read   on public.document_receipts;

create policy settings_read  on public.settings           for select to authenticated using (true);
create policy profiles_read  on public.profiles           for select to authenticated using (id = auth.uid() or public.is_admin());
create policy sections_read  on public.sections           for select to authenticated using (public.is_active());
create policy questions_read on public.questions          for select to authenticated using (public.is_active());
create policy progress_read  on public.progress           for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy acks_read      on public.acknowledgements   for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy attempts_read  on public.attempt_log        for select to authenticated using (public.is_admin());
create policy checklist_read on public.checklist_items    for select to authenticated using (public.is_active());
create policy checkprog_read on public.checklist_progress for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy documents_read on public.documents          for select to authenticated using (public.is_active());
create policy receipts_read  on public.document_receipts  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
--  Staff functions
-- ---------------------------------------------------------------------

-- Create (or, while still pending, edit) your own profile after signing up.
-- The very first person to register becomes an active admin automatically.
drop function if exists public.register_profile(text, text, text);
create or replace function public.register_profile(
  p_full_name text, p_role text, p_location text,
  p_employment_type text default null, p_tee_size text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_first boolean;
  r       profiles;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select email into v_email from auth.users where id = v_uid;
  select not exists (select 1 from profiles where is_admin) into v_first;

  insert into profiles (id, email, full_name, role, location, employment_type, tee_size, status, is_admin)
  values (v_uid, v_email, trim(p_full_name), p_role, p_location, p_employment_type, p_tee_size,
          case when v_first then 'active' else 'pending' end, v_first)
  on conflict (id) do update
    set full_name = excluded.full_name, role = excluded.role, location = excluded.location,
        employment_type = excluded.employment_type, tee_size = excluded.tee_size
    where profiles.status = 'pending'
  returning * into r;

  if r.id is null then select * into r from profiles where id = v_uid; end if;
  return to_jsonb(r);
end $$;

-- Everything the home screen needs in one call.
create or replace function public.get_my_state()
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare
  v_uid uuid := auth.uid();
  v_ver text := current_version();
  p     profiles;
  v_sections jsonb; v_checklist jsonb; v_docs jsonb; v_ack jsonb;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into p from profiles where id = v_uid;
  if not found then return jsonb_build_object('profile', null, 'version', v_ver); end if;
  if p.status <> 'active' then return jsonb_build_object('profile', to_jsonb(p), 'version', v_ver); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'ord', s.ord, 'track', s.track, 'kicker', s.kicker, 'title', s.title,
           'summary', s.summary, 'min_seconds', s.min_seconds,
           'question_count', (select count(*) from questions q where q.section_id = s.id),
           'started_at', pr.started_at, 'completed_at', pr.completed_at,
           'attempts', coalesce(pr.attempts, 0)) order by s.ord), '[]'::jsonb)
    into v_sections
  from sections s
  left join progress pr
    on pr.section_id = s.id and pr.user_id = v_uid and pr.code_version = private.ver_for(s.id)
  where s.roles is null or p.role = any (s.roles);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ci.id, 'title', ci.title, 'detail', ci.detail,
           'done_at', cp.done_at, 'confirmed_at', cp.confirmed_at) order by ci.ord), '[]'::jsonb)
    into v_checklist
  from checklist_items ci
  left join checklist_progress cp on cp.item_id = ci.id and cp.user_id = v_uid
  where ci.roles is null or p.role = any (ci.roles);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'title', d.title, 'description', d.description, 'url', d.url,
           'received_at', r.received_at) order by d.ord), '[]'::jsonb)
    into v_docs
  from documents d
  left join document_receipts r on r.doc_id = d.id and r.user_id = v_uid
  where d.employment_types is null or p.employment_type = any (d.employment_types);

  select to_jsonb(a) - 'signature' into v_ack
  from acknowledgements a where a.user_id = v_uid and a.code_version = v_ver;

  return jsonb_build_object('profile', to_jsonb(p), 'version', v_ver, 'sections', v_sections,
                            'checklist', v_checklist, 'documents', v_docs, 'ack', v_ack);
end $$;

-- Opening a module starts its reading clock (server time, so it can't be faked).
create or replace function public.start_section(p_section text)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  v_uid uuid := auth.uid();
  v_ver text;
  s  sections;
  pr progress;
begin
  if not is_active() then raise exception 'not_active'; end if;
  select * into s from sections where id = p_section;
  if not found or not private.applies(v_uid, p_section) then raise exception 'unknown_section'; end if;
  if private.missing_before(v_uid, p_section) > 0 then raise exception 'locked'; end if;
  v_ver := private.ver_for(p_section);

  insert into progress (user_id, section_id, code_version)
  values (v_uid, p_section, v_ver)
  on conflict (user_id, section_id, code_version) do update
    -- coming back to an unfinished module after a long break restarts the clock
    set started_at = case
      when progress.completed_at is null and progress.started_at < now() - interval '2 hours'
      then now() else progress.started_at end
  returning * into pr;

  return jsonb_build_object(
    'started_at', pr.started_at, 'now', now(), 'min_seconds', s.min_seconds,
    'completed_at', pr.completed_at,
    'elapsed', floor(extract(epoch from now() - pr.started_at))::int);
end $$;

-- Submit the quiz for a module. p_answers = {"<question id>": <option index>, ...}
create or replace function public.submit_section(p_section text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare
  v_uid uuid := auth.uid();
  v_ver text;
  s  sections;
  pr progress;
  v_elapsed int;
  v_wrong uuid[];
  v_expl jsonb;
begin
  if not is_active() then raise exception 'not_active'; end if;
  select * into s from sections where id = p_section;
  if not found or not private.applies(v_uid, p_section) then raise exception 'unknown_section'; end if;
  v_ver := private.ver_for(p_section);

  select * into pr from progress
   where user_id = v_uid and section_id = p_section and code_version = v_ver
   for update;
  if not found then raise exception 'not_started'; end if;
  if pr.completed_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  if private.missing_before(v_uid, p_section) > 0 then raise exception 'locked'; end if;

  v_elapsed := floor(extract(epoch from now() - pr.started_at))::int;
  if v_elapsed < s.min_seconds then
    return jsonb_build_object('ok', false, 'reason', 'too_soon', 'wait', s.min_seconds - v_elapsed);
  end if;

  select coalesce(array_agg(q.id order by q.ord), '{}'::uuid[]) into v_wrong
  from questions q
  join private.question_keys k on k.question_id = q.id
  where q.section_id = p_section
    and (coalesce(p_answers, '{}'::jsonb) ->> q.id::text) is distinct from k.correct::text;

  update progress
     set attempts     = attempts + 1,
         wrong_total  = wrong_total + cardinality(v_wrong),
         completed_at = case when cardinality(v_wrong) = 0 then now() end
   where user_id = v_uid and section_id = p_section and code_version = v_ver;

  insert into attempt_log (user_id, section_id, code_version, wrong)
  values (v_uid, p_section, v_ver, v_wrong);

  if cardinality(v_wrong) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'wrong', 'wrong', to_jsonb(v_wrong));
  end if;

  select coalesce(jsonb_object_agg(q.id, k.explanation), '{}'::jsonb) into v_expl
  from questions q join private.question_keys k on k.question_id = q.id
  where q.section_id = p_section;

  return jsonb_build_object('ok', true, 'explanations', v_expl);
end $$;

-- Sign the Code acknowledgement once every Code module is complete.
create or replace function public.sign_acknowledgement(p_full_name text, p_signature text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ver text := current_version();
  v_role text;
  a acknowledgements;
begin
  if not is_active() then raise exception 'not_active'; end if;
  select role into v_role from profiles where id = v_uid;
  if exists (
    select 1 from sections s
    where s.track = 'code' and (s.roles is null or v_role = any (s.roles))
      and not exists (
        select 1 from progress pr
        where pr.user_id = v_uid and pr.section_id = s.id
          and pr.code_version = v_ver and pr.completed_at is not null)
  ) then raise exception 'incomplete'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'name_required'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%'
     or length(p_signature) < 200 or length(p_signature) > 600000 then
    raise exception 'invalid_signature';
  end if;

  insert into acknowledgements (user_id, code_version, full_name, role, location, signature, user_agent)
  select v_uid, v_ver, trim(p_full_name), p.role, p.location, p_signature, left(p_user_agent, 300)
  from profiles p where p.id = v_uid
  on conflict (user_id, code_version) do nothing;

  select * into a from acknowledgements where user_id = v_uid and code_version = v_ver;
  return to_jsonb(a) - 'signature';
end $$;

-- Tick / untick a checklist item (can't untick once a manager has confirmed it).
create or replace function public.set_checklist(p_item text, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text; cp checklist_progress;
begin
  if not is_active() then raise exception 'not_active'; end if;
  select role into v_role from profiles where id = v_uid;
  if not exists (select 1 from checklist_items where id = p_item and (roles is null or v_role = any (roles))) then
    raise exception 'unknown_item';
  end if;
  insert into checklist_progress (user_id, item_id, done_at)
  values (v_uid, p_item, case when p_done then now() end)
  on conflict (user_id, item_id) do update
    set done_at = case
      when checklist_progress.confirmed_at is not null then checklist_progress.done_at
      when p_done then coalesce(checklist_progress.done_at, now())
      else null end
  returning * into cp;
  return to_jsonb(cp);
end $$;

-- Confirm you've received / read a document.
create or replace function public.acknowledge_document(p_doc text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_type text; r document_receipts;
begin
  if not is_active() then raise exception 'not_active'; end if;
  select employment_type into v_type from profiles where id = v_uid;
  if not exists (select 1 from documents where id = p_doc and (employment_types is null or v_type = any (employment_types))) then
    raise exception 'unknown_document';
  end if;
  insert into document_receipts (user_id, doc_id) values (v_uid, p_doc)
  on conflict (user_id, doc_id) do nothing;
  select * into r from document_receipts where user_id = v_uid and doc_id = p_doc;
  return to_jsonb(r);
end $$;

-- Change your own tee size (until the tee has been handed over).
create or replace function public.set_my_tee_size(p_size text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r profiles;
begin
  if not is_active() then raise exception 'not_active'; end if;
  update profiles set tee_size = p_size
   where id = auth.uid() and tee_received_at is null
  returning * into r;
  if r.id is null then raise exception 'tee_already_received'; end if;
  return to_jsonb(r);
end $$;

-- ---------------------------------------------------------------------
--  Admin functions (Shop Manager / Directors)
-- ---------------------------------------------------------------------

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare
  v_ver text := current_version();
  v_users jsonb;
  v_missed jsonb;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select coalesce(jsonb_agg(u order by u->>'sort', u->>'full_name'), '[]'::jsonb) into v_users
  from (
    select jsonb_build_object(
      'id', p.id, 'email', p.email, 'full_name', p.full_name, 'role', p.role,
      'location', p.location, 'status', p.status, 'is_admin', p.is_admin,
      'employment_type', p.employment_type, 'tee_size', p.tee_size, 'tee_received_at', p.tee_received_at,
      'created_at', p.created_at,
      'sort', case p.status when 'pending' then '0' when 'active' then '1' else '2' end,
      'attempts', (select coalesce(sum(attempts), 0) from progress pr where pr.user_id = p.id),
      'wrong_total', (select coalesce(sum(wrong_total), 0) from progress pr where pr.user_id = p.id),
      'last_activity', (select max(greatest(pr.started_at, coalesce(pr.completed_at, pr.started_at)))
                         from progress pr where pr.user_id = p.id)
    ) || private.user_summary(p.id) as u
    from profiles p
  ) t;

  select coalesce(jsonb_agg(m order by (m->>'misses')::int desc), '[]'::jsonb) into v_missed
  from (
    select jsonb_build_object('question_id', q.id, 'section', s.title, 'prompt', q.prompt,
                              'misses', count(*)) as m
    from attempt_log l
    cross join lateral unnest(l.wrong) as w(qid)
    join questions q on q.id = w.qid
    join sections s on s.id = q.section_id
    where l.code_version in (v_ver, 'base')
    group by q.id, s.title, q.prompt
    order by count(*) desc
    limit 10
  ) t;

  return jsonb_build_object('version', v_ver, 'users', v_users, 'missed', v_missed);
end $$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare v_ver text := current_version(); p profiles; v_s jsonb; v_c jsonb; v_d jsonb;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select * into p from profiles where id = p_user;
  if not found then raise exception 'unknown_user'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'track', s.track, 'kicker', s.kicker, 'title', s.title,
           'started_at', pr.started_at, 'completed_at', pr.completed_at,
           'attempts', coalesce(pr.attempts, 0), 'wrong_total', coalesce(pr.wrong_total, 0))
         order by s.ord), '[]'::jsonb) into v_s
  from sections s
  left join progress pr on pr.section_id = s.id and pr.user_id = p_user and pr.code_version = private.ver_for(s.id)
  where s.roles is null or p.role = any (s.roles);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ci.id, 'title', ci.title, 'detail', ci.detail,
           'done_at', cp.done_at, 'confirmed_at', cp.confirmed_at,
           'confirmed_by', (select full_name from profiles x where x.id = cp.confirmed_by))
         order by ci.ord), '[]'::jsonb) into v_c
  from checklist_items ci
  left join checklist_progress cp on cp.item_id = ci.id and cp.user_id = p_user
  where ci.roles is null or p.role = any (ci.roles);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'title', d.title, 'received_at', r.received_at) order by d.ord), '[]'::jsonb) into v_d
  from documents d
  left join document_receipts r on r.doc_id = d.id and r.user_id = p_user
  where d.employment_types is null or p.employment_type = any (d.employment_types);

  return jsonb_build_object('sections', v_s, 'checklist', v_c, 'documents', v_d,
    'ack', (select to_jsonb(a) from acknowledgements a where a.user_id = p_user and a.code_version = v_ver));
end $$;

create or replace function public.admin_set_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('pending','active','inactive') then raise exception 'bad_status'; end if;
  if p_user = auth.uid() and p_status <> 'active' then raise exception 'cannot_change_self'; end if;
  update profiles set status = p_status where id = p_user;
end $$;

create or replace function public.admin_set_admin(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_user = auth.uid() and not p_value then raise exception 'cannot_change_self'; end if;
  update profiles set is_admin = p_value where id = p_user;
end $$;

-- Employment type, tee size and tee hand-over.
create or replace function public.admin_update_member(
  p_user uuid, p_employment_type text, p_tee_size text, p_tee_received boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r profiles;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update profiles
     set employment_type = p_employment_type,
         tee_size = p_tee_size,
         tee_received_at = case when p_tee_received then coalesce(tee_received_at, now()) else null end
   where id = p_user
  returning * into r;
  return to_jsonb(r);
end $$;

-- Confirm (or un-confirm) a checklist item for a team member.
create or replace function public.admin_confirm_checklist(p_user uuid, p_item text, p_confirmed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not exists (select 1 from checklist_items where id = p_item) then raise exception 'unknown_item'; end if;
  insert into checklist_progress (user_id, item_id, done_at, confirmed_at, confirmed_by)
  values (p_user, p_item,
          case when p_confirmed then now() end,
          case when p_confirmed then now() end,
          case when p_confirmed then auth.uid() end)
  on conflict (user_id, item_id) do update
    set done_at      = case when p_confirmed then coalesce(checklist_progress.done_at, now()) else checklist_progress.done_at end,
        confirmed_at = case when p_confirmed then coalesce(checklist_progress.confirmed_at, now()) else null end,
        confirmed_by = case when p_confirmed then coalesce(checklist_progress.confirmed_by, auth.uid()) else null end;
end $$;

-- Publishing a new Code version means everyone completes the Code modules and signs again.
-- (The safety induction, checklist and documents are not affected.)
create or replace function public.admin_bump_version(p_version text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_version, ''));
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if length(v) = 0 or v = current_version() then raise exception 'bad_version'; end if;
  update settings set code_version = v, updated_at = now() where id = 1;
  return v;
end $$;

-- ---------------------------------------------------------------------
--  Permissions: only signed-in users can call the API functions
-- ---------------------------------------------------------------------

revoke all on all tables    in schema private from public;
revoke all on all functions in schema private from public;
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke select on all tables in schema public from anon;
