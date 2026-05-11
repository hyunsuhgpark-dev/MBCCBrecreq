-- ============================================================
-- 002_fix_occupied_range.sql
-- occupied_range generated column: 리허설 > 방송종료 시 crash 방지
-- LEAST()로 하한이 broadcast_start를 초과하지 않도록 보정
-- ============================================================

-- 1. 기존 인덱스/컬럼 제거
drop index if exists public.schedules_occupied_range_idx;
alter table public.schedules drop column if exists occupied_range;

-- 2. 보정된 generated column 재생성
--    LEAST(coalesce(rehearsal, start), start) → 항상 ≤ broadcast_start ≤ broadcast_end
alter table public.schedules add column occupied_range tstzrange
  generated always as (
    tstzrange(
      least(coalesce(rehearsal_staff_at, broadcast_start), broadcast_start),
      broadcast_end
    )
  ) stored;

-- 3. GiST 인덱스 재생성
create index schedules_occupied_range_idx
  on public.schedules using gist (venue, occupied_range);

-- 4. 충돌 감지 RPC 함수도 동일하게 보정
create or replace function public.detect_schedule_conflicts(
  p_venue              text,
  p_rehearsal_start    timestamptz,
  p_broadcast_end      timestamptz,
  p_use_relay_car      boolean,
  p_use_studio         boolean,
  p_use_eng            boolean,
  p_use_audio          boolean,
  p_exclude_id         uuid default null
)
returns table(
  conflicting_id   uuid,
  conflict_type    text
)
language plpgsql security definer
as $$
declare
  v_range tstzrange;
begin
  -- 하한이 상한을 초과하는 경우 LEAST로 클램프
  v_range := tstzrange(least(p_rehearsal_start, p_broadcast_end), p_broadcast_end);

  return query
  select
    s.id,
    case
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
      s.venue = p_venue
      or (p_use_relay_car and s.use_relay_car)
      or (p_use_studio    and s.use_studio)
      or (p_use_eng       and s.use_eng)
      or (p_use_audio     and s.use_audio)
    );
end;
$$;
