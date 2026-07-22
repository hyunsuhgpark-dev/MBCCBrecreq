/** 서울(Asia/Seoul) 기준 날짜 유틸리티 */

const SEOUL_TZ = 'Asia/Seoul'

/** YYYY-MM-DD 날짜에 n일을 더해 YYYY-MM-DD로 반환 */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setDate(d.getDate() + n)
  return toSeoulDateYmd(d.toISOString()) ?? ymd
}

/** ISO 문자열을 서울 기준 YYYY-MM-DD로 변환 */
export function toSeoulDateYmd(iso: string): string | null {
  try {
    const d = new Date(iso)
    const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: SEOUL_TZ })
    return fmt.format(d) // sv-SE locale gives YYYY-MM-DD format
  } catch {
    return null
  }
}

/** YYYY-MM-DD를 포함하는 주의 월요일 반환 */
export function mondayOfWeekContaining(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  const dow = d.getDay() // 0=Sun, 1=Mon, ... 6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(d)
  mon.setDate(d.getDate() + diffToMon)
  return toSeoulDateYmd(mon.toISOString()) ?? ymd
}

/** 월요일 기준 7일치 YYYY-MM-DD 배열 반환 (월~일) */
export function sevenDaysFromMonday(monday: string): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    days.push(addDaysYmd(monday, i))
  }
  return days
}
