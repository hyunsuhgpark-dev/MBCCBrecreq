import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isStaffRole, roleToApprovalPart, getRequiredApprovalParts } from '@/lib/roles'
import { sendPushNotification, saveNotification, notificationMessages } from '@/services/notification'
import { dispatchWebhook } from '@/services/webhook'
import type { SupabaseClient } from '@supabase/supabase-js'

const WEBHOOK_SCHEDULE_SELECT = 'id, created_by, request_type, program_name, responsible_pd, venue, location, broadcast_start, broadcast_end, broadcast_at, rehearsal_staff_at, rehearsal_cast_at, use_relay_car, use_studio, use_eng, use_audio, is_live, record_content, notes'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) return NextResponse.json({ error: '미승인 계정' }, { status: 403 })

  if (!isStaffRole(profile.role) && profile.role !== 'Admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { scheduleId, action, rejectReason } = await request.json()
  // action: 'approve' | 'reject' | 'force_approve'

  // Admin 강제 승인
  if (action === 'force_approve' && profile.role === 'Admin') {
    await supabase
      .from('approvals')
      .update({ status: 'approved', approver_id: user.id, decided_at: new Date().toISOString() })
      .eq('schedule_id', scheduleId)

    const { data: schedule } = await supabase
      .from('schedules')
      .select(`${WEBHOOK_SCHEDULE_SELECT}, profiles!schedules_created_by_fkey(fcm_token)`)
      .eq('id', scheduleId)
      .single()

    const isDispatch = schedule?.request_type === 'dispatch'
    const finalStatus = isDispatch ? 'assigned' : 'confirmed'

    await supabase.from('schedules').update({ status: finalStatus }).eq('id', scheduleId)

    if (schedule) {
      const notifType = isDispatch ? 'assignment_requested' : 'confirmed'
      await saveNotification({
        supabase: supabase as unknown as SupabaseClient,
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
          title: isDispatch ? '배차 승인' : '일정 확정',
          body: notificationMessages[notifType](schedule.program_name),
          scheduleId,
        })
      }

      if (!isDispatch) {
        void dispatchWebhook('schedule.confirmed', { ...schedule, status: 'confirmed' })
      }
    }

    return NextResponse.json({ message: '강제 승인 완료' })
  }

  // 일반 승인 처리
  const part = roleToApprovalPart(profile.role)
  if (!part) {
    return NextResponse.json({ error: '승인 파트를 확인할 수 없습니다' }, { status: 403 })
  }

  // 승인/반려 처리
  const updateData: Record<string, unknown> = {
    approver_id: user.id,
    decided_at: new Date().toISOString(),
    status: action === 'approve' ? 'approved' : 'rejected',
  }
  if (action === 'reject') updateData.reject_reason = rejectReason

  const { data: updatedApprovals } = await supabase
    .from('approvals')
    .update(updateData)
    .eq('schedule_id', scheduleId)
    .eq('part', part)
    .select('id')

  // 해당 파트의 승인 레코드가 없으면 권한 없음
  // (예: ENG가 배차 의뢰[sub_control 전용]를 approve/reject 시도하는 경우)
  if (!updatedApprovals || updatedApprovals.length === 0) {
    return NextResponse.json({ error: '해당 의뢰에 대한 승인 권한이 없습니다' }, { status: 403 })
  }

  const { data: schedule } = await supabase
    .from('schedules')
    .select(`${WEBHOOK_SCHEDULE_SELECT}, profiles!schedules_created_by_fkey(fcm_token)`)
    .eq('id', scheduleId)
    .single()

  if (!schedule) return NextResponse.json({ error: '일정 없음' }, { status: 404 })

  if (action === 'reject') {
    await supabase.from('schedules').update({ status: 'rejected' }).eq('id', scheduleId)

    await saveNotification({
      supabase: supabase as unknown as SupabaseClient,
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

    return NextResponse.json({ message: '반려 처리 완료' })
  }

  const isDispatch = schedule.request_type === 'dispatch'
  const requiredParts = getRequiredApprovalParts({
    request_type: schedule.request_type,
    use_relay_car: schedule.use_relay_car ?? false,
    use_studio: schedule.use_studio ?? false,
    use_eng: schedule.use_eng ?? false,
    use_audio: schedule.use_audio ?? false,
  })

  const { data: allApprovals } = await supabase
    .from('approvals')
    .select('part, status')
    .eq('schedule_id', scheduleId)

  const allApproved = requiredParts.every((rp) => {
    const rec = allApprovals?.find((a) => a.part === rp)
    return rec?.status === 'approved'
  })

  if (allApproved) {
    const finalStatus = isDispatch ? 'assigned' : 'confirmed'
    const notifType = isDispatch ? 'assignment_requested' : 'confirmed'

    await supabase.from('schedules').update({ status: finalStatus }).eq('id', scheduleId)

    await saveNotification({
      supabase: supabase as unknown as SupabaseClient,
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
      supabase: supabase as unknown as SupabaseClient,
      userId: schedule.created_by,
      scheduleId,
      type: 'approved',
      message: notificationMessages.approved(schedule.program_name),
    })
  }

  return NextResponse.json({ message: '승인 처리 완료', allConfirmed: allApproved })
}
