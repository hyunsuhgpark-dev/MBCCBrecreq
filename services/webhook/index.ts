/**
 * Webhook Service
 *
 * 환경변수 WEBHOOK_URLS 에 콤마(,) 구분으로 URL을 등록하면
 * schedule.confirmed 이벤트 발생 시(스태프 최종 승인) 각 URL로 POST 요청을 발송합니다.
 *
 * 예) WEBHOOK_URLS=https://planner-ecru-beta.vercel.app/api/webhook/records
 *
 * 발송은 fire-and-forget으로 처리되므로 메인 플로우에 영향을 주지 않습니다.
 * 실패한 URL은 콘솔 경고로만 기록됩니다 (재시도 없음 — 무료 티어 최적화).
 * payload의 external_id(= schedule.id)를 기준으로 후배 플래너가 upsert 처리합니다.
 */

export type WebhookEvent = 'schedule.confirmed'

export interface WebhookScheduleInput {
  id: string
  program_name: string
  responsible_pd?: string | null
  status: string
  venue?: string | null
  location?: string | null
  broadcast_start?: string | null
  broadcast_end?: string | null
  broadcast_at?: string | null
  rehearsal_staff_at?: string | null
  rehearsal_cast_at?: string | null
  use_relay_car?: boolean | null
  use_studio?: boolean | null
  use_eng?: boolean | null
  use_audio?: boolean | null
  is_live?: boolean | null
  record_content?: string | null
  notes?: string | null
  created_by: string
}

/**
 * 후배 플래너 수신 API 명세
 * POST https://planner-ecru-beta.vercel.app/api/webhook/records
 */
export type PlannerRecordType =
  | 'office-schedule'
  | 'production-schedule'
  | 'vacation'
  | 'work-schedule'
  | 'casting-schedule'

export interface PlannerRecordPayload {
  type: PlannerRecordType
  summary: string
  external_id: string
  details: {
    title: string
    program: string
    entries: Array<{
      date: string // YYYY-MM-DD
      time: string // HH:mm
      place?: string
      person?: string
      note?: string
    }>
  }
}

function formatKstDateTime(iso: string): { date: string; time: string; dateTime: string } {
  const d = new Date(iso)
  // sv-SE 포맷은 "YYYY-MM-DD HH:mm" 형태라 후가공이 쉽습니다.
  const dateTime = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)

  const [date, time] = dateTime.split(' ')
  return { date: date ?? '', time: time ?? '', dateTime }
}

function buildEntryNote(schedule: WebhookScheduleInput): string | undefined {
  const tags: string[] = []
  if (schedule.use_relay_car) tags.push('중계차')
  if (schedule.use_studio) tags.push('스튜디오')
  if (schedule.use_eng) tags.push('ENG')
  if (schedule.use_audio) tags.push('AUDIO')
  if (schedule.is_live) tags.push('생방송')

  const lines: string[] = []
  if (tags.length > 0) lines.push(tags.join(', '))

  if (schedule.broadcast_at) {
    const { dateTime } = formatKstDateTime(schedule.broadcast_at)
    lines.push(`방송: ${dateTime}`)
  }

  const note = lines.join(' / ').trim()
  return note.length > 0 ? note : undefined
}

export function toPlannerRecordPayload(
  schedule: WebhookScheduleInput,
  options?: { type?: PlannerRecordType }
): PlannerRecordPayload {
  const type: PlannerRecordType = options?.type ?? 'production-schedule'

  const startIso = schedule.broadcast_start ?? ''
  const { date, time, dateTime } = startIso ? formatKstDateTime(startIso) : { date: '', time: '', dateTime: '' }

  const summary = `${schedule.program_name} · ${dateTime}`.trim()

  const place = (schedule.venue ?? '').trim() || undefined
  const note = buildEntryNote(schedule)
  const person = (schedule.responsible_pd ?? '').trim()
    ? `담당PD ${schedule.responsible_pd!.trim()}`
    : undefined

  return {
    type,
    summary,
    external_id: schedule.id,
    details: {
      title: schedule.program_name,
      program: schedule.program_name,
      entries: [
        {
          date,
          time,
          ...(place ? { place } : {}),
          ...(person ? { person } : {}),
          ...(note ? { note } : {}),
        },
      ],
    },
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
async function dispatchToUrl(url: string, payload: PlannerRecordPayload, event: WebhookEvent): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const secret = process.env.WEBHOOK_SECRET
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MBC-Schedule-Webhook/1.0',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!res.ok) {
      console.warn(`[Webhook] ${url} responded with ${res.status} for event "${event}"`)
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    console.warn(
      `[Webhook] Failed to deliver "${event}" to ${url}:`,
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
  scheduleData: WebhookScheduleInput
): Promise<void> {
  const urls = getWebhookUrls()
  if (urls.length === 0) return  // 설정 없으면 즉시 반환

  // ENG-only 일정(중계차·스튜디오 없이 ENG만 체크)은 기술국 내부 업무 — 후배 플래너에게 미전송
  const scheduleWithType = scheduleData as WebhookScheduleInput & { request_type?: string }
  if (scheduleWithType.request_type === 'dispatch') {
    console.log('[Webhook] Skipped dispatch schedule:', scheduleData.id)
    return
  }

  const hasHeavyResource = scheduleData.use_relay_car || scheduleData.use_studio
  const isEngOnly = scheduleData.use_eng && !hasHeavyResource && !scheduleData.use_audio
  if (isEngOnly) {
    console.log('[Webhook] Skipped ENG-only schedule (not sent to planner):', scheduleData.id)
    return
  }

  const payload = toPlannerRecordPayload(scheduleData)

  await Promise.allSettled(urls.map((url) => dispatchToUrl(url, payload, event)))
}
