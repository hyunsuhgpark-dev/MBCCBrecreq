import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import ScheduleForm from '@/components/schedule-form/ScheduleForm'

export default async function NewRecordingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const prefillDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) redirect('/pending-approval')

  if (!['Producer', 'Admin'].includes(profile.role ?? '')) {
    redirect('/calendar')
  }

  return (
    <AppShell profile={profile}>
      <div className="flex min-h-[calc(100dvh-3.5rem-5rem)] sm:min-h-[calc(100dvh-3.5rem)] w-full items-center justify-center px-4 py-8">
        <div className="w-full" style={{ maxWidth: 720 }}>
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>제작/배차 요청 · 녹화</p>
          </div>
          <ScheduleForm prefillDate={prefillDate} />
        </div>
      </div>
    </AppShell>
  )
}
