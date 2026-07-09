-- ENG-M (기술국 모니터), CAM-M (영상국 모니터) 역할 추가
-- 승인 권한 없음, 열람·알림만 가능 (Director와 동일)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Admin', 'ENG', 'ENG-M', 'CAM', 'CAM-M', 'Producer', 'Director'));
