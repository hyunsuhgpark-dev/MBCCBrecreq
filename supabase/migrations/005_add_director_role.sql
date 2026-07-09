-- Director 역할 추가: 일정 조율 담당 관리자 (열람·알림만, 승인 권한 없음)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Admin', 'ENG', 'CAM', 'Producer', 'Director'));
