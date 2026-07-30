'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Clock, LogOut, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PendingApprovalPage() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-body)' }}>
      <div
        className="rounded-2xl shadow-[0_20px_80px_rgba(0,0,0,0.55)] p-10 max-w-md w-full text-center border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}>
          <Tv className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}>
          <Clock className="w-6 h-6 text-amber-300" />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>승인 대기 중</h2>
        <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
          가입 신청이 완료되었습니다.<br />
          관리자가 계정을 승인하면 서비스를 이용하실 수 있습니다.<br />
          승인 완료 시 이메일로 안내드립니다.
        </p>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="gap-2 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </Button>
      </div>
    </div>
  )
}
