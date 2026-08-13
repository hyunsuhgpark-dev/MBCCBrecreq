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
      <div className="flex min-h-[calc(100dvh-3.5rem-5rem)] sm:min-h-[calc(100dvh-3.5rem)] w-full justify-center px-4 py-8 pb-28 sm:pb-10">
        <div className="w-full my-auto" style={{ maxWidth: isDispatch ? Math.round(896 * 0.9) : 720 }}>
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              제작/배차 요청 · {isDispatch ? '배차' : '녹화'}
            </p>
            {isDispatch ? null : (
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">녹화 의뢰서 수정</h1>
            )}
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>수정하면 캘린더에 바로 반영됩니다.</p>
          </div>
          {isDispatch ? (
            <DispatchForm initialData={schedule} scheduleId={id} />
          ) : (
            <ScheduleForm initialData={schedule} scheduleId={id} />
          )}
        </div>
      </div>
    </AppShell>
  )
}
