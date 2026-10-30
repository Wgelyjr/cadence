-- ============================================================================
-- BabyApp — initial schema
-- Care groups, children, care events, sync RPCs, RLS.
--
-- Design: last-write-wins sync. Clients push full rows (JSON) via RPC so the
-- server can apply a guarded upsert without per-row RLS round-trips. Every
-- row belongs to a care group; membership is via `group_members`.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.care_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My care group',
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  care_group_id uuid not null references public.care_groups (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, care_group_id)
);

create table if not exists public.children (
  id uuid primary key,
  care_group_id uuid not null references public.care_groups (id) on delete cascade,
  name text not null,
  birth_date date not null,
  birth_time text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists children_group_idx
  on public.children (care_group_id, updated_at);

-- One flexible event table for every care type.
create table if not exists public.care_events (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  care_group_id uuid not null references public.care_groups (id) on delete cascade,
  type text not null check (type in (
    'sleep', 'feed', 'diaper', 'growth', 'health',
    'milestone', 'solid_food', 'allergy', 'contraction'
  )),
  start_time timestamptz not null,
  end_time timestamptz,

  sleep_kind text check (sleep_kind in ('nap', 'night')),
  feed_method text check (feed_method in ('nursing', 'bottle', 'pump')),
  feed_side text check (feed_side in ('left', 'right', 'both')),
  feed_side_duration_min int,
  bottle_ml int,
  pump_ml int,
  diaper_type text check (diaper_type in ('wet', 'dirty', 'mixed')),
  stool_color text,
  stool_consistency text,
  height_cm numeric(6,2),
  weight_kg numeric(6,2),
  head_cm numeric(6,2),
  temp_c numeric(4,1),
  medicine_name text,
  medicine_dose text,
  label text,
  food_items text[],
  allergy_reaction text,
  allergy_severity text check (allergy_severity in ('mild', 'moderate', 'severe')),
  contraction_duration_sec int,
  note text,
  photos text[],

  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists care_events_child_time_idx
  on public.care_events (child_id, start_time desc);
create index if not exists care_events_group_idx
  on public.care_events (care_group_id, updated_at);

-- Keep care_group_id in sync with the parent child (clients also send it).
create or replace function public.set_event_care_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.care_group_id is distinct from (
    select care_group_id from public.children where id = new.child_id
  ) then
    new.care_group_id := (
      select care_group_id from public.children where id = new.child_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists care_events_set_group on public.care_events;
create trigger care_events_set_group
  before insert or update of child_id on public.care_events
  for each row execute function public.set_event_care_group();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.care_group_of(_uuid uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select care_group_id from public.group_members where user_id = _uuid;
$$;

create or replace function public.in_group(_uuid uuid, _gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where user_id = _uuid and care_group_id = _gid
  );
$$;

-- Automatically create a care group + membership when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  insert into public.care_groups (name)
  values (coalesce(new.raw_user_meta_data->>'name', 'My care group'))
  returning id into gid;

  insert into public.group_members (user_id, care_group_id)
  values (new.id, gid)
  on conflict (user_id, care_group_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Sync RPCs (last-write-wins guarded upsert)
-- ---------------------------------------------------------------------------

create or replace function public.upsert_children(
  rows jsonb,
  care_group_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  n int := 0;
begin
  if not public.in_group(auth.uid(), care_group_id) then
    raise exception 'not a member of this care group';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    insert into public.children as c
      (id, care_group_id, name, birth_date, birth_time, color, created_at, updated_at)
    values (
      (r->>'id')::uuid,
      care_group_id,
      r->>'name',
      (r->>'birth_date')::date,
      r->>'birth_time',
      r->>'color',
      (r->>'created_at')::timestamptz,
      (r->>'updated_at')::timestamptz
    )
    on conflict (id) do update set
      name = excluded.name,
      birth_date = excluded.birth_date,
      birth_time = excluded.birth_time,
      color = excluded.color,
      updated_at = excluded.updated_at
    -- LWW guard: only apply remote row if it is newer.
    where c.updated_at <= excluded.updated_at;

    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

create or replace function public.upsert_events(
  rows jsonb,
  care_group_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  n int := 0;
begin
  if not public.in_group(auth.uid(), care_group_id) then
    raise exception 'not a member of this care group';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    insert into public.care_events as e
      (id, child_id, care_group_id, type, start_time, end_time,
       sleep_kind, feed_method, feed_side, feed_side_duration_min,
       bottle_ml, pump_ml, diaper_type, stool_color, stool_consistency,
       height_cm, weight_kg, head_cm, temp_c, medicine_name, medicine_dose,
       label, food_items, allergy_reaction, allergy_severity,
       contraction_duration_sec, note, photos, deleted,
       created_at, updated_at)
    values (
      (r->>'id')::uuid,
      (r->>'child_id')::uuid,
      care_group_id,
      r->>'type',
      (r->>'start_time')::timestamptz,
      (r->>'end_time')::timestamptz,
      r->>'sleep_kind', r->>'feed_method', r->>'feed_side',
      (r->>'feed_side_duration_min')::int,
      (r->>'bottle_ml')::int, (r->>'pump_ml')::int,
      r->>'diaper_type', r->>'stool_color', r->>'stool_consistency',
      (r->>'height_cm')::numeric, (r->>'weight_kg')::numeric,
      (r->>'head_cm')::numeric, (r->>'temp_c')::numeric,
      r->>'medicine_name', r->>'medicine_dose',
      r->>'label',
      case when jsonb_typeof(r->'food_items') = 'array' then
        coalesce((select array_agg(x) from jsonb_array_elements_text(r->'food_items') x), '{}'::text[])
      else null end,
      r->>'allergy_reaction', r->>'allergy_severity',
      (r->>'contraction_duration_sec')::int,
      r->>'note',
      case when jsonb_typeof(r->'photos') = 'array' then
        coalesce((select array_agg(x) from jsonb_array_elements_text(r->'photos') x), '{}'::text[])
      else null end,
      coalesce((r->>'deleted')::boolean, false),
      (r->>'created_at')::timestamptz,
      (r->>'updated_at')::timestamptz
    )
    on conflict (id) do update set
      type = excluded.type,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      sleep_kind = excluded.sleep_kind,
      feed_method = excluded.feed_method,
      feed_side = excluded.feed_side,
      feed_side_duration_min = excluded.feed_side_duration_min,
      bottle_ml = excluded.bottle_ml,
      pump_ml = excluded.pump_ml,
      diaper_type = excluded.diaper_type,
      stool_color = excluded.stool_color,
      stool_consistency = excluded.stool_consistency,
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      head_cm = excluded.head_cm,
      temp_c = excluded.temp_c,
      medicine_name = excluded.medicine_name,
      medicine_dose = excluded.medicine_dose,
      label = excluded.label,
      food_items = excluded.food_items,
      allergy_reaction = excluded.allergy_reaction,
      allergy_severity = excluded.allergy_severity,
      contraction_duration_sec = excluded.contraction_duration_sec,
      note = excluded.note,
      photos = excluded.photos,
      deleted = excluded.deleted,
      updated_at = excluded.updated_at
    where e.updated_at <= excluded.updated_at;

    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.care_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.children enable row level security;
alter table public.care_events enable row level security;

-- Members can see their group(s).
drop policy if exists "members read group" on public.care_groups;
create policy "members read group" on public.care_groups
  for select using (public.in_group(auth.uid(), id));

-- Members manage membership only through app functions; direct reads for own rows.
drop policy if exists "members read membership" on public.group_members;
create policy "members read membership" on public.group_members
  for select using (user_id = auth.uid());

-- Children & events: visible + writable iff the caller is a member of the row's group.
drop policy if exists "children read" on public.children;
create policy "children read" on public.children
  for select using (public.in_group(auth.uid(), care_group_id));

drop policy if exists "children write" on public.children;
create policy "children write" on public.children
  for all using (public.in_group(auth.uid(), care_group_id))
  with check (public.in_group(auth.uid(), care_group_id));

drop policy if exists "events read" on public.care_events;
create policy "events read" on public.care_events
  for select using (public.in_group(auth.uid(), care_group_id));

drop policy if exists "events write" on public.care_events;
create policy "events write" on public.care_events
  for all using (public.in_group(auth.uid(), care_group_id))
  with check (public.in_group(auth.uid(), care_group_id));

grant usage on schema public to authenticated;
