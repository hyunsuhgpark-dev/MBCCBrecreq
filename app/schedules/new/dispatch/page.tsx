import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import DispatchForm from '@/components/schedule-form/DispatchForm'

export default async function NewDispatchPage({
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
          <p className="text-xs font-semibold mb-1 text-purple-300">제작 의뢰 · 배차</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">배차 의뢰서 작성</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            이동 일정과 목적지를 입력하세요. 영상국 승인 후 차량·기사가 배정됩니다.
          </p>
        </div>
        <DispatchForm prefillDate={prefillDate} />
      </div>
    </AppShell>
  )
}
