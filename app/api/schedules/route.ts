import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectConflicts } from '@/lib/conflict-engine'
import { sendPushNotification, saveNotification, notificationMessages, notifyStaffApprovalRequested, notifyAllUsersScheduleSubmitted } from '@/services/notification'
import { getScheduleResourceType } from '@/lib/roles'
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

  // 승인 레코드 초기화 — 자원 타입에 따라 필요한 파트만 생성
  const { isEngOnly, isAudioOnly } = getScheduleResourceType({
    use_relay_car: body.use_relay_car ?? false,
    use_studio: body.use_studio ?? false,
    use_eng: body.use_eng ?? false,
    use_audio: body.use_audio ?? false,
  })
  const approvalParts: { schedule_id: string; part: string; status: string }[] = []
  if (!isEngOnly) {
    // ENG-only가 아니면 office(ENG) 승인 필요
    approvalParts.push({ schedule_id: schedule.id, part: 'office', status: 'pending' })
  }
  if (!isAudioOnly) {
    // AUDIO-only가 아니면 sub_control(CAM) 승인 필요
    approvalParts.push({ schedule_id: schedule.id, part: 'sub_control', status: 'pending' })
  }
  if (approvalParts.length === 0) {
    // 모든 파트가 제외되는 경우는 없지만 안전장치
    approvalParts.push({ schedule_id: schedule.id, part: 'office', status: 'pending' })
  }
  await supabase.from('approvals').insert(approvalParts)

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
    await notifyStaffApprovalRequested({
      supabase: supabase as unknown as SupabaseClient,
      scheduleId: schedule.id,
      programName: schedule.program_name,
      scheduleResources: {
        use_relay_car: body.use_relay_car ?? false,
        use_studio: body.use_studio ?? false,
        use_eng: body.use_eng ?? false,
        use_audio: body.use_audio ?? false,
      },
    })
  }

  // 전체 사용자에게 의뢰 제출 알림 (제출자 본인 제외, fire-and-forget)
  void notifyAllUsersScheduleSubmitted({
    supabase: supabase as unknown as SupabaseClient,
    scheduleId: schedule.id,
    submitterId: user.id,
    submitterName: profile.full_name ?? '알 수 없음',
    programName: schedule.program_name,
    broadcastStart: schedule.broadcast_start,
  })

  return NextResponse.json(schedule, { status: 201 })
}
