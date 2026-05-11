import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'Admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return NextResponse.json(users)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'Admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { userId, role, isApproved } = await request.json()

  const adminClient = await createAdminClient()
  const updateData: Record<string, unknown> = {}
  if (role !== undefined) updateData.role = role
  if (isApproved !== undefined) updateData.is_approved = isApproved

  await adminClient.from('profiles').update(updateData).eq('id', userId)
  return NextResponse.json({ message: '업데이트 완료' })
}
