/**
 * Webhook Service
 *
 * 환경변수 WEBHOOK_URLS 에 콤마(,) 구분으로 URL을 등록하면
 * schedule.created / schedule.confirmed 이벤트 발생 시 각 URL로 POST 요청을 발송합니다.
 *
 * 예) WEBHOOK_URLS=https://hooks.slack.com/...,https://n8n.example.com/webhook/...
 *
 * 발송은 fire-and-forget으로 처리되므로 메인 플로우에 영향을 주지 않습니다.
 * 실패한 URL은 콘솔 경고로만 기록됩니다 (재시도 없음 — 무료 티어 최적화).
 */

export type WebhookEvent = 'schedule.created' | 'schedule.confirmed'

export interface WebhookPayload {
  event: WebhookEvent
  occurred_at: string   // ISO 8601
  data: {
    id: string
    program_name: string
    responsible_pd: string
    status: string
    venue: string
    broadcast_start: string
    broadcast_end: string
    rehearsal_staff_at: string | null
    is_live: boolean
    notes: string
    created_by: string
  }
}

/**
 * 환경변수 WEBHOOK_URLS 에서 유효한 URL 목록을 파싱합니다.
 * 런타임마다 재파싱하여 동적 주입을 허용합니다.
 */
function getWebhookUrls(): string[] {
  const raw = process.env.WEBHOOK_URLS ?? ''
  return raw
    .split(',')
    .map((u) => u.trim())
    .filter((u) => {
      try {
        new URL(u)
        return true
      } catch {
        return false
      }
    })
}

/**
 * 단일 URL로 웹훅을 발송합니다.
 * 10초 타임아웃을 설정하여 느린 엔드포인트가 응답을 막지 않도록 합니다.
 */
async function dispatchToUrl(url: string, payload: WebhookPayload): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MBC-Schedule-Webhook/1.0',
        // 간단한 공유 시크릿 서명 헤더 (선택적 검증용)
        ...(process.env.WEBHOOK_SECRET
          ? { 'X-Webhook-Secret': process.env.WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!res.ok) {
      console.warn(`[Webhook] ${url} responded with ${res.status} for event "${payload.event}"`)
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    console.warn(
      `[Webhook] Failed to deliver "${payload.event}" to ${url}:`,
      isTimeout ? 'timeout (10s)' : err
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 등록된 모든 웹훅 URL로 이벤트를 발송합니다.
 * Promise.allSettled 를 사용하여 일부 실패가 다른 URL 전송을 막지 않습니다.
 *
 * @example
 * // fire-and-forget (await 없이 사용 가능)
 * void dispatchWebhook('schedule.created', schedule)
 *
 * // 또는 완료 대기
 * await dispatchWebhook('schedule.confirmed', schedule)
 */
export async function dispatchWebhook(
  event: WebhookEvent,
  scheduleData: WebhookPayload['data']
): Promise<void> {
  const urls = getWebhookUrls()
  if (urls.length === 0) return  // 설정 없으면 즉시 반환

  const payload: WebhookPayload = {
    event,
    occurred_at: new Date().toISOString(),
    data: scheduleData,
  }

  await Promise.allSettled(urls.map((url) => dispatchToUrl(url, payload)))
}
