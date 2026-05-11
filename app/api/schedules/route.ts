import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectConflicts } from '@/lib/conflict-engine'
import { sendPushNotification, saveNotification, notificationMessages } from '@/services/notification'
import { dispatchWebhook } from '@/services/webhook'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) {
    return NextResponse.json({ error: '미승인 계정입니다' }, { status: 403 })
  }

  const body = await request.json()

  const broadcastStart = body.broadcast_start
  const broadcastEnd = body.broadcast_end

  // 충돌 감지
  const conflictResult = await detectConflicts({
    broadcastStart,
    broadcastEnd,
    venue: body.venue,
    useRelayCar: body.use_relay_car ?? false,
    useStudio: body.use_studio ?? false,
    useEng: body.use_eng ?? false,
    useAudio: body.use_audio ?? false,
  })

  const initialStatus = conflictResult.hasConflict ? 'conflict' : 'pending'

  // 일정 생성
  const { data: schedule, error } = await supabase
    .from('schedules')
    .insert({
      ...body,
      created_by: user.id,
      status: initialStatus,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 승인 레코드 초기화 (2파트: office, sub_control)
  await supabase.from('approvals').insert([
    { schedule_id: schedule.id, part: 'office', status: 'pending' },
    { schedule_id: schedule.id, part: 'sub_control', status: 'pending' },
  ])

  // 충돌 처리
  if (conflictResult.hasConflict) {
    const conflictInserts = conflictResult.conflictingScheduleIds.map((cid) => ({
      schedule_id: schedule.id,
      conflicting_schedule_id: cid,
      conflict_type: conflictResult.conflictType ?? 'venue',
    }))
    await supabase.from('conflicts').insert(conflictInserts)

    // 충돌 대상 일정의 생성자들 조회 후 알림 발송
    const { data: conflictingSchedules } = await supabase
      .from('schedules')
      .select('created_by, program_name, profiles(fcm_token)')
      .in('id', conflictResult.conflictingScheduleIds)

    const tokens: string[] = []
    for (const cs of conflictingSchedules ?? []) {
      await saveNotification({
        supabase: supabase as unknown as SupabaseClient,
        userId: cs.created_by,
        scheduleId: schedule.id,
        type: 'conflict_detected',
        message: notificationMessages.conflict_detected(schedule.program_name),
      })
      const token = (cs as { profiles?: { fcm_token?: string } }).profiles?.fcm_token
      if (token) tokens.push(token)
    }

    // 본인에게도 알림
    await saveNotification({
      supabase: supabase as unknown as SupabaseClient,
      userId: user.id,
      scheduleId: schedule.id,
      type: 'conflict_detected',
      message: notificationMessages.conflict_detected(schedule.program_name),
    })

    if (profile.fcm_token) tokens.push(profile.fcm_token)
    if (tokens.length > 0) {
      await sendPushNotification({
        tokens,
        type: 'conflict_detected',
        title: '일정 충돌 감지',
        body: notificationMessages.conflict_detected(schedule.program_name),
        scheduleId: schedule.id,
      })
    }
  } else {
    // 스태프 대표에게 승인 요청 알림
    const { data: staffProfiles } = await supabase
      .from('profiles')
      .select('id, fcm_token')
      .in('role', ['Staff_Office', 'Staff_SubControl'])
      .eq('is_approved', true)

    const staffTokens = (staffProfiles ?? [])
      .filter((p) => p.fcm_token)
      .map((p) => p.fcm_token as string)

    for (const sp of staffProfiles ?? []) {
      await saveNotification({
        supabase: supabase as unknown as SupabaseClient,
        userId: sp.id,
        scheduleId: schedule.id,
        type: 'approval_requested',
        message: notificationMessages.approval_requested(schedule.program_name),
      })
    }

    if (staffTokens.length > 0) {
      await sendPushNotification({
        tokens: staffTokens,
        type: 'approval_requested',
        title: '승인 요청',
        body: notificationMessages.approval_requested(schedule.program_name),
        scheduleId: schedule.id,
      })
    }
  }

  // 웹훅 발송 (fire-and-forget — 실패해도 응답 지연 없음)
  void dispatchWebhook('schedule.created', {
    id: schedule.id,
    program_name: schedule.program_name,
    responsible_pd: schedule.responsible_pd,
    status: schedule.status,
    venue: schedule.venue,
    broadcast_start: schedule.broadcast_start,
    broadcast_end: schedule.broadcast_end,
    rehearsal_staff_at: schedule.rehearsal_staff_at ?? null,
    is_live: schedule.is_live,
    notes: schedule.notes,
    created_by: schedule.created_by,
  })

  return NextResponse.json(schedule, { status: 201 })
}
