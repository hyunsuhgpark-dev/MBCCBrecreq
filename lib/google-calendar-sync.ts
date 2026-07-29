/**
 * 송출/행정 Google Calendar 양방향 sync (서비스 계정 + GOOGLE_CALENDAR_ID).
 *
 * 운영:
 * 1) GCP 서비스 계정 → CLIENT_EMAIL / PRIVATE_KEY
 * 2) MBC충북 캘린더에 서비스 계정「일정 변경」공유
 * 3) GOOGLE_CALENDAR_ID 설정
 */
import { GoogleAuth, OAuth2Client } from 'google-auth-library'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OfficeEvent } from '@/lib/types'
import { addDaysYmd } from '@/lib/seoul-week'

const CAL_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar'

function envTrim(name: string): string {
  const v = process.env[name]
  if (v == null || v === '') return ''
  let t = v.trim()
  if (t.length >= 2) {
    const a = t[0]
    const b = t[t.length - 1]
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      t = t.slice(1, -1).trim()
    }
  }
  return t
}

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n')
}

export function isOfficeCalendarSyncConfigured(): boolean {
  if (process.env.GOOGLE_CALENDAR_SYNC_ENABLED === 'false') return false
  const calId = envTrim('GOOGLE_CALENDAR_ID')
  if (!calId) return false
  const sa =
    envTrim('GOOGLE_CALENDAR_CLIENT_EMAIL') && envTrim('GOOGLE_CALENDAR_PRIVATE_KEY')
  const oauth =
    envTrim('GOOGLE_CALENDAR_OAUTH_CLIENT_ID') &&
    envTrim('GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET') &&
    envTrim('GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN')
  return Boolean(sa || oauth)
}

function getCalendarId(): string {
  return envTrim('GOOGLE_CALENDAR_ID')
}

async function getWriteAccessToken(): Promise<string | null> {
  try {
    const clientEmail = envTrim('GOOGLE_CALENDAR_CLIENT_EMAIL')
    const privateKey = envTrim('GOOGLE_CALENDAR_PRIVATE_KEY')
    if (clientEmail && privateKey) {
      const auth = new GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: normalizePrivateKey(privateKey),
        },
        scopes: [CAL_WRITE_SCOPE],
      })
      const client = await auth.getClient()
      const tok = await client.getAccessToken()
      return tok?.token ?? null
    }

    const clientId = envTrim('GOOGLE_CALENDAR_OAUTH_CLIENT_ID')
    const clientSecret = envTrim('GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET')
    const refreshToken = envTrim('GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN')
    if (clientId && clientSecret && refreshToken) {
      const oauth2 = new OAuth2Client(clientId, clientSecret)
      oauth2.setCredentials({ refresh_token: refreshToken })
      const tok = await oauth2.getAccessToken()
      return tok?.token ?? null
    }
  } catch (e) {
    console.error('Google Calendar write token 실패:', e)
  }
  return null
}

export type GCalSyncEvent = {
  id?: string
  etag?: string
  summary?: string
  description?: string
  location?: string
  status?: string
  updated?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
}

function authorFooter(authorName: string): string {
  return `작성자: ${authorName}`
}

export function appendAuthorToDescription(
  description: string | null | undefined,
  authorName: string
): string {
  const stripped = stripAuthorFromDescription(description)
  const footer = authorFooter(authorName)
  return stripped ? `${stripped}\n\n${footer}` : footer
}

export function stripAuthorFromDescription(description: string | null | undefined): string {
  if (!description) return ''
  return description.replace(/\n*작성자:\s*.+\s*$/u, '').trim()
}

export function officeEventToGoogleBody(event: {
  title: string
  description?: string | null
  location?: string | null
  all_day: boolean
  start_at?: string | null
  end_at?: string | null
  start_date?: string | null
  end_date?: string | null
  author_name: string
}): Record<string, unknown> {
  const description = appendAuthorToDescription(event.description, event.author_name)
  const body: Record<string, unknown> = {
    summary: event.title,
    description,
    location: event.location ?? '',
  }

  if (event.all_day) {
    const start = event.start_date!
    // Google all-day end is exclusive
    const endExclusive = addDaysYmd(event.end_date ?? event.start_date!, 1)
    body.start = { date: start }
    body.end = { date: endExclusive }
  } else {
    body.start = { dateTime: event.start_at!, timeZone: 'Asia/Seoul' }
    body.end = { dateTime: event.end_at!, timeZone: 'Asia/Seoul' }
  }
  return body
}

/** Google event → DB row fields (no id) */
export function googleEventToOfficeFields(ev: GCalSyncEvent): {
  title: string
  description: string | null
  location: string | null
  all_day: boolean
  start_at: string | null
  end_at: string | null
  start_date: string | null
  end_date: string | null
  etag: string | null
  google_updated_at: string | null
  author_name: string
} {
  const allDay = Boolean(ev.start?.date)
  let start_date: string | null = null
  let end_date: string | null = null
  let start_at: string | null = null
  let end_at: string | null = null

  if (allDay) {
    start_date = ev.start?.date ?? null
    // exclusive → inclusive
    const endEx = ev.end?.date
    end_date = endEx ? addDaysYmd(endEx, -1) : start_date
  } else {
    start_at = ev.start?.dateTime ?? null
    end_at = ev.end?.dateTime ?? null
    if (start_at) start_date = start_at.slice(0, 10)
    if (end_at) end_date = end_at.slice(0, 10)
  }

  const rawDesc = ev.description ?? null
  const stripped = stripAuthorFromDescription(rawDesc)
  const authorMatch = rawDesc?.match(/작성자:\s*(.+)\s*$/mu)
  const author_name = authorMatch?.[1]?.trim() || 'Google Calendar'

  return {
    title: (ev.summary ?? '').trim() || '(제목 없음)',
    description: stripped || null,
    location: ev.location?.trim() || null,
    all_day: allDay,
    start_at,
    end_at,
    start_date,
    end_date,
    etag: ev.etag ?? null,
    google_updated_at: ev.updated ?? null,
    author_name,
  }
}

async function calendarFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<Response> {
  const calendarId = encodeURIComponent(getCalendarId())
  const url = path.startsWith('http')
    ? path
    : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}${path}`
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
}

export async function listGoogleEvents(opts: {
  timeMin: string
  timeMax: string
}): Promise<GCalSyncEvent[]> {
  const token = await getWriteAccessToken()
  if (!token) throw new Error('Google Calendar 토큰을 받을 수 없습니다')

  const items: GCalSyncEvent[] = []
  let pageToken: string | undefined
  do {
    const u = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(getCalendarId())}/events`
    )
    u.searchParams.set('singleEvents', 'true')
    u.searchParams.set('orderBy', 'startTime')
    u.searchParams.set('timeMin', opts.timeMin)
    u.searchParams.set('timeMax', opts.timeMax)
    u.searchParams.set('maxResults', '250')
    u.searchParams.set('showDeleted', 'false')
    if (pageToken) u.searchParams.set('pageToken', pageToken)

    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Google list ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as { items?: GCalSyncEvent[]; nextPageToken?: string }
    if (Array.isArray(data.items)) {
      items.push(...data.items.filter((e) => e.status !== 'cancelled'))
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return items
}

export async function insertGoogleEvent(
  body: Record<string, unknown>
): Promise<GCalSyncEvent> {
  const token = await getWriteAccessToken()
  if (!token) throw new Error('Google Calendar 토큰을 받을 수 없습니다')
  const res = await calendarFetch('/events', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google insert ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as GCalSyncEvent
}

export async function updateGoogleEvent(
  googleEventId: string,
  body: Record<string, unknown>
): Promise<GCalSyncEvent> {
  const token = await getWriteAccessToken()
  if (!token) throw new Error('Google Calendar 토큰을 받을 수 없습니다')
  const res = await calendarFetch(`/events/${encodeURIComponent(googleEventId)}`, token, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google update ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as GCalSyncEvent
}

export async function deleteGoogleEvent(googleEventId: string): Promise<void> {
  const token = await getWriteAccessToken()
  if (!token) throw new Error('Google Calendar 토큰을 받을 수 없습니다')
  const res = await calendarFetch(`/events/${encodeURIComponent(googleEventId)}`, token, {
    method: 'DELETE',
  })
  // 404 = already gone
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google delete ${res.status}: ${text.slice(0, 200)}`)
  }
}

async function pushDirtyEvent(
  admin: SupabaseClient,
  row: OfficeEvent
): Promise<void> {
  if (row.deleted_at) {
    if (row.google_event_id) {
      try {
        await deleteGoogleEvent(row.google_event_id)
      } catch (e) {
        console.error('Google delete dirty 실패:', e)
        return
      }
    }
    await admin.from('office_events').delete().eq('id', row.id)
    return
  }

  const body = officeEventToGoogleBody(row)
  try {
    if (row.google_event_id) {
      const updated = await updateGoogleEvent(row.google_event_id, body)
      await admin
        .from('office_events')
        .update({
          dirty: false,
          etag: updated.etag ?? null,
          google_updated_at: updated.updated ?? null,
          local_updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    } else {
      const created = await insertGoogleEvent(body)
      await admin
        .from('office_events')
        .update({
          google_event_id: created.id ?? null,
          dirty: false,
          etag: created.etag ?? null,
          google_updated_at: created.updated ?? null,
          local_updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
  } catch (e) {
    console.error('Google push dirty 실패:', e)
  }
}

/**
 * 앱 우선 sync: dirty push → Google pull → dirty면 로컬 유지
 */
export async function syncOfficeEventsRange(
  admin: SupabaseClient,
  startYmd: string,
  endYmd: string
): Promise<{ configured: boolean; error?: string }> {
  if (!isOfficeCalendarSyncConfigured()) {
    return { configured: false }
  }

  try {
    // 1) Push all dirty (including soft-deleted)
    const { data: dirtyRows } = await admin
      .from('office_events')
      .select('*')
      .eq('dirty', true)

    for (const row of (dirtyRows ?? []) as OfficeEvent[]) {
      await pushDirtyEvent(admin, row)
    }

    // 2) Pull Google range
    const timeMin = `${startYmd}T00:00:00+09:00`
    const timeMax = `${addDaysYmd(endYmd, 1)}T00:00:00+09:00`
    const remote = await listGoogleEvents({ timeMin, timeMax })
    const remoteIds = new Set(remote.map((e) => e.id).filter(Boolean) as string[])

    const { data: localRows } = await admin
      .from('office_events')
      .select('*')
      .is('deleted_at', null)
      .or(
        `and(start_date.lte.${endYmd},end_date.gte.${startYmd}),and(start_at.lte.${timeMax},end_at.gte.${timeMin})`
      )

    const byGoogleId = new Map<string, OfficeEvent>()
    for (const row of (localRows ?? []) as OfficeEvent[]) {
      if (row.google_event_id) byGoogleId.set(row.google_event_id, row)
    }

    for (const ev of remote) {
      if (!ev.id) continue
      const fields = googleEventToOfficeFields(ev)
      const existing = byGoogleId.get(ev.id)

      if (!existing) {
        await admin.from('office_events').insert({
          google_event_id: ev.id,
          title: fields.title,
          description: fields.description,
          location: fields.location,
          all_day: fields.all_day,
          start_at: fields.start_at,
          end_at: fields.end_at,
          start_date: fields.start_date,
          end_date: fields.end_date,
          author_name: fields.author_name,
          author_role: null,
          created_by: null,
          etag: fields.etag,
          google_updated_at: fields.google_updated_at,
          dirty: false,
        })
        continue
      }

      if (existing.dirty) {
        // 앱 우선: 로컬 유지 후 재push
        await pushDirtyEvent(admin, existing)
        continue
      }

      const remoteUpdated = fields.google_updated_at
        ? new Date(fields.google_updated_at).getTime()
        : 0
      const localGoogleUpdated = existing.google_updated_at
        ? new Date(existing.google_updated_at).getTime()
        : 0
      const etagChanged = fields.etag && fields.etag !== existing.etag

      if (etagChanged || remoteUpdated > localGoogleUpdated) {
        await admin
          .from('office_events')
          .update({
            title: fields.title,
            description: fields.description,
            location: fields.location,
            all_day: fields.all_day,
            start_at: fields.start_at,
            end_at: fields.end_at,
            start_date: fields.start_date,
            end_date: fields.end_date,
            etag: fields.etag,
            google_updated_at: fields.google_updated_at,
            // Google에서 온 author_name은 footer 파싱값; 기존 작성자 유지 우선
            author_name:
              existing.author_name && existing.author_name !== 'Google Calendar'
                ? existing.author_name
                : fields.author_name,
            dirty: false,
            local_updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      }
    }

    // 3) Google에 없고 dirty=false 인 로컬(google_event_id 있음) → 삭제
    for (const row of (localRows ?? []) as OfficeEvent[]) {
      if (!row.google_event_id || row.dirty) continue
      if (!remoteIds.has(row.google_event_id)) {
        // 범위 밖일 수 있으므로, 이벤트가 범위와 겹칠 때만 삭제
        await admin.from('office_events').delete().eq('id', row.id)
      }
    }

    return { configured: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('office sync 실패:', msg)
    return { configured: true, error: msg }
  }
}

/** 단일 행을 즉시 Google에 반영 (성공 시 dirty=false) */
export async function pushOfficeEventNow(
  admin: SupabaseClient,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isOfficeCalendarSyncConfigured()) {
    return { ok: false, error: 'Google Calendar sync 미설정' }
  }
  const { data, error } = await admin.from('office_events').select('*').eq('id', id).single()
  if (error || !data) return { ok: false, error: error?.message ?? '이벤트 없음' }
  try {
    await pushDirtyEvent(admin, data as OfficeEvent)
    const { data: after } = await admin.from('office_events').select('dirty').eq('id', id).single()
    if (after?.dirty) return { ok: false, error: 'Google 반영 실패 (다음에 재시도)' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
