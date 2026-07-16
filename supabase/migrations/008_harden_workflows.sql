-- 제작 의뢰 보안 강화:
-- 1) 일반 사용자의 role/is_approved 셀프 변경 차단
-- 2) 승인 파트 RLS 분리
-- 3) 일정 생성/수정/승인 워크플로를 원자적 RPC로 처리

-- profiles: 일반 사용자는 본인 full_name/fcm_token만 수정 가능
revoke update on table public.profiles from anon, authenticated;
grant update (full_name, fcm_token) on table public.profiles to authenticated;

drop policy if exists "Admin은 모든 프로필 수정 가능" on public.profiles;

-- approvals: ENG는 기술국, CAM은 영상국 파트만 직접 수정 가능
drop policy if exists "스태프 대표와 Admin만 승인 처리 가능" on public.approvals;
create policy "파트 담당자와 Admin만 승인 처리 가능"
  on public.approvals for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_approved = true
        and (
          p.role = 'Admin'
          or (p.role = 'ENG' and approvals.part = 'office')
          or (p.role = 'CAM' and approvals.part = 'sub_control')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_approved = true
        and (
          p.role = 'Admin'
          or (p.role = 'ENG' and approvals.part = 'office')
          or (p.role = 'CAM' and approvals.part = 'sub_control')
        )
    )
  );

-- 알림은 서버 service role만 생성
drop policy if exists "시스템이 알림 생성" on public.notifications;
revoke insert on table public.notifications from anon, authenticated;

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
begin
  if p_status not in ('conflict', 'pending') then
    raise exception 'INVALID_INITIAL_STATUS';
  end if;

  if p_required_parts is null or cardinality(p_required_parts) = 0 then
    raise exception 'APPROVAL_PARTS_REQUIRED';
  end if;

  insert into public.schedules (
    created_by, request_type, status, program_name, responsible_pd,
    broadcast_at, rehearsal_staff_at, rehearsal_cast_at,
    broadcast_start, broadcast_end, location, venue,
    use_relay_car, use_studio, use_eng, use_audio, is_live,
    record_content, notes, passenger_count, has_luggage
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
    coalesce((p_payload->>'has_luggage')::boolean, false)
  )
  returning * into v_schedule;

  insert into public.approvals (schedule_id, part, status)
  select v_schedule.id, part, 'pending'
  from unnest(p_required_parts) as part;

  if p_status = 'conflict' and cardinality(p_conflicting_ids) > 0 then
    insert into public.conflicts (
      schedule_id, conflicting_schedule_id, conflict_type
    )
    select
      v_schedule.id,
      conflicting_id,
      coalesce(p_conflict_type, 'venue')
    from unnest(p_conflicting_ids) as conflicting_id;
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
begin
  if p_status not in ('conflict', 'pending') then
    raise exception 'INVALID_UPDATE_STATUS';
  end if;

  if p_required_parts is null or cardinality(p_required_parts) = 0 then
    raise exception 'APPROVAL_PARTS_REQUIRED';
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

  update public.schedules
  set
    request_type = v_request_type,
    status = p_status,
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
    assignment_vehicles = case when v_request_type = 'dispatch' then null else assignment_vehicles end,
    assignment_director_accompany = case when v_request_type = 'dispatch' then null else assignment_director_accompany end,
    assignment_notes = case when v_request_type = 'dispatch' then null else assignment_notes end,
    assigned_at = case when v_request_type = 'dispatch' then null else assigned_at end,
    assigned_by = case when v_request_type = 'dispatch' then null else assigned_by end
  where id = p_schedule_id
  returning * into v_schedule;

  delete from public.approvals
  where schedule_id = p_schedule_id
    and not (part = any(p_required_parts));

  insert into public.approvals (
    schedule_id, part, status, approver_id, reject_reason, decided_at
  )
  select p_schedule_id, part, 'pending', null, null, null
  from unnest(p_required_parts) as part
  on conflict (schedule_id, part)
  do update set
    status = 'pending',
    approver_id = null,
    reject_reason = null,
    decided_at = null;

  delete from public.conflicts where schedule_id = p_schedule_id;

  if p_status = 'conflict' and cardinality(p_conflicting_ids) > 0 then
    insert into public.conflicts (
      schedule_id, conflicting_schedule_id, conflict_type
    )
    select
      p_schedule_id,
      conflicting_id,
      coalesce(p_conflict_type, 'venue')
    from unnest(p_conflicting_ids) as conflicting_id;
  end if;

  return v_schedule;
end;
$$;

create or replace function public.process_schedule_approval(
  p_schedule_id uuid,
  p_actor_id uuid,
  p_part text,
  p_action text,
  p_reject_reason text default null,
  p_force boolean default false
)
returns table (
  final_status text,
  all_confirmed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.schedules;
  v_updated_count int;
  v_all_approved boolean;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'INVALID_APPROVAL_ACTION';
  end if;

  select *
  into v_schedule
  from public.schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'SCHEDULE_NOT_FOUND';
  end if;

  if v_schedule.status <> 'pending' then
    raise exception 'SCHEDULE_NOT_PENDING';
  end if;

  if p_force then
    update public.approvals
    set
      status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      approver_id = p_actor_id,
      reject_reason = case when p_action = 'reject' then p_reject_reason else null end,
      decided_at = now()
    where schedule_id = p_schedule_id
      and status = 'pending';
  else
    if p_part not in ('office', 'sub_control') then
      raise exception 'INVALID_APPROVAL_PART';
    end if;

    update public.approvals
    set
      status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      approver_id = p_actor_id,
      reject_reason = case when p_action = 'reject' then p_reject_reason else null end,
      decided_at = now()
    where schedule_id = p_schedule_id
      and part = p_part
      and status = 'pending';

    get diagnostics v_updated_count = row_count;
    if v_updated_count = 0 then
      raise exception 'APPROVAL_ALREADY_PROCESSED';
    end if;
  end if;

  if p_action = 'reject' then
    update public.schedules
    set status = 'rejected'
    where id = p_schedule_id;

    return query select 'rejected'::text, false;
    return;
  end if;

  select not exists (
    select 1
    from public.approvals
    where schedule_id = p_schedule_id
      and status <> 'approved'
  )
  into v_all_approved;

  if v_all_approved then
    final_status := case
      when v_schedule.request_type = 'dispatch' then 'assigned'
      else 'confirmed'
    end;

    update public.schedules
    set status = final_status
    where id = p_schedule_id;

    return query select final_status, true;
  else
    return query select 'pending'::text, false;
  end if;
end;
$$;

revoke all on function public.create_schedule_request(uuid, jsonb, text, text[], uuid[], text) from public, anon, authenticated;
revoke all on function public.update_schedule_request(uuid, jsonb, text, text[], uuid[], text) from public, anon, authenticated;
revoke all on function public.process_schedule_approval(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.create_schedule_request(uuid, jsonb, text, text[], uuid[], text) to service_role;
grant execute on function public.update_schedule_request(uuid, jsonb, text, text[], uuid[], text) to service_role;
grant execute on function public.process_schedule_approval(uuid, uuid, text, text, text, boolean) to service_role;
