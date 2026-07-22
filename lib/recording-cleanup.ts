/** 녹화 정리 관련 서버 유틸리티 */

const SEOUL_TZ = 'Asia/Seoul'

/** 서울(Asia/Seoul) 기준 오늘의 날짜를 YYYY-MM-DD 문자열로 반환 */
export function getTodaySeoulYmd(): string {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: SEOUL_TZ })
  return fmt.format(new Date())
}
