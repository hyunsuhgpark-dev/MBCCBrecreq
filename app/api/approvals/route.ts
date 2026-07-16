import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isStaffRole, roleToApprovalPart } from '@/lib/roles'
import { sendPushNotification, saveNotification, notificationMessages } from '@/services/notification'
import { dispatchWebhook } from '@/services/webhook'
import type { SupabaseClient } from '@supabase/supabase-js'
import { approvalRequestSchema } from '@/lib/validation/schedule'

const WEBHOOK_SCHEDULE_SELECT = 'id, created_by, request_type, program_name, responsible_pd, venue, location, broadcast_start, broadcast_end, broadcast_at, rehearsal_staff_at, rehearsal_cast_at, use_relay_car, use_studio, use_eng, use_audio, is_live, record_content, notes'

function approvalErrorResponse(message: string) {
  if (
    message.includes('SCHEDULE_NOT_PENDING') ||
    message.includes('APPROVAL_ALREADY_PROCESSED')
  ) {
    return NextResponse.json(
      { error: '이미 처리되었거나 상태가 변경된 의뢰입니다' },
      { status: 409 },
    )
  }
  if (message.includes('SCHEDULE_NOT_FOUND')) {
    return NextResponse.json({ error: '일정 없음' }, { status: 404 })
  }
  return NextResponse.json({ error: '승인 처리에 실패했습니다' }, { status: 500 })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) {
    return NextResponse.json({ error: '미승인 계정' }, { status: 403 })
  }

  const parsed = approvalRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '요청값을 확인해주세요' },
      { status: 400 },
    )
  }

  const { scheduleId, action, rejectReason } = parsed.data
  const isForce = action === 'force_approve'

  if (isForce) {
    if (profile.role !== 'Admin') {
      return NextResponse.json({ error: '관리자만 강제 승인할 수 있습니다' }, { status: 403 })
    }
  } else if (!isStaffRole(profile.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const part = isForce ? null : roleToApprovalPart(profile.role)
  if (!isForce && !part) {
    return NextResponse.json({ error: '승인 파트를 확인할 수 없습니다' }, { status: 403 })
  }

  const adminClient = await createAdminClient()
  const rpcAction = action === 'reject' ? 'reject' : 'approve'
  const { data: result, error: approvalError } = await adminClient.rpc(
    'process_schedule_approval',
    {
      p_schedule_id: scheduleId,
      p_actor_id: user.id,
      p_part: part,
      p_action: rpcAction,
      p_reject_reason: rejectReason ?? null,
      p_force: isForce,
    },
  )

  if (approvalError) {
    console.error('원자적 승인 처리 실패:', approvalError)
    return approvalErrorResponse(approvalError.message)
  }

  const outcome = (Array.isArray(result) ? result[0] : result) as {
    final_status: string
    all_confirmed: boolean
  } | null

  if (!outcome) {
    return NextResponse.json({ error: '승인 처리 결과를 확인하지 못했습니다' }, { status: 500 })
  }

  const { data: schedule, error: scheduleError } = await adminClient
    .from('schedules')
    .select(`${WEBHOOK_SCHEDULE_SELECT}, profiles!schedules_created_by_fkey(fcm_token)`)
    .eq('id', scheduleId)
    .single()

  if (scheduleError || !schedule) {
    console.error('승인 후 일정 조회 실패:', scheduleError)
    return NextResponse.json({ error: '승인된 일정을 확인하지 못했습니다' }, { status: 500 })
  }

  const isDispatch = schedule.request_type === 'dispatch'
  const notificationClient = adminClient as unknown as SupabaseClient

  if (rpcAction === 'reject') {
    await saveNotification({
      supabase: notificationClient,
      userId: schedule.created_by,
      scheduleId,
      type: 'rejected',
      message: notificationMessages.rejected(schedule.program_name),
    })

    const token = (schedule as { profiles?: { fcm_token?: string } }).profiles?.fcm_token
    if (token) {
      await sendPushNotification({
        tokens: [token],
        type: 'rejected',
        title: '일정 반려',
        body: notificationMessages.rejected(schedule.program_name),
        scheduleId,
      })
    }

    return NextResponse.json({ message: '반려 처리 완료', allConfirmed: false })
  }

  if (outcome.all_confirmed) {
    const notifType = isDispatch ? 'assignment_requested' : 'confirmed'
    await saveNotification({
      supabase: notificationClient,
      userId: schedule.created_by,
      scheduleId,
      type: notifType,
      message: notificationMessages[notifType](schedule.program_name),
    })

    const token = (schedule as { profiles?: { fcm_token?: string } }).profiles?.fcm_token
    if (token) {
      await sendPushNotification({
        tokens: [token],
        type: notifType,
        title: isDispatch ? '배차 승인' : '일정 최종 확정',
        body: notificationMessages[notifType](schedule.program_name),
        scheduleId,
      })
    }

    if (!isDispatch) {
      void dispatchWebhook('schedule.confirmed', { ...schedule, status: 'confirmed' })
    }
  } else {
    await saveNotification({
      supabase: notificationClient,
      userId: schedule.created_by,
      scheduleId,
      type: 'approved',
      message: notificationMessages.approved(schedule.program_name),
    })
  }

  return NextResponse.json({
    message: isForce ? '강제 승인 완료' : '승인 처리 완료',
    allConfirmed: outcome.all_confirmed,
  })
}
