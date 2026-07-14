-- 제작 의뢰: 녹화(recording) / 배차(dispatch) 유형, 배정 대기(assigned) 상태

alter table public.schedules drop constraint if exists schedules_status_check;
alter table public.schedules add constraint schedules_status_check
  check (status in ('conflict', 'pending', 'assigned', 'confirmed', 'rejected'));

alter table public.schedules add column if not exists request_type text not null default 'recording'
  check (request_type in ('recording', 'dispatch'));

-- PD 배차 의뢰 입력
alter table public.schedules add column if not exists passenger_count int;
alter table public.schedules add column if not exists has_luggage boolean not null default false;

-- 영상국 배정 회신 (JSON 배열: [{driver_name, vehicle_info?, contact?}])
alter table public.schedules add column if not exists assignment_vehicles jsonb;
alter table public.schedules add column if not exists assignment_director_accompany boolean;
alter table public.schedules add column if not exists assignment_notes text;
alter table public.schedules add column if not exists assigned_at timestamptz;
alter table public.schedules add column if not exists assigned_by uuid references public.profiles(id) on delete set null;

-- 알림 타입 확장
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'schedule_submitted',
    'conflict_detected',
    'negotiation_complete',
    'approval_requested',
    'approved',
    'rejected',
    'confirmed',
    'assignment_requested',
    'assignment_completed'
  ));
