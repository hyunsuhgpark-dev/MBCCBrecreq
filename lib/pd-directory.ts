export interface PdContact {
  name: string
  phone: string
}

/**
 * 담당 PD 전화부.
 * 이름·번호는 여기만 수정하면 됩니다. (하이픈 있어도 됩니다)
 */
export const PD_DIRECTORY: PdContact[] = [
  { name: '민수빈', phone: '010-3447-5427' },
  { name: '김우림', phone: '010-2071-1400' },
  { name: '김영수', phone: '010-9388-8032' },
  { name: '설경철', phone: '010-3412-5983' },
  { name: '오규익', phone: '010-6334-2048' },
  { name: '강창묵', phone: '010-4930-6939' },
  { name: '장세일', phone: '010-3177-5975' },
  { name: '한경수', phone: '010-6294-7226' },
]

function normalizePdName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '')
    .replace(/PD$/i, '')
    .toLowerCase()
}

export function lookupPdContact(name: string | null | undefined): PdContact | null {
  if (!name?.trim()) return null
  const key = normalizePdName(name)
  return PD_DIRECTORY.find((p) => normalizePdName(p.name) === key) ?? null
}

export function toTelHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  return `tel:${digits}`
}
