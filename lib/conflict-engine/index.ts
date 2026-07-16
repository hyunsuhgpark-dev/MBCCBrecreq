import { createClient } from '@/lib/supabase/server'
import type { ConflictCheckInput, ConflictResult } from '@/lib/types'

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
  })

  if (error) {
    console.error('충돌 감지 오류:', error)
    throw new Error('일정 충돌 확인에 실패했습니다')
  }

  if (!data || data.length === 0) {
    return { hasConflict: false, conflictingScheduleIds: [], conflictType: null }
  }

  const ids = data.map((row: { conflicting_id: string }) => row.conflicting_id)

  // 충돌 유형 결정 (both > venue > resource 우선순위)
  const types = data.map((row: { conflict_type: string }) => row.conflict_type)
  let conflictType: ConflictResult['conflictType'] = 'resource'
  if (types.includes('both')) conflictType = 'both'
  else if (types.includes('venue')) conflictType = 'venue'

  return {
    hasConflict: true,
    conflictingScheduleIds: ids,
    conflictType,
  }
}
