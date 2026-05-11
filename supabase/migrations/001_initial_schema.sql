-- ============================================================
-- 001_initial_schema.sql
-- 방송 일정 관리 시스템 초기 스키마
-- ============================================================

-- extensions
create extension if not exists btree_gist;

-- ============================================================
-- profiles 테이블 (auth.users 확장)
-- ============================================================
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null default '',
  email        text not null default '',
  role         text check (role in ('Admin', 'Staff_Office', 'Staff_SubControl', 'Producer')),
  is_approved  boolean not null default false,
  fcm_token    text,
  created_at   timestamptz not null default now()
);

-- 신규 가입 시 자동으로 profiles 레코드 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- schedules 테이블
-- ============================================================
create table public.schedules (
  id                  uuid primary key default gen_random_uuid(),
  created_by          uuid not null references public.profiles(id) on delete restrict,
  status              text not null default 'pending'
                        check (status in ('conflict', 'pending', 'confirmed', 'rejected')),
  program_name        text not null default '',
  responsible_pd      text not null default '',
  broadcast_at        timestamptz,
  rehearsal_staff_at  timestamptz,
  rehearsal_cast_at   timestamptz,
  broadcast_start     timestamptz not null,
  broadcast_end       timestamptz not null,
  location            text not null default '',
  venue               text not null default '',
  use_relay_car       boolean not null default false,
  use_studio          boolean not null default false,
  use_eng             boolean not null default false,
  use_audio           boolean not null default false,
  is_live             boolean not null default false,
  record_content      text not null default '',
  notes               text not null default '',
  -- 점유 구간 (리허설 시작 ~ 본방 종료)
  occupied_range      tstzrange generated always as (
    tstzrange(
      coalesce(rehearsal_staff_at, broadcast_start),
      broadcast_end
    )
  ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint valid_time check (broadcast_start < broadcast_end)
);

-- GiST 인덱스: 시간 범위 충돌 쿼리 최적화
create index schedules_occupied_range_idx
  on public.schedules using gist (venue, occupied_range);

create index schedules_status_idx
  on public.schedules (status);

create index schedules_created_by_idx
  on public.schedules (created_by);

-- updated_at 자동 갱신
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schedules_updated_at
  before update on public.schedules
  for each row execute procedure public.update_updated_at();

-- ============================================================
-- conflicts 테이블
-- ============================================================
create table public.conflicts (
  id                       uuid primary key default gen_random_uuid(),
  schedule_id              uuid not null references public.schedules(id) on delete cascade,
  conflicting_schedule_id  uuid not null references public.schedules(id) on delete cascade,
  conflict_type            text not null check (conflict_type in ('venue', 'resource', 'both')),
  resolved                 boolean not null default false,
  created_at               timestamptz not null default now(),
  unique(schedule_id, conflicting_schedule_id)
);

-- ============================================================
-- approvals 테이블
-- ============================================================
create table public.approvals (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid not null references public.schedules(id) on delete cascade,
  approver_id    uuid references public.profiles(id) on delete set null,
  part           text not null check (part in ('office', 'sub_control')),
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  reject_reason  text,
  decided_at     timestamptz,
  unique(schedule_id, part)
);

-- ============================================================
-- notifications 테이블
-- ============================================================
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  schedule_id uuid references public.schedules(id) on delete set null,
  type        text not null check (type in (
    'conflict_detected',
    'negotiation_complete',
    'approval_requested',
    'approved',
    'rejected',
    'confirmed'
  )),
  message     text not null default '',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index notifications_user_id_idx
  on public.notifications (user_id, is_read, created_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.conflicts enable row level security;
alter table public.approvals enable row level security;
alter table public.notifications enable row level security;

-- profiles RLS
create policy "로그인 사용자는 모든 프로필 조회 가능"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "본인 프로필만 수정 가능"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admin은 모든 프로필 수정 가능"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- schedules RLS
create policy "승인된 사용자는 모든 일정 조회 가능"
  on public.schedules for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_approved = true
    )
  );

create policy "승인된 사용자는 일정 생성 가능"
  on public.schedules for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_approved = true
    )
  );

create policy "본인 일정 수정 가능"
  on public.schedules for update
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

create policy "본인 일정 삭제 가능"
  on public.schedules for delete
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- conflicts RLS
create policy "승인된 사용자는 충돌 조회 가능"
  on public.conflicts for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_approved = true
    )
  );

create policy "시스템이 충돌 생성"
  on public.conflicts for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_approved = true
    )
  );

-- approvals RLS
create policy "승인된 사용자는 승인 현황 조회 가능"
  on public.approvals for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_approved = true
    )
  );

create policy "스태프 대표와 Admin만 승인 처리 가능"
  on public.approvals for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_approved = true
        and p.role in ('Staff_Office', 'Staff_SubControl', 'Admin')
    )
  );

create policy "시스템이 승인 레코드 생성"
  on public.approvals for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_approved = true
    )
  );

-- notifications RLS
create policy "본인 알림만 조회 가능"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "본인 알림 읽음 처리"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "시스템이 알림 생성"
  on public.notifications for insert
  with check (true);

-- ============================================================
-- 충돌 감지 RPC 함수
-- ============================================================
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
  v_range := tstzrange(p_rehearsal_start, p_broadcast_end);

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
