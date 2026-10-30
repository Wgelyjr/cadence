-- ============================================================================
-- Custom event types
--
-- Users can define their own event types (e.g. "vitamins", "tummy time").
-- Events of such a type are stored with type = 'custom' plus:
--   custom_type_id  the user-defined type id (device-side, not a row here)
--   custom_label    denormalized label, so entries still render after the
--                   user deletes the type or on a device without it
-- ============================================================================

alter table public.care_events drop constraint if exists care_events_type_check;
alter table public.care_events
  add constraint care_events_type_check check (type in (
    'sleep', 'feed', 'diaper', 'growth', 'health',
    'milestone', 'solid_food', 'allergy', 'contraction', 'custom'
  ));

alter table public.care_events add column if not exists custom_type_id text;
alter table public.care_events add column if not exists custom_label text;

-- Re-create the events upsert so it carries the two new columns.
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
       custom_type_id, custom_label,
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
      r->>'custom_type_id', r->>'custom_label',
      r->>'label',
      case when r ? 'food_items' then
        coalesce((select array_agg(x) from jsonb_array_elements_text(r->'food_items') x), '{}'::text[])
      else null end,
      r->>'allergy_reaction', r->>'allergy_severity',
      (r->>'contraction_duration_sec')::int,
      r->>'note',
      case when r ? 'photos' then
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
      custom_type_id = excluded.custom_type_id,
      custom_label = excluded.custom_label,
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
