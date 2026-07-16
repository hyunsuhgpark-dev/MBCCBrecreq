import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { detectConflicts } from '@/lib/conflict-engine'
import { sendPushNotification, saveNotification, notificationMessages, notifyStaffApprovalRequested, notifyAllUsersScheduleSubmitted } from '@/services/notification'
import { getRequiredApprovalParts } from '@/lib/roles'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createScheduleSchema } from '@/lib/validation/schedule'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved, full_name, fcm_token')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) {
    return NextResponse.json({ error: '미승인 계정입니다' }, { status: 403 })
  }

  if (!['Producer', 'Admin'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: '제작진과 관리자만 의뢰를 생성할 수 있습니다' }, { status: 403 })
  }

  const parsed = createScheduleSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해주세요' },
      { status: 400 },
    )
  }

  const body = parsed.data
  const isDispatch = body.request_type === 'dispatch'

  const broadcastStart = body.broadcast_start
  const broadcastEnd = body.broadcast_end

  // 배차 의뢰는 자원 충돌 검사 생략 (중계차·스튜디오 미사용)
  let conflictResult
  try {
    conflictResult = isDispatch
      ? { hasConflict: false, conflictingScheduleIds: [], conflictType: null }
      : await detectConflicts({
          broadcastStart,
          broadcastEnd,
          venue: body.venue,
          useRelayCar: body.use_relay_car,
          useStudio: body.use_studio,
          useEng: body.use_eng,
          useAudio: body.use_audio,
        })
  } catch (error) {
    console.error('일정 생성 충돌 검사 실패:', error)
    return NextResponse.json(
      { error: '충돌 확인에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 },
    )
  }

  const initialStatus = conflictResult.hasConflict ? 'conflict' : 'pending'

  const requiredParts = getRequiredApprovalParts({
    request_type: body.request_type,
    use_relay_car: body.use_relay_car,
    use_studio: body.use_studio,
    use_eng: body.use_eng,
    use_audio: body.use_audio,
  })

  const adminClient = await createAdminClient()
  const { data: created, error: createError } = await adminClient.rpc('create_schedule_request', {
    p_created_by: user.id,
    p_payload: body,
    p_status: initialStatus,
    p_required_parts: requiredParts,
    p_conflicting_ids: conflictResult.conflictingScheduleIds,
    p_conflict_type: conflictResult.conflictType,
  })

  if (createError) {
    console.error('일정 원자적 생성 실패:', createError)
    return NextResponse.json({ error: '의뢰서 저장에 실패했습니다' }, { status: 500 })
  }

  const schedule = (Array.isArray(created) ? created[0] : created) as {
    id: string
    program_name: string
    broadcast_start: string
  } | null

  if (!schedule?.id) {
    return NextResponse.json({ error: '생성된 의뢰서를 확인할 수 없습니다' }, { status: 500 })
  }

  // 충돌 처리
  if (conflictResult.hasConflict) {
    // 충돌 대상 일정의 생성자들 조회 후 알림 발송
    const { data: conflictingSchedules } = await adminClient
      .from('schedules')
      .select('created_by, program_name, profiles(fcm_token)')
      .in('id', conflictResult.conflictingScheduleIds)

    const tokens: string[] = []
    for (const cs of conflictingSchedules ?? []) {
      await saveNotification({
        supabase: adminClient as unknown as SupabaseClient,
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
      supabase: adminClient as unknown as SupabaseClient,
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
      supabase: adminClient as unknown as SupabaseClient,
      scheduleId: schedule.id,
      programName: schedule.program_name,
      scheduleResources: {
        request_type: isDispatch ? 'dispatch' : 'recording',
        use_relay_car: body.use_relay_car ?? false,
        use_studio: body.use_studio ?? false,
        use_eng: body.use_eng ?? false,
        use_audio: body.use_audio ?? false,
      },
    })
  }

  void notifyAllUsersScheduleSubmitted({
    supabase: adminClient as unknown as SupabaseClient,
    scheduleId: schedule.id,
    submitterId: user.id,
    submitterName: profile.full_name ?? '알 수 없음',
    programName: schedule.program_name,
    broadcastStart: schedule.broadcast_start,
    requestType: isDispatch ? 'dispatch' : 'recording',
  })

  return NextResponse.json(schedule, { status: 201 })
}
