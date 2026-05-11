import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { token } = await request.json()

  await supabase.from('profiles').update({ fcm_token: token }).eq('id', user.id)
  return NextResponse.json({ message: '토큰 저장 완료' })
}
