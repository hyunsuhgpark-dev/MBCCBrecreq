import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { adminUserUpdateSchema } from '@/lib/validation/schedule'

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

  const parsed = adminUserUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '요청값을 확인해주세요' },
      { status: 400 },
    )
  }

  const { userId, role, isApproved } = parsed.data
  if (userId === user.id && (role !== undefined || isApproved === false)) {
    return NextResponse.json({ error: '현재 관리자 계정의 권한은 직접 변경할 수 없습니다' }, { status: 409 })
  }

  const adminClient = await createAdminClient()
  const updateData: Record<string, unknown> = {}
  if (role !== undefined) updateData.role = role
  if (isApproved !== undefined) updateData.is_approved = isApproved

  const { data: updated, error } = await adminClient
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
    .select('id')
  if (error) {
    console.error('프로필 업데이트 실패:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다' }, { status: 404 })
  }
  return NextResponse.json({ message: '업데이트 완료' })
}
