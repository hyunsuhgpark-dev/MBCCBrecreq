import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import ScheduleForm from '@/components/schedule-form/ScheduleForm'

export default async function EditSchedulePage({
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

  const { data: schedule } = await supabase
    .from('schedules')
    .select('*')
    .eq('id', id)
    .single()

  if (!schedule) notFound()

  const isOwner = schedule.created_by === user.id
  if (!isOwner && profile.role !== 'Admin') redirect(`/schedules/${id}`)

  return (
    <AppShell profile={profile}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">녹화 의뢰서 수정</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>수정 후 제출하면 승인 절차가 초기화됩니다.</p>
        </div>
        <ScheduleForm initialData={schedule} scheduleId={id} />
      </div>
    </AppShell>
  )
}
