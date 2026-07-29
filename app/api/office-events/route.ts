import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  isOfficeCalendarSyncConfigured,
  pushOfficeEventNow,
  syncOfficeEventsRange,
} from '@/lib/google-calendar-sync'
import type { OfficeEvent } from '@/lib/types'

export const dynamic = 'force-dynamic'

const READ_ROLES = ['Admin', 'ENG', 'ENG-M', 'Staff_Office'] as const
const WRITE_ROLES = ['Admin', 'ENG'] as const

async function getAuthedProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null, supabase }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_approved, full_name')
    .eq('id', user.id)
    .single()

  return { user, profile, supabase }
}

function overlapsFilter(start: string, end: string) {
  // start_date/end_date는 timed·all-day 모두 채움
  return { start, end }
}

export async function GET(request: NextRequest) {
  const { user, profile } = await getAuthedProfile()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (
    !profile?.is_approved ||
    !READ_ROLES.includes(profile.role as (typeof READ_ROLES)[number])
  ) {
    return NextResponse.json({ error: '조회 권한이 없습니다' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  if (!start || !end) {
    return NextResponse.json({ error: 'start, end 필요 (YYYY-MM-DD)' }, { status: 400 })
  }

  const admin = await createAdminClient()
  const syncResult = await syncOfficeEventsRange(admin, start, end)

  let query = admin
    .from('office_events')
    .select('*')
    .is('deleted_at', null)
    .order('start_at', { ascending: true, nullsFirst: false })

  const { start: s, end: e } = overlapsFilter(start, end)
  query = query.lte('start_date', e).gte('end_date', s)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    events: (data ?? []) as OfficeEvent[],
    configured: syncResult.configured || isOfficeCalendarSyncConfigured(),
    syncError: syncResult.error ?? null,
  })
}

export async function POST(request: NextRequest) {
  const { user, profile } = await getAuthedProfile()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (
    !profile?.is_approved ||
    !WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])
  ) {
    return NextResponse.json({ error: '작성 권한이 없습니다' }, { status: 403 })
  }

  const body = await request.json()
  const title = String(body.title ?? '').trim()
  const allDay = Boolean(body.all_day)
  const location = body.location ? String(body.location).trim() : null
  const description = body.description ? String(body.description).trim() : null

  if (!title) {
    return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 })
  }

  let start_at: string | null = null
  let end_at: string | null = null
  let start_date: string | null = null
  let end_date: string | null = null

  if (allDay) {
    start_date = String(body.start_date ?? '').slice(0, 10)
    end_date = String(body.end_date ?? start_date).slice(0, 10)
    if (!start_date) {
      return NextResponse.json({ error: '시작일이 필요합니다' }, { status: 400 })
    }
    if (end_date < start_date) {
      return NextResponse.json({ error: '종료일이 시작일보다 빠릅니다' }, { status: 400 })
    }
  } else {
    start_at = body.start_at ? String(body.start_at) : null
    end_at = body.end_at ? String(body.end_at) : null
    if (!start_at || !end_at) {
      return NextResponse.json({ error: '시작/종료 일시가 필요합니다' }, { status: 400 })
    }
    // "YYYY-MM-DDTHH:mm" → ISO with KST offset for storage
    const toIso = (local: string) => {
      if (local.includes('+') || local.endsWith('Z')) return local
      if (local.length === 16) return `${local}:00+09:00`
      return local
    }
    start_at = toIso(start_at)
    end_at = toIso(end_at)
    if (new Date(end_at) <= new Date(start_at)) {
      return NextResponse.json({ error: '종료가 시작보다 이후여야 합니다' }, { status: 400 })
    }
    start_date = start_at.slice(0, 10)
    end_date = end_at.slice(0, 10)
  }

  const admin = await createAdminClient()
  const { data: created, error } = await admin
    .from('office_events')
    .insert({
      title,
      description,
      location,
      all_day: allDay,
      start_at,
      end_at,
      start_date,
      end_date,
      created_by: user.id,
      author_name: profile.full_name ?? '알 수 없음',
      author_role: profile.role,
      dirty: true,
    })
    .select('*')
    .single()

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? '저장 실패' }, { status: 500 })
  }

  const push = await pushOfficeEventNow(admin, created.id)
  const { data: finalRow } = await admin
    .from('office_events')
    .select('*')
    .eq('id', created.id)
    .single()

  return NextResponse.json(
    {
      event: (finalRow ?? created) as OfficeEvent,
      synced: push.ok,
      syncError: push.error ?? null,
    },
    { status: 201 }
  )
}
