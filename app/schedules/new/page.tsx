import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { Clapperboard, Car } from 'lucide-react'

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const dateQuery = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : ''

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
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">제작 의뢰</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            의뢰 유형을 선택하세요.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href={`/schedules/new/recording${dateQuery}`}
            className="rounded-2xl border flex flex-col items-center gap-4 transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              padding: '32px 24px 24px',
            }}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white">
              <Clapperboard className="w-8 h-8 text-black" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">녹화 의뢰</h2>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                중계차·스튜디오·ENG·AUDIO 등<br />녹화 일정 의뢰
              </p>
            </div>
          </Link>

          <Link
            href={`/schedules/new/dispatch${dateQuery}`}
            className="rounded-2xl border flex flex-col items-center gap-4 transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              padding: '32px 24px 24px',
            }}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white">
              <Car className="w-8 h-8 text-black" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">배차 의뢰</h2>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                차량·기사 배정 요청<br />영상국 승인 후 배정
              </p>
            </div>
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
