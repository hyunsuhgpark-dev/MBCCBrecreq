import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectConflicts } from '@/lib/conflict-engine'
import { notifyStaffApprovalRequested, notifyProducer } from '@/services/notification'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()

  // 기존 일정 조회
  const { data: existing } = await supabase
    .from('schedules')
    .select('*')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: '일정 없음' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, fcm_token')
    .eq('id', user.id)
    .single()

  const isOwner = existing.created_by === user.id
  const isAdmin = profile?.role === 'Admin'
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // 협의 완료 처리 (의뢰자가 conflict → pending 전환)
  if (body.action === 'resolve_conflict') {
    // 해당 일정 관련 협의 완료 여부 확인
    const { data: conflicts } = await supabase
      .from('conflicts')
      .select('*, schedules!conflicts_conflicting_schedule_id_fkey(created_by)')
      .eq('schedule_id', id)
      .eq('resolved', false)

    if (!conflicts || conflicts.length === 0) {
      await supabase.from('schedules').update({ status: 'pending' }).eq('id', id)
      return NextResponse.json({ message: '협의 완료' })
    }

    // 상대방 의뢰자도 협의 완료했는지 확인 (별도 표시 컬럼으로 관리)
    // 단순화: 현재 사용자가 누르면 즉시 pending으로 전환
    await supabase.from('conflicts').update({ resolved: true }).eq('schedule_id', id)
    await supabase.from('schedules').update({ status: 'pending' }).eq('id', id)
    await supabase.from('approvals')
      .update({ status: 'pending' })
      .eq('schedule_id', id)

    await notifyStaffApprovalRequested({
      supabase: supabase as unknown as SupabaseClient,
      scheduleId: id,
      programName: existing.program_name,
    })

    return NextResponse.json({ message: '협의 완료 처리됨' })
  }

  // 일반 수정 — 상태 초기화
  const mergedBody = { ...body }
  const broadcastStart = mergedBody.broadcast_start ?? existing.broadcast_start
  const broadcastEnd = mergedBody.broadcast_end ?? existing.broadcast_end

  const conflictResult = await detectConflicts({
    broadcastStart,
    broadcastEnd,
    venue: mergedBody.venue ?? existing.venue,
    useRelayCar: mergedBody.use_relay_car ?? existing.use_relay_car,
    useStudio: mergedBody.use_studio ?? existing.use_studio,
    useEng: mergedBody.use_eng ?? existing.use_eng,
    useAudio: mergedBody.use_audio ?? existing.use_audio,
    excludeScheduleId: id,
  })

  const newStatus = conflictResult.hasConflict ? 'conflict' : 'pending'

  await supabase
    .from('schedules')
    .update({ ...mergedBody, status: newStatus })
    .eq('id', id)

  // 승인 리셋
  await supabase
    .from('approvals')
    .update({ status: 'pending', reject_reason: null, decided_at: null, approver_id: null })
    .eq('schedule_id', id)

  // 기존 충돌 레코드 삭제 후 재생성
  await supabase.from('conflicts').delete().eq('schedule_id', id)

  if (conflictResult.hasConflict) {
    await supabase.from('conflicts').insert(
      conflictResult.conflictingScheduleIds.map((cid) => ({
        schedule_id: id,
        conflicting_schedule_id: cid,
        conflict_type: conflictResult.conflictType ?? 'venue',
      }))
    )
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
    .select('role')
    .eq('id', user.id)
    .single()

  if (existing.created_by !== user.id && profile?.role !== 'Admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // 삭제 전: 이 일정과 충돌 중인 타 의뢰서 조회
  const { data: affectedConflicts } = await supabase
    .from('conflicts')
    .select('schedule_id, schedules!conflicts_schedule_id_fkey(created_by, program_name, broadcast_start, broadcast_end, venue, use_relay_car, use_studio, use_eng, use_audio, status)')
    .eq('conflicting_schedule_id', id)

  await supabase.from('schedules').delete().eq('id', id)

  // 삭제 후: 충돌이 해소된 의뢰서들을 pending으로 전환
  for (const conflict of affectedConflicts ?? []) {
    const affected = conflict.schedules as unknown as {
      created_by: string
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
    const recheck = await detectConflicts({
      broadcastStart: affected.broadcast_start,
      broadcastEnd: affected.broadcast_end,
      venue: affected.venue,
      useRelayCar: affected.use_relay_car,
      useStudio: affected.use_studio,
      useEng: affected.use_eng,
      useAudio: affected.use_audio,
      excludeScheduleId: scheduleId,
    })

    if (!recheck.hasConflict) {
      // 충돌 해소 → pending 전환
      await supabase.from('schedules').update({ status: 'pending' }).eq('id', scheduleId)
      await supabase.from('conflicts').delete().eq('schedule_id', scheduleId)
      await supabase
        .from('approvals')
        .update({ status: 'pending', reject_reason: null, decided_at: null, approver_id: null })
        .eq('schedule_id', scheduleId)

      await notifyProducer({
        supabase: supabase as unknown as SupabaseClient,
        userId: affected.created_by,
        scheduleId,
        type: 'negotiation_complete',
        programName: affected.program_name,
      })

      await notifyStaffApprovalRequested({
        supabase: supabase as unknown as SupabaseClient,
        scheduleId,
        programName: affected.program_name,
      })
    }
  }

  return NextResponse.json({ message: '삭제 완료' })
}
