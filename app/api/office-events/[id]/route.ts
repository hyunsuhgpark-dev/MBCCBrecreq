import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { deleteGoogleEvent, pushOfficeEventNow } from '@/lib/google-calendar-sync'
import type { OfficeEvent } from '@/lib/types'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = ['Admin', 'ENG'] as const

async function getWriteProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_approved, full_name')
    .eq('id', user.id)
    .single()

  return { user, profile }
}

function toIsoKst(local: string): string {
  if (local.includes('+') || local.endsWith('Z')) return local
  if (local.length === 16) return `${local}:00+09:00`
  return local
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const { user, profile } = await getWriteProfile()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (
    !profile?.is_approved ||
    !WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])
  ) {
    return NextResponse.json({ error: '수정 권한이 없습니다' }, { status: 403 })
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
  } else {
    if (!body.start_at || !body.end_at) {
      return NextResponse.json({ error: '시작/종료 일시가 필요합니다' }, { status: 400 })
    }
    start_at = toIsoKst(String(body.start_at))
    end_at = toIsoKst(String(body.end_at))
    if (new Date(end_at) <= new Date(start_at)) {
      return NextResponse.json({ error: '종료가 시작보다 이후여야 합니다' }, { status: 400 })
    }
    start_date = start_at.slice(0, 10)
    end_date = end_at.slice(0, 10)
  }

  const admin = await createAdminClient()
  const { data: updated, error } = await admin
    .from('office_events')
    .update({
      title,
      description,
      location,
      all_day: allDay,
      start_at,
      end_at,
      start_date,
      end_date,
      dirty: true,
      local_updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? '수정 실패' }, { status: 500 })
  }

  const push = await pushOfficeEventNow(admin, id)
  const { data: finalRow } = await admin.from('office_events').select('*').eq('id', id).single()

  return NextResponse.json({
    event: (finalRow ?? updated) as OfficeEvent,
    synced: push.ok,
    syncError: push.error ?? null,
  })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const { user, profile } = await getWriteProfile()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (
    !profile?.is_approved ||
    !WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])
  ) {
    return NextResponse.json({ error: '삭제 권한이 없습니다' }, { status: 403 })
  }

  const admin = await createAdminClient()
  const { data: row, error } = await admin
    .from('office_events')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !row) {
    return NextResponse.json({ error: '일정을 찾을 수 없습니다' }, { status: 404 })
  }

  const googleId = (row as OfficeEvent).google_event_id

  if (googleId) {
    try {
      await deleteGoogleEvent(googleId)
    } catch (e) {
      // soft-delete + dirty로 남기고 다음 sync에서 재시도
      await admin
        .from('office_events')
        .update({
          deleted_at: new Date().toISOString(),
          dirty: true,
          local_updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      return NextResponse.json({
        ok: false,
        syncError: e instanceof Error ? e.message : String(e),
      }, { status: 502 })
    }
  }

  await admin.from('office_events').delete().eq('id', id)
  return NextResponse.json({ ok: true, synced: true })
}
