-- Staff_Office / Staff_SubControl → ENG / CAM (앱 코드와 통일)
update public.profiles set role = 'ENG' where role = 'Staff_Office';
update public.profiles set role = 'CAM' where role = 'Staff_SubControl';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Admin', 'ENG', 'CAM', 'Producer'));

drop policy if exists "스태프 대표와 Admin만 승인 처리 가능" on public.approvals;
create policy "스태프 대표와 Admin만 승인 처리 가능"
  on public.approvals for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_approved = true
        and p.role in ('ENG', 'CAM', 'Admin')
    )
  );
