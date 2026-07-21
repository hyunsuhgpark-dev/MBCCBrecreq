-- 회원가입 신청 시 Admin에게 알림

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
    'assignment_completed',
    'user_signup_requested'
  ));

create or replace function public.notify_admins_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text;
begin
  if new.is_approved then
    return new;
  end if;

  v_message := coalesce(nullif(new.full_name, ''), '신규 사용자')
    || '님이 회원가입을 신청했습니다. (' || new.email || ')';

  insert into public.notifications (user_id, schedule_id, type, message)
  select p.id, null, 'user_signup_requested', v_message
  from public.profiles p
  where p.role = 'Admin'
    and p.is_approved = true;

  return new;
end;
$$;

drop trigger if exists on_profile_created_notify_admins on public.profiles;
create trigger on_profile_created_notify_admins
  after insert on public.profiles
  for each row execute function public.notify_admins_new_signup();
