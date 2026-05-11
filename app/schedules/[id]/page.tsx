import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import ScheduleDetail from '@/components/schedule-detail/ScheduleDetail'

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) redirect('/pending-approval')

  const { data: schedule, error } = await supabase
    .from('schedules')
    .select(`
      *,
      creator:profiles!schedules_created_by_fkey(id, full_name, role, email),
      approvals(id, part, status, reject_reason, decided_at, approver_id),
      conflicts!conflicts_schedule_id_fkey(id, conflicting_schedule_id, conflict_type, resolved)
    `)
    .eq('id', id)
    .single()

  if (error) console.error('[schedule detail]', error)
  if (!schedule) notFound()

  return (
    <AppShell profile={profile}>
      <ScheduleDetail schedule={schedule} profile={profile} />
    </AppShell>
  )
}
