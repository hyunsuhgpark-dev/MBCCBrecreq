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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#003A73] via-[#004F9A] to-[#1A6DB5]">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md mx-4 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-4">
          <Tv className="w-8 h-8 text-[#004F9A]" />
        </div>
        <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-50 rounded-full mb-4">
          <Clock className="w-6 h-6 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">승인 대기 중</h2>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          가입 신청이 완료되었습니다.<br />
          관리자가 계정을 승인하면 서비스를 이용하실 수 있습니다.<br />
          승인 완료 시 이메일로 안내드립니다.
        </p>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </Button>
      </div>
    </div>
  )
}
