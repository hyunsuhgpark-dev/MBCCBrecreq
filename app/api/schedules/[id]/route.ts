import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { detectConflicts } from '@/lib/conflict-engine'
import { notifyStaffApprovalRequested, notifyProducer } from '@/services/notification'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createScheduleSchema, updateScheduleSchema } from '@/lib/validation/schedule'
import { getRequiredApprovalParts } from '@/lib/roles'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const rawBody = await request.json()

  // 기존 일정 조회
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
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  if (existing.status === 'assigned' && !isAdmin) {
    return NextResponse.json({ error: '배정 진행 중인 의뢰는 수정할 수 없습니다' }, { status: 409 })
  }

  const adminClient = await createAdminClient()

  // 관리자 승인 취소 (confirmed → pending, 승인 초기화)
  if (rawBody.action === 'revoke_approval') {
    if (!isAdmin) {
      return NextResponse.json({ error: '관리자만 승인 취소가 가능합니다' }, { status: 403 })
    }
    if (existing.status !== 'confirmed') {
      return NextResponse.json({ error: '확정 상태의 의뢰만 승인 취소할 수 있습니다' }, { status: 409 })
    }

    const requiredParts = getRequiredApprovalParts(existing)
    const { error: revokeError } = await adminClient.rpc('update_schedule_request', {
      p_schedule_id: id,
      p_payload: {},
      p_status: 'pending',
      p_required_parts: requiredParts,
      p_conflicting_ids: [],
      p_conflict_type: null,
    })
    if (revokeError) {
      console.error('승인 취소 실패:', revokeError)
      return NextResponse.json({ error: '승인 취소에 실패했습니다' }, { status: 500 })
    }

    await notifyStaffApprovalRequested({
      supabase: adminClient as unknown as SupabaseClient,
      scheduleId: id,
      programName: existing.program_name,
      scheduleResources: existing,
    })

    return NextResponse.json({ message: '승인 취소 완료' })
  }

  // 협의 완료 처리 (의뢰자가 conflict → pending 전환)
  if (rawBody.action === 'resolve_conflict') {
    if (existing.status !== 'conflict') {
      return NextResponse.json({ error: '충돌 상태의 의뢰만 협의 완료 처리할 수 있습니다' }, { status: 409 })
    }

    const requiredParts = getRequiredApprovalParts(existing)
    const { error: resolveError } = await adminClient.rpc('update_schedule_request', {
      p_schedule_id: id,
      p_payload: {},
      p_status: 'pending',
      p_required_parts: requiredParts,
      p_conflicting_ids: [],
      p_conflict_type: null,
    })
    if (resolveError) {
      console.error('협의 완료 처리 실패:', resolveError)
      return NextResponse.json({ error: '협의 완료 처리에 실패했습니다' }, { status: 500 })
    }

    await notifyStaffApprovalRequested({
      supabase: adminClient as unknown as SupabaseClient,
      scheduleId: id,
      programName: existing.program_name,
      scheduleResources: existing,
    })

    return NextResponse.json({ message: '협의 완료 처리됨' })
  }

  // 일반 수정 — 상태 초기화
  const parsedUpdate = updateScheduleSchema.safeParse(rawBody)
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
  const broadcastStart = mergedBody.broadcast_start
  const broadcastEnd = mergedBody.broadcast_end

  let conflictResult
  try {
    conflictResult = isDispatch
      ? { hasConflict: false, conflictingScheduleIds: [], conflictType: null }
      : await detectConflicts({
          broadcastStart,
          broadcastEnd,
          venue: mergedBody.venue,
          useRelayCar: mergedBody.use_relay_car,
          useStudio: mergedBody.use_studio,
          useEng: mergedBody.use_eng,
          useAudio: mergedBody.use_audio,
          excludeScheduleId: id,
        })
  } catch (error) {
    console.error('일정 수정 충돌 검사 실패:', error)
    return NextResponse.json(
      { error: '충돌 확인에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 },
    )
  }

  const newStatus = conflictResult.hasConflict ? 'conflict' : 'pending'

  const requiredParts = getRequiredApprovalParts(mergedBody)
  const { error: updateError } = await adminClient.rpc('update_schedule_request', {
    p_schedule_id: id,
    p_payload: parsedUpdate.data,
    p_status: newStatus,
    p_required_parts: requiredParts,
    p_conflicting_ids: conflictResult.conflictingScheduleIds,
    p_conflict_type: conflictResult.conflictType,
  })
  if (updateError) {
    console.error('일정 원자적 수정 실패:', updateError)
    return NextResponse.json({ error: '의뢰서 수정에 실패했습니다' }, { status: 500 })
  }

  // 수정 후: 이 일정과 충돌 중이던 타 의뢰서 자동 해소 체크
  const { data: affectedConflicts, error: affectedError } = await adminClient
    .from('conflicts')
    .select('schedule_id, schedules!conflicts_schedule_id_fkey(created_by, request_type, program_name, broadcast_start, broadcast_end, venue, use_relay_car, use_studio, use_eng, use_audio, status)')
    .eq('conflicting_schedule_id', id)

  if (affectedError) {
    console.error('연관 충돌 조회 실패:', affectedError)
  }

  for (const conflict of affectedConflicts ?? []) {
    const affected = conflict.schedules as unknown as {
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
      status: string
    } | null
    if (!affected || affected.status !== 'conflict') continue

    const affectedId = conflict.schedule_id
    let recheck
    try {
      recheck = await detectConflicts({
        broadcastStart: affected.broadcast_start,
        broadcastEnd: affected.broadcast_end,
        venue: affected.venue,
        useRelayCar: affected.use_relay_car,
        useStudio: affected.use_studio,
        useEng: affected.use_eng,
        useAudio: affected.use_audio,
        excludeScheduleId: affectedId,
      })
    } catch (error) {
      console.error('연관 일정 충돌 재검사 실패:', error)
      continue
    }

    if (!recheck.hasConflict) {
      const affectedParts = getRequiredApprovalParts(affected)
      const { error: releaseError } = await adminClient.rpc('update_schedule_request', {
        p_schedule_id: affectedId,
        p_payload: {},
        p_status: 'pending',
        p_required_parts: affectedParts,
        p_conflicting_ids: [],
        p_conflict_type: null,
      })
      if (releaseError) {
        console.error('연관 일정 충돌 해소 실패:', releaseError)
        continue
      }

      await notifyProducer({
        supabase: adminClient as unknown as SupabaseClient,
        userId: affected.created_by,
        scheduleId: affectedId,
        type: 'negotiation_complete',
        programName: affected.program_name,
      })

      await notifyStaffApprovalRequested({
        supabase: adminClient as unknown as SupabaseClient,
        scheduleId: affectedId,
        programName: affected.program_name,
        scheduleResources: {
          use_relay_car: affected.use_relay_car,
          use_studio: affected.use_studio,
          use_eng: affected.use_eng,
          use_audio: affected.use_audio,
        },
      })
    }
  }

  // 수정 후 충돌 없으면 스태프에게 재승인 요청
  if (newStatus === 'pending') {
    await notifyStaffApprovalRequested({
      supabase: adminClient as unknown as SupabaseClient,
      scheduleId: id,
      programName: mergedBody.program_name,
      scheduleResources: {
        request_type: mergedBody.request_type,
        use_relay_car: mergedBody.use_relay_car,
        use_studio: mergedBody.use_studio,
        use_eng: mergedBody.use_eng,
        use_audio: mergedBody.use_audio,
      },
    })
  }

  return NextResponse.json({ message: '수정 완료', status: newStatus })
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

  // 삭제 전: 이 일정과 충돌 중인 타 의뢰서 조회
  const { data: affectedConflicts, error: affectedError } = await adminClient
    .from('conflicts')
    .select('schedule_id, schedules!conflicts_schedule_id_fkey(created_by, request_type, program_name, broadcast_start, broadcast_end, venue, use_relay_car, use_studio, use_eng, use_audio, status)')
    .eq('conflicting_schedule_id', id)

  if (affectedError) {
    return NextResponse.json({ error: '연관 충돌 정보를 확인하지 못했습니다' }, { status: 500 })
  }

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

  // 삭제 후: 충돌이 해소된 의뢰서들을 pending으로 전환
  for (const conflict of affectedConflicts ?? []) {
    const affected = conflict.schedules as unknown as {
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
      status: string
    } | null
    if (!affected || affected.status !== 'conflict') continue

    const scheduleId = conflict.schedule_id

    // 삭제된 일정 제외 후 재충돌 검사
    let recheck
    try {
      recheck = await detectConflicts({
        broadcastStart: affected.broadcast_start,
        broadcastEnd: affected.broadcast_end,
        venue: affected.venue,
        useRelayCar: affected.use_relay_car,
        useStudio: affected.use_studio,
        useEng: affected.use_eng,
        useAudio: affected.use_audio,
        excludeScheduleId: scheduleId,
      })
    } catch (error) {
      console.error('삭제 후 충돌 재검사 실패:', error)
      continue
    }

    if (!recheck.hasConflict) {
      // 충돌 해소 → pending 전환
      const { error: releaseError } = await adminClient.rpc('update_schedule_request', {
        p_schedule_id: scheduleId,
        p_payload: {},
        p_status: 'pending',
        p_required_parts: getRequiredApprovalParts(affected),
        p_conflicting_ids: [],
        p_conflict_type: null,
      })
      if (releaseError) {
        console.error('삭제 후 충돌 해소 실패:', releaseError)
        continue
      }

      await notifyProducer({
        supabase: adminClient as unknown as SupabaseClient,
        userId: affected.created_by,
        scheduleId,
        type: 'negotiation_complete',
        programName: affected.program_name,
      })

      await notifyStaffApprovalRequested({
        supabase: adminClient as unknown as SupabaseClient,
        scheduleId,
        programName: affected.program_name,
        scheduleResources: affected,
      })
    }
  }

  return NextResponse.json({ message: '삭제 완료' })
}
