import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import ScheduleForm from '@/components/schedule-form/ScheduleForm'

export default async function NewSchedulePage({
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
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">녹화 의뢰서 작성</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>아래 양식을 작성하여 녹화를 의뢰하세요.</p>
        </div>
        <ScheduleForm prefillDate={prefillDate} />
      </div>
    </AppShell>
  )
}
