import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isStaffSubControlRole } from '@/lib/roles'
import { notifyProducer } from '@/services/notification'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assignmentRequestSchema } from '@/lib/validation/schedule'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) return NextResponse.json({ error: '미승인 계정' }, { status: 403 })

  const canAssign = isStaffSubControlRole(profile.role) || profile.role === 'Admin'
  if (!canAssign) return NextResponse.json({ error: '영상국만 배정할 수 있습니다' }, { status: 403 })

  const { data: schedule } = await supabase
    .from('schedules')
    .select('*')
    .eq('id', id)
    .single()

  if (!schedule) return NextResponse.json({ error: '일정 없음' }, { status: 404 })
  if (schedule.request_type !== 'dispatch') {
    return NextResponse.json({ error: '배차 의뢰만 배정할 수 있습니다' }, { status: 400 })
  }
  if (schedule.status !== 'assigned') {
    return NextResponse.json({ error: '배정 대기 상태가 아닙니다' }, { status: 400 })
  }

  const parsed = assignmentRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '배정 정보를 확인해주세요' },
      { status: 400 },
    )
  }
  const body = parsed.data

  const now = new Date().toISOString()
  const adminClient = await createAdminClient()

  const { data: updated, error } = await adminClient
    .from('schedules')
    .update({
      status: 'confirmed',
      assignment_vehicles: body.assignment_vehicles,
      assignment_director_accompany: body.assignment_director_accompany,
      assignment_notes: body.assignment_notes ?? null,
      assigned_at: now,
      assigned_by: user.id,
    })
    .eq('id', id)
    .eq('status', 'assigned')  // 상태 잠금: 이미 처리된 경우 업데이트 안 됨
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: '이미 처리된 배정이거나 상태가 변경되었습니다' }, { status: 409 })
  }

  await notifyProducer({
    supabase: adminClient as unknown as SupabaseClient,
    userId: schedule.created_by,
    scheduleId: id,
    type: 'assignment_completed',
    programName: schedule.program_name,
  })

  return NextResponse.json({ message: '배정 완료' })
}
