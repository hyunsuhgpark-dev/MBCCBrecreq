import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notifyAdminsUserSignupPush } from '@/services/notification'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile || profile.is_approved) {
    return NextResponse.json({ error: '알림 대상이 아닙니다' }, { status: 403 })
  }

  const adminClient = await createAdminClient()
  await notifyAdminsUserSignupPush({
    supabase: adminClient,
    fullName: profile.full_name,
    email: profile.email,
  })

  return NextResponse.json({ ok: true })
}
