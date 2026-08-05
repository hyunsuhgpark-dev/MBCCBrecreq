/** 클라이언트 네비게이션 로딩 표시용 경량 브로커 (App Router에 router.events 없음) */

type Listener = (loading: boolean) => void

const listeners = new Set<Listener>()
let safetyTimer: ReturnType<typeof setTimeout> | null = null

export function subscribeNavLoading(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(loading: boolean) {
  listeners.forEach((l) => l(loading))
}

export function startNavLoading() {
  emit(true)
  if (safetyTimer) clearTimeout(safetyTimer)
  // 응답이 아주 느려도 바가 영구히 남지 않도록
  safetyTimer = setTimeout(() => emit(false), 20000)
}

export function stopNavLoading() {
  if (safetyTimer) {
    clearTimeout(safetyTimer)
    safetyTimer = null
  }
  emit(false)
}
