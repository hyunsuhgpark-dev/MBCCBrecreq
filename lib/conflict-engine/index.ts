import { createClient } from '@/lib/supabase/server'
import type {
  ConflictCheckInput,
  ConflictResult,
  ConflictType,
  OverlapEvent,
  RequestType,
} from '@/lib/types'

type RpcRow = { conflicting_id: string; conflict_type: string }

export async function detectConflicts(input: ConflictCheckInput): Promise<ConflictResult> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('detect_schedule_conflicts', {
    p_venue: input.venue,
    p_broadcast_start: input.broadcastStart,
    p_broadcast_end: input.broadcastEnd,
    p_use_relay_car: input.useRelayCar,
    p_use_studio: input.useStudio,
    p_use_eng: input.useEng,
    p_use_audio: input.useAudio,
    p_exclude_id: input.excludeScheduleId ?? null,
    p_request_type: input.requestType ?? 'recording',
  })

  if (error) {
    console.error('충돌 감지 오류:', error)
    throw new Error('일정 충돌 확인에 실패했습니다')
  }

  const rows = (data ?? []) as RpcRow[]
  if (rows.length === 0) {
    return { hasConflict: false, conflictingScheduleIds: [], conflictType: null, overlaps: [] }
  }

  const ids = rows.map((row) => row.conflicting_id)
  const typeById = new Map(rows.map((row) => [row.conflicting_id, row.conflict_type as ConflictType]))

  const types = rows.map((row) => row.conflict_type)
  let conflictType: ConflictResult['conflictType'] = 'resource'
  if (types.includes('both')) conflictType = 'both'
  else if (types.includes('venue')) conflictType = 'venue'

  const { data: schedules } = await supabase
    .from('schedules')
    .select('id, program_name, responsible_pd, broadcast_start, broadcast_end, venue, request_type')
    .in('id', ids)

  const overlaps: OverlapEvent[] = (schedules ?? []).map((s) => ({
    id: s.id,
    program_name: s.program_name,
    responsible_pd: s.responsible_pd,
    broadcast_start: s.broadcast_start,
    broadcast_end: s.broadcast_end,
    venue: s.venue,
    request_type: (s.request_type ?? 'recording') as RequestType,
    conflict_type: typeById.get(s.id) ?? 'resource',
  }))

  return {
    hasConflict: true,
    conflictingScheduleIds: ids,
    conflictType,
    overlaps,
  }
}
