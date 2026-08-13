import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { detectConflicts } from '@/lib/conflict-engine'
import { sendPushNotification, saveNotification, notificationMessages, notifyAllUsersScheduleSubmitted } from '@/services/notification'
import { dispatchWebhook } from '@/services/webhook'
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

  const raw = await request.json() as Record<string, unknown>
  const force = raw.force === true
  const { force: _force, ...rest } = raw
  if ('notify_tech' in rest) {
    rest.notify_tech = rest.notify_tech === true || rest.notify_tech === 'true'
  }

  const parsed = createScheduleSchema.safeParse(rest)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해주세요' },
      { status: 400 },
    )
  }

  const body = parsed.data
  const isDispatch = body.request_type === 'dispatch'

  let conflictResult
  try {
    conflictResult = await detectConflicts({
      broadcastStart: body.broadcast_start,
      broadcastEnd: body.broadcast_end,
      venue: body.venue,
      useRelayCar: body.use_relay_car,
      useStudio: body.use_studio,
      useEng: body.use_eng,
      useAudio: body.use_audio,
      requestType: isDispatch ? 'dispatch' : 'recording',
    })
  } catch (error) {
    console.error('일정 생성 충돌 검사 실패:', error)
    return NextResponse.json(
      { error: '충돌 확인에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 },
    )
  }

  if (conflictResult.hasConflict && !force) {
    return NextResponse.json(
      { error: 'SCHEDULE_OVERLAP', conflicts: conflictResult.overlaps },
      { status: 409 },
    )
  }

  const adminClient = await createAdminClient()
  const { data: created, error: createError } = await adminClient.rpc('create_schedule_request', {
    p_created_by: user.id,
    p_payload: body,
    p_status: 'confirmed',
    p_required_parts: [],
    p_conflicting_ids: force ? conflictResult.conflictingScheduleIds : [],
    p_conflict_type: force ? conflictResult.conflictType : null,
  })

  if (createError) {
    console.error('일정 원자적 생성 실패:', createError)
    return NextResponse.json({ error: '의뢰서 저장에 실패했습니다' }, { status: 500 })
  }

  const schedule = (Array.isArray(created) ? created[0] : created) as {
    id: string
    program_name: string
    broadcast_start: string
    created_by: string
    status: string
    responsible_pd?: string | null
    venue?: string | null
    location?: string | null
    broadcast_end?: string | null
    broadcast_at?: string | null
    rehearsal_staff_at?: string | null
    rehearsal_cast_at?: string | null
    use_relay_car?: boolean | null
    use_studio?: boolean | null
    use_eng?: boolean | null
    use_audio?: boolean | null
    is_live?: boolean | null
    record_content?: string | null
    notes?: string | null
    request_type?: string
  } | null

  if (!schedule?.id) {
    return NextResponse.json({ error: '생성된 의뢰서를 확인할 수 없습니다' }, { status: 500 })
  }

  if (force && conflictResult.hasConflict) {
    const { data: conflictingSchedules } = await adminClient
      .from('schedules')
      .select('created_by, program_name, creator:profiles!schedules_created_by_fkey(fcm_token)')
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
      const token = (cs as { creator?: { fcm_token?: string } }).creator?.fcm_token
      if (token) tokens.push(token)
    }

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
  }

  void notifyAllUsersScheduleSubmitted({
    supabase: adminClient as unknown as SupabaseClient,
    scheduleId: schedule.id,
    submitterId: user.id,
    submitterName: profile.full_name ?? '알 수 없음',
    programName: schedule.program_name,
    broadcastStart: schedule.broadcast_start,
    requestType: isDispatch ? 'dispatch' : 'recording',
    notifyTech: isDispatch && body.notify_tech === true,
  })

  void dispatchWebhook('schedule.confirmed', schedule)

  return NextResponse.json(schedule, { status: 201 })
}
