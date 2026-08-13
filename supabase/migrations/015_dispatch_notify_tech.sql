-- 배차: 기술국 알림(사전답사 등). 중계차 자원 충돌과는 별개.

alter table public.schedules
  add column if not exists notify_tech boolean not null default false;

create or replace function public.create_schedule_request(
  p_created_by uuid,
  p_payload jsonb,
  p_status text,
  p_required_parts text[],
  p_conflicting_ids uuid[] default array[]::uuid[],
  p_conflict_type text default null
)
returns public.schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules;
  v_has_conflict boolean;
begin
  if p_status <> 'confirmed' then
    raise exception 'INVALID_INITIAL_STATUS';
  end if;

  v_has_conflict := coalesce(cardinality(p_conflicting_ids), 0) > 0;

  insert into public.schedules (
    created_by, request_type, status, program_name, responsible_pd,
    broadcast_at, rehearsal_staff_at, rehearsal_cast_at,
    broadcast_start, broadcast_end, location, venue,
    use_relay_car, use_studio, use_eng, use_audio, is_live,
    record_content, notes, passenger_count, has_luggage, has_conflict, notify_tech
  )
  values (
    p_created_by,
    p_payload->>'request_type',
    p_status,
    p_payload->>'program_name',
    p_payload->>'responsible_pd',
    nullif(p_payload->>'broadcast_at', '')::timestamptz,
    nullif(p_payload->>'rehearsal_staff_at', '')::timestamptz,
    nullif(p_payload->>'rehearsal_cast_at', '')::timestamptz,
    (p_payload->>'broadcast_start')::timestamptz,
    (p_payload->>'broadcast_end')::timestamptz,
    coalesce(p_payload->>'location', ''),
    p_payload->>'venue',
    coalesce((p_payload->>'use_relay_car')::boolean, false),
    coalesce((p_payload->>'use_studio')::boolean, false),
    coalesce((p_payload->>'use_eng')::boolean, false),
    coalesce((p_payload->>'use_audio')::boolean, false),
    coalesce((p_payload->>'is_live')::boolean, false),
    coalesce(p_payload->>'record_content', ''),
    coalesce(p_payload->>'notes', ''),
    nullif(p_payload->>'passenger_count', '')::int,
    coalesce((p_payload->>'has_luggage')::boolean, false),
    v_has_conflict,
    coalesce((p_payload->>'notify_tech')::boolean, false)
  )
  returning * into v_schedule;

  if v_has_conflict then
    insert into public.conflicts (
      schedule_id, conflicting_schedule_id, conflict_type
    )
    select
      v_schedule.id,
      conflicting_id,
      coalesce(p_conflict_type, 'venue')
    from unnest(p_conflicting_ids) as conflicting_id;

    update public.schedules
    set has_conflict = true
    where id = any(p_conflicting_ids);
  end if;

  return v_schedule;
end;
$$;

create or replace function public.update_schedule_request(
  p_schedule_id uuid,
  p_payload jsonb,
  p_status text,
  p_required_parts text[],
  p_conflicting_ids uuid[] default array[]::uuid[],
  p_conflict_type text default null
)
returns public.schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.schedules;
  v_schedule public.schedules;
  v_request_type text;
  v_has_conflict boolean;
begin
  if p_status <> 'confirmed' then
    raise exception 'INVALID_UPDATE_STATUS';
  end if;

  select *
  into v_existing
  from public.schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'SCHEDULE_NOT_FOUND';
  end if;

  v_request_type := case
    when p_payload ? 'request_type' then p_payload->>'request_type'
    else v_existing.request_type
  end;

  v_has_conflict := coalesce(cardinality(p_conflicting_ids), 0) > 0;

  update public.schedules
  set
    request_type = v_request_type,
    status = p_status,
    has_conflict = v_has_conflict,
    program_name = case when p_payload ? 'program_name' then p_payload->>'program_name' else program_name end,
    responsible_pd = case when p_payload ? 'responsible_pd' then p_payload->>'responsible_pd' else responsible_pd end,
    broadcast_at = case when p_payload ? 'broadcast_at' then nullif(p_payload->>'broadcast_at', '')::timestamptz else broadcast_at end,
    rehearsal_staff_at = case when p_payload ? 'rehearsal_staff_at' then nullif(p_payload->>'rehearsal_staff_at', '')::timestamptz else rehearsal_staff_at end,
    rehearsal_cast_at = case when p_payload ? 'rehearsal_cast_at' then nullif(p_payload->>'rehearsal_cast_at', '')::timestamptz else rehearsal_cast_at end,
    broadcast_start = case when p_payload ? 'broadcast_start' then (p_payload->>'broadcast_start')::timestamptz else broadcast_start end,
    broadcast_end = case when p_payload ? 'broadcast_end' then (p_payload->>'broadcast_end')::timestamptz else broadcast_end end,
    location = case when p_payload ? 'location' then coalesce(p_payload->>'location', '') else location end,
    venue = case when p_payload ? 'venue' then p_payload->>'venue' else venue end,
    use_relay_car = case when p_payload ? 'use_relay_car' then (p_payload->>'use_relay_car')::boolean else use_relay_car end,
    use_studio = case when p_payload ? 'use_studio' then (p_payload->>'use_studio')::boolean else use_studio end,
    use_eng = case when p_payload ? 'use_eng' then (p_payload->>'use_eng')::boolean else use_eng end,
    use_audio = case when p_payload ? 'use_audio' then (p_payload->>'use_audio')::boolean else use_audio end,
    is_live = case when p_payload ? 'is_live' then (p_payload->>'is_live')::boolean else is_live end,
    record_content = case when p_payload ? 'record_content' then coalesce(p_payload->>'record_content', '') else record_content end,
    notes = case when p_payload ? 'notes' then coalesce(p_payload->>'notes', '') else notes end,
    passenger_count = case when p_payload ? 'passenger_count' then nullif(p_payload->>'passenger_count', '')::int else passenger_count end,
    has_luggage = case when p_payload ? 'has_luggage' then (p_payload->>'has_luggage')::boolean else has_luggage end,
    notify_tech = case when p_payload ? 'notify_tech' then (p_payload->>'notify_tech')::boolean else notify_tech end
  where id = p_schedule_id
  returning * into v_schedule;

  delete from public.conflicts where schedule_id = p_schedule_id;

  if v_has_conflict then
    insert into public.conflicts (
      schedule_id, conflicting_schedule_id, conflict_type
    )
    select
      p_schedule_id,
      conflicting_id,
      coalesce(p_conflict_type, 'venue')
    from unnest(p_conflicting_ids) as conflicting_id;

    update public.schedules
    set has_conflict = true
    where id = any(p_conflicting_ids);
  end if;

  return v_schedule;
end;
$$;
