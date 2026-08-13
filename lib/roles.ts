import type { ApprovalPart, UserRole } from '@/lib/types'

/** 승인 권한이 있는 스태프 역할 */
export const STAFF_ROLES = ['ENG', 'CAM'] as const satisfies readonly UserRole[]

/** 모니터 역할 (열람·알림만, 승인 권한 없음) */
export const MONITOR_ROLES = ['ENG-M', 'CAM-M'] as const satisfies readonly UserRole[]

/** 초기 스키마 레거시 역할 (DB 마이그레이션 전 호환) */
export const LEGACY_STAFF_ROLES = ['Staff_Office', 'Staff_SubControl'] as const

/** 알림·승인 대상 조회 시 사용 (레거시 포함) */
export const ALL_STAFF_ROLE_VALUES = [...STAFF_ROLES, ...LEGACY_STAFF_ROLES] as const

/** 알림 수신 대상 전체 (승인 + 모니터) */
export const ALL_NOTIFIABLE_STAFF_ROLES = [...STAFF_ROLES, ...MONITOR_ROLES, ...LEGACY_STAFF_ROLES] as const

export function isStaffOfficeRole(role: string | null | undefined): boolean {
  return role === 'ENG' || role === 'Staff_Office'
}

export function isStaffSubControlRole(role: string | null | undefined): boolean {
  return role === 'CAM' || role === 'Staff_SubControl'
}

export function isStaffRole(role: string | null | undefined): boolean {
  return isStaffOfficeRole(role) || isStaffSubControlRole(role)
}

export function isMonitorRole(role: string | null | undefined): boolean {
  return role === 'ENG-M' || role === 'CAM-M'
}

export function roleToApprovalPart(role: string | null | undefined): ApprovalPart | null {
  if (isStaffOfficeRole(role)) return 'office'
  if (isStaffSubControlRole(role)) return 'sub_control'
  return null
}

/** 캘린더 스케줄 필터 */
export type ScheduleFilter = 'all' | 'tech' | 'cam'

/**
 * 일정의 자원 타입을 판단합니다.
 * - isEngOnly: ENG만 필요 (중계차·스튜디오 없음)
 * - isAudioOnly: AUDIO만 필요 (중계차·스튜디오·ENG 없음)
 */
export function getScheduleResourceType(schedule: {
  use_relay_car: boolean
  use_studio: boolean
  use_eng: boolean
  use_audio: boolean
}) {
  const hasHeavyResource = schedule.use_relay_car || schedule.use_studio
  const isEngOnly = schedule.use_eng && !hasHeavyResource && !schedule.use_audio
  const isAudioOnly = schedule.use_audio && !hasHeavyResource && !schedule.use_eng
  return { isEngOnly, isAudioOnly, hasHeavyResource }
}

export function getRequiredApprovalParts(schedule: {
  request_type?: string
  use_relay_car: boolean
  use_studio: boolean
  use_eng: boolean
  use_audio: boolean
}): ApprovalPart[] {
  if (schedule.request_type === 'dispatch') return ['sub_control']
  const { isEngOnly, isAudioOnly } = getScheduleResourceType(schedule)
  if (isAudioOnly) return ['office']
  if (isEngOnly) return ['sub_control']
  return ['office', 'sub_control']
}

export function isDispatchRequest(schedule: { request_type?: string }): boolean {
  return schedule.request_type === 'dispatch'
}

/** 역할별 기본 스케줄 필터 */
export function getDefaultScheduleFilter(role: string | null | undefined): ScheduleFilter {
  if (isStaffOfficeRole(role) || role === 'ENG-M') return 'tech'
  if (isStaffSubControlRole(role) || role === 'CAM-M') return 'cam'
  return 'all'
}

export function matchesScheduleFilter(
  schedule: {
    request_type?: string
    use_relay_car: boolean
    use_studio: boolean
    use_eng: boolean
    use_audio: boolean
    notify_tech?: boolean
  },
  filter: ScheduleFilter
): boolean {
  if (filter === 'all') return true
  if (schedule.request_type === 'dispatch') {
    if (schedule.notify_tech && filter === 'tech') return true
    return filter === 'cam'
  }
  if (filter === 'tech') {
    return schedule.use_relay_car || schedule.use_studio || schedule.use_audio
  }
  if (filter === 'cam') {
    return schedule.use_relay_car || schedule.use_studio || schedule.use_eng
  }
  return true
}
