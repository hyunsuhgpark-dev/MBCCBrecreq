-- ============================================================
-- 003_simplify_occupied_range.sql
-- 방송일시(broadcast_at) = 실제 온에어 날짜 (제작 이후)
-- 점유 구간은 제작 시작~종료로 단순화 (rehearsal 제거)
-- ============================================================

-- 1. 기존 인덱스/컬럼 제거
drop index if exists public.schedules_occupied_range_idx;
alter table public.schedules drop column if exists occupied_range;

-- 2. 단순화된 generated column 재생성
alter table public.schedules add column occupied_range tstzrange
  generated always as (
    tstzrange(broadcast_start, broadcast_end)
  ) stored;

-- 3. GiST 인덱스 재생성
create index schedules_occupied_range_idx
  on public.schedules using gist (venue, occupied_range);

-- 4. 충돌 감지 RPC 함수 재정의 (p_rehearsal_start → p_broadcast_start)
create or replace function public.detect_schedule_conflicts(
  p_venue              text,
  p_broadcast_start    timestamptz,
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
  v_range := tstzrange(p_broadcast_start, p_broadcast_end);

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
