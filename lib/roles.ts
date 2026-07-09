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

/**
 * 일정의 자원 타입을 판단합니다.
 * - isEngOnly: ENG만 필요 (중계차·스튜디오 없음) → ENG/ENG-M에게 비노출
 * - isAudioOnly: AUDIO만 필요 (중계차·스튜디오·ENG 없음) → CAM/CAM-M에게 비노출
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

/**
 * 해당 역할의 사용자가 이 일정을 볼 수 있는지 반환합니다.
 */
export function canViewSchedule(
  role: string | null | undefined,
  schedule: { use_relay_car: boolean; use_studio: boolean; use_eng: boolean; use_audio: boolean }
): boolean {
  const { isEngOnly, isAudioOnly } = getScheduleResourceType(schedule)
  // ENG, ENG-M: ENG-only 일정은 비노출
  if ((role === 'ENG' || role === 'ENG-M') && isEngOnly) return false
  // CAM, CAM-M: AUDIO-only 일정은 비노출
  if ((role === 'CAM' || role === 'CAM-M') && isAudioOnly) return false
  return true
}
