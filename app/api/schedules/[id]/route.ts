import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { detectConflicts } from '@/lib/conflict-engine'
import { notifyProducer } from '@/services/notification'
import { dispatchWebhook } from '@/services/webhook'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createScheduleSchema, updateScheduleSchema } from '@/lib/validation/schedule'
import { isStaffRole } from '@/lib/roles'
import type { ConflictCheckInput } from '@/lib/types'

type AffectedSchedule = {
  id: string
  created_by: string
  request_type: string
  program_name: string
  broadcast_start: string
  broadcast_end: string
  venue: string
  use_relay_car: boolean
  use_studio: boolean
  use_eng: boolean
  use_audio: boolean
  has_conflict: boolean
}

function toConflictInput(s: AffectedSchedule, excludeId: string): ConflictCheckInput {
  return {
    broadcastStart: s.broadcast_start,
    broadcastEnd: s.broadcast_end,
    venue: s.venue,
    useRelayCar: s.use_relay_car,
    useStudio: s.use_studio,
    useEng: s.use_eng,
    useAudio: s.use_audio,
    excludeScheduleId: excludeId,
    requestType: s.request_type === 'dispatch' ? 'dispatch' : 'recording',
  }
}

const PEER_FIELDS =
  'id, created_by, request_type, program_name, broadcast_start, broadcast_end, venue, use_relay_car, use_studio, use_eng, use_audio, has_conflict'

async function collectPeerIds(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  scheduleId: string,
): Promise<string[]> {
  const [{ data: asSource }, { data: asTarget }] = await Promise.all([
    adminClient.from('conflicts').select('conflicting_schedule_id').eq('schedule_id', scheduleId),
    adminClient.from('conflicts').select('schedule_id').eq('conflicting_schedule_id', scheduleId),
  ])
  const ids = new Set<string>()
  for (const row of asSource ?? []) {
    if (row.conflicting_schedule_id) ids.add(row.conflicting_schedule_id)
  }
  for (const row of asTarget ?? []) {
    if (row.schedule_id) ids.add(row.schedule_id)
  }
  ids.delete(scheduleId)
  return [...ids]
}

async function recheckPeers(
  adminClient: Awaited<ReturnType<typeof createAdminClient>>,
  peerIds: string[],
) {
  if (peerIds.length === 0) return

  const { data: peers, error } = await adminClient
    .from('schedules')
    .select(PEER_FIELDS)
    .in('id', peerIds)

  if (error) {
    console.error('연관 일정 조회 실패:', error)
    return
  }

  for (const affected of (peers ?? []) as AffectedSchedule[]) {
    if (!affected.has_conflict) continue
    const affectedId = affected.id

    let recheck
    try {
      recheck = await detectConflicts(toConflictInput(affected, affectedId))
    } catch (err) {
      console.error('연관 일정 충돌 재검사 실패:', err)
      continue
    }

    if (!recheck.hasConflict) {
      const { error: releaseError } = await adminClient
        .from('schedules')
        .update({ has_conflict: false })
        .eq('id', affectedId)
      if (releaseError) {
        console.error('연관 일정 충돌 해소 실패:', releaseError)
        continue
      }
      await adminClient.from('conflicts').delete().eq('schedule_id', affectedId)

      await notifyProducer({
        supabase: adminClient as unknown as SupabaseClient,
        userId: affected.created_by,
        scheduleId: affectedId,
        type: 'negotiation_complete',
        programName: affected.program_name,
      })
    }
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const rawBody = await request.json() as Record<string, unknown>

  const { data: existing } = await supabase
    .from('schedules')
    .select('*')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: '일정 없음' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) {
    return NextResponse.json({ error: '미승인 계정입니다' }, { status: 403 })
  }

  const isOwner = existing.created_by === user.id
  const isAdmin = profile?.role === 'Admin'
  const canResolve = isAdmin || isStaffRole(profile.role)

  const adminClient = await createAdminClient()

  if (rawBody.action === 'resolve_conflict') {
    if (!canResolve) {
      return NextResponse.json({ error: '조율 완료는 기술국·영상국·관리자만 처리할 수 있습니다' }, { status: 403 })
    }
    if (!existing.has_conflict) {
      return NextResponse.json({ error: '충돌 표시가 없는 일정입니다' }, { status: 409 })
    }

    const { error: resolveError } = await adminClient
      .from('schedules')
      .update({ has_conflict: false })
      .eq('id', id)
    if (resolveError) {
      console.error('조율 완료 처리 실패:', resolveError)
      return NextResponse.json({ error: '조율 완료 처리에 실패했습니다' }, { status: 500 })
    }

    await adminClient
      .from('conflicts')
      .update({ resolved: true })
      .eq('schedule_id', id)

    return NextResponse.json({ message: '조율 완료 처리됨' })
  }

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const force = rawBody.force === true
  const { force: _force, action: _action, ...rest } = rawBody

  const parsedUpdate = updateScheduleSchema.safeParse(rest)
  if (!parsedUpdate.success) {
    return NextResponse.json(
      { error: parsedUpdate.error.issues[0]?.message ?? '입력값을 확인해주세요' },
      { status: 400 },
    )
  }
  if (Object.keys(parsedUpdate.data).length === 0) {
    return NextResponse.json({ error: '수정할 값이 없습니다' }, { status: 400 })
  }

  const mergedResult = createScheduleSchema.safeParse({
    request_type: existing.request_type,
    program_name: existing.program_name,
    responsible_pd: existing.responsible_pd,
    broadcast_at: existing.broadcast_at,
    rehearsal_staff_at: existing.rehearsal_staff_at,
    rehearsal_cast_at: existing.rehearsal_cast_at,
    broadcast_start: existing.broadcast_start,
    broadcast_end: existing.broadcast_end,
    location: existing.location,
    venue: existing.venue,
    use_relay_car: existing.use_relay_car,
    use_studio: existing.use_studio,
    use_eng: existing.use_eng,
    use_audio: existing.use_audio,
    is_live: existing.is_live,
    record_content: existing.record_content,
    notes: existing.notes,
    passenger_count: existing.passenger_count,
    has_luggage: existing.has_luggage,
    notify_tech: existing.notify_tech,
    ...parsedUpdate.data,
  })
  if (!mergedResult.success) {
    return NextResponse.json(
      { error: mergedResult.error.issues[0]?.message ?? '수정값을 확인해주세요' },
      { status: 400 },
    )
  }

  const mergedBody = mergedResult.data
  const isDispatch = mergedBody.request_type === 'dispatch'

  let conflictResult
  try {
    conflictResult = await detectConflicts({
      broadcastStart: mergedBody.broadcast_start,
      broadcastEnd: mergedBody.broadcast_end,
      venue: mergedBody.venue,
      useRelayCar: mergedBody.use_relay_car,
      useStudio: mergedBody.use_studio,
      useEng: mergedBody.use_eng,
      useAudio: mergedBody.use_audio,
      excludeScheduleId: id,
      requestType: isDispatch ? 'dispatch' : 'recording',
    })
  } catch (error) {
    console.error('일정 수정 충돌 검사 실패:', error)
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

  const peerIds = await collectPeerIds(adminClient, id)

  const { error: updateError } = await adminClient.rpc('update_schedule_request', {
    p_schedule_id: id,
    p_payload: parsedUpdate.data,
    p_status: 'confirmed',
    p_required_parts: [],
    p_conflicting_ids: force ? conflictResult.conflictingScheduleIds : [],
    p_conflict_type: force ? conflictResult.conflictType : null,
  })
  if (updateError) {
    console.error('일정 원자적 수정 실패:', updateError)
    return NextResponse.json({ error: '의뢰서 수정에 실패했습니다' }, { status: 500 })
  }

  await recheckPeers(adminClient, peerIds)

  const { data: updated } = await adminClient
    .from('schedules')
    .select('*')
    .eq('id', id)
    .single()
  if (updated) {
    void dispatchWebhook('schedule.confirmed', updated)
  }

  return NextResponse.json({ message: '수정 완료', status: 'confirmed' })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: existing } = await supabase
    .from('schedules')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: '일정 없음' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) {
    return NextResponse.json({ error: '미승인 계정입니다' }, { status: 403 })
  }

  if (existing.created_by !== user.id && profile.role !== 'Admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const adminClient = await createAdminClient()

  const peerIds = await collectPeerIds(adminClient, id)

  const { data: deleted, error: deleteError } = await adminClient
    .from('schedules')
    .delete()
    .eq('id', id)
    .select('id')

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: '이미 삭제된 의뢰입니다' }, { status: 409 })
  }

  await recheckPeers(adminClient, peerIds)

  return NextResponse.json({ message: '삭제 완료' })
}
