import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import ScheduleForm from '@/components/schedule-form/ScheduleForm'
import DispatchForm from '@/components/schedule-form/DispatchForm'

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

  const isDispatch = schedule.request_type === 'dispatch'

  return (
    <AppShell profile={profile}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <p className="text-xs font-semibold mb-1" style={{ color: isDispatch ? '#C084FC' : 'var(--accent)' }}>
            제작 의뢰 · {isDispatch ? '배차' : '녹화'}
          </p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {isDispatch ? '배차 의뢰서 수정' : '녹화 의뢰서 수정'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>수정 후 제출하면 승인 절차가 초기화됩니다.</p>
        </div>
        {isDispatch ? (
          <DispatchForm initialData={schedule} scheduleId={id} />
        ) : (
          <ScheduleForm initialData={schedule} scheduleId={id} />
        )}
      </div>
    </AppShell>
  )
}
