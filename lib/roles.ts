import type { ApprovalPart, UserRole } from '@/lib/types'

/** 현재 앱에서 사용하는 스태프 역할 */
export const STAFF_ROLES = ['ENG', 'CAM'] as const satisfies readonly UserRole[]

/** 초기 스키마 레거시 역할 (DB 마이그레이션 전 호환) */
export const LEGACY_STAFF_ROLES = ['Staff_Office', 'Staff_SubControl'] as const

/** 알림·승인 대상 조회 시 사용 (레거시 포함) */
export const ALL_STAFF_ROLE_VALUES = [...STAFF_ROLES, ...LEGACY_STAFF_ROLES] as const

export function isStaffOfficeRole(role: string | null | undefined): boolean {
  return role === 'ENG' || role === 'Staff_Office'
}

export function isStaffSubControlRole(role: string | null | undefined): boolean {
  return role === 'CAM' || role === 'Staff_SubControl'
}

export function isStaffRole(role: string | null | undefined): boolean {
  return isStaffOfficeRole(role) || isStaffSubControlRole(role)
}

export function roleToApprovalPart(role: string | null | undefined): ApprovalPart | null {
  if (isStaffOfficeRole(role)) return 'office'
  if (isStaffSubControlRole(role)) return 'sub_control'
  return null
}
