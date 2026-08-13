-- 승인 게이트 제거: 즉시 confirmed 공개 + has_conflict 플래그
-- 배차도 시간 겹침 검사에 포함

alter table public.schedules
  add column if not exists has_conflict boolean not null default false;

update public.schedules
set
  has_conflict = (status = 'conflict'),
  status = 'confirmed'
where status in ('pending', 'assigned', 'conflict');

drop function if exists public.detect_schedule_conflicts(text, timestamptz, timestamptz, boolean, boolean, boolean, boolean, uuid);

create or replace function public.detect_schedule_conflicts(
  p_venue              text,
  p_broadcast_start    timestamptz,
  p_broadcast_end      timestamptz,
  p_use_relay_car      boolean,
  p_use_studio         boolean,
  p_use_eng            boolean,
  p_use_audio          boolean,
  p_exclude_id         uuid default null,
  p_request_type       text default 'recording'
)
returns table(
  conflicting_id   uuid,
  conflict_type    text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_range tstzrange;
begin
  v_range := tstzrange(p_broadcast_start, p_broadcast_end);

  return query
  select
    s.id,
    case
      when p_request_type = 'dispatch' and s.request_type = 'dispatch'
        and s.venue = p_venue
      then 'both'::text
      when p_request_type = 'dispatch' and s.request_type = 'dispatch'
      then 'resource'::text
      when s.venue = p_venue
       and (
         (p_use_relay_car and s.use_relay_car) or
         (p_use_studio    and s.use_studio)    or
         (p_use_eng       and s.use_eng)       or
         (p_use_audio     and s.use_audio)
       )
      then 'both'::text
      when s.venue = p_venue
      then 'venue'::text
      else 'resource'::text
    end as conflict_type
  from public.schedules s
  where
    s.status not in ('rejected')
    and s.id != coalesce(p_exclude_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and s.occupied_range && v_range
    and (
      (p_request_type = 'dispatch' and s.request_type = 'dispatch')
      or s.venue = p_venue
      or (p_use_relay_car and s.use_relay_car)
      or (p_use_studio    and s.use_studio)
      or (p_use_eng       and s.use_eng)
      or (p_use_audio     and s.use_audio)
    );
end;
$$;

grant execute on function public.detect_schedule_conflicts(text, timestamptz, timestamptz, boolean, boolean, boolean, boolean, uuid, text) to authenticated, service_role;

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
    record_content, notes, passenger_count, has_luggage, has_conflict
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
    v_has_conflict
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
    has_luggage = case when p_payload ? 'has_luggage' then (p_payload->>'has_luggage')::boolean else has_luggage end
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
