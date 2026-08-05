import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['Admin', 'ENG', 'ENG-M'] as const

function looksLikeYyyymmdd(n: number): boolean {
  if (!Number.isInteger(n) || n < 10000101 || n > 99991231) return false
  const s = String(n)
  const m = Number(s.slice(4, 6))
  const d = Number(s.slice(6, 8))
  return m >= 1 && m <= 12 && d >= 1 && d <= 31
}

/** SheetJS 날짜 시리얼 / YYYYMMDD 숫자 / 문자열 → YYYY-MM-DD */
function toDateStr(cell: unknown): string | null {
  if (cell === null || cell === undefined || cell === '') return null

  if (typeof cell === 'number') {
    // ERP 엑셀이 날짜를 20260805 같은 정수로 주는 경우 (Excel 시리얼이 아님)
    if (looksLikeYyyymmdd(cell)) {
      const s = String(cell)
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
    }
    const date = XLSX.SSF.parse_date_code(cell)
    if (!date) return null
    const y = date.y
    const m = String(date.m).padStart(2, '0')
    const d = String(date.d).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  if (typeof cell === 'string') {
    const s = cell.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-')
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }

  return null
}

function makeSyncKey(
  approvalNumber: string,
  startDate: string,
  endDate: string,
  halfDay: string | null
): string {
  return `${approvalNumber}|${startDate}|${endDate}|${halfDay ?? ''}`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved || !ALLOWED_ROLES.includes(profile.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: '기술국(ENG/ENG-M) 또는 관리자만 업로드할 수 있습니다' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
  }

  const filename = (file as File).name ?? ''
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext !== 'xls' && ext !== 'xlsx') {
    return NextResponse.json({ error: '.xls 또는 .xlsx 파일만 업로드할 수 있습니다' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  } catch {
    return NextResponse.json({ error: '엑셀 파일을 읽을 수 없습니다' }, { status: 400 })
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

  interface VacationRow {
    sync_key: string
    approval_number: string
    name: string
    vacation_type: string
    start_date: string
    end_date: string
    half_day: string | null
  }

  const validRows: VacationRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const approvalStatus = String(row[15] ?? '').trim() // P열
    if (approvalStatus !== '결재완료') continue

    const name = String(row[4] ?? '').trim() // E열
    const vacationType = String(row[5] ?? '').trim() // F열
    const startDate = toDateStr(row[6]) // G열
    const endDate = toDateStr(row[8]) // I열
    const approvalNumber = String(row[14] ?? '').trim() // O열
    const halfDayRaw = String(row[10] ?? '').trim() // K열
    const halfDay = halfDayRaw === '오전' || halfDayRaw === '오후' ? halfDayRaw : null

    if (!name || !startDate || !endDate || !approvalNumber) continue

    validRows.push({
      sync_key: makeSyncKey(approvalNumber, startDate, endDate, halfDay),
      approval_number: approvalNumber,
      name,
      vacation_type: vacationType,
      start_date: startDate,
      end_date: endDate,
      half_day: halfDay,
    })
  }

  // 완전 동일 행(결재번호+기간+반차)만 중복 제거 — 같은 결재번호의 다른 일자는 모두 유지
  const deduped = Object.values(
    validRows.reduce(
      (acc, r) => {
        acc[r.sync_key] = r
        return acc
      },
      {} as Record<string, VacationRow>
    )
  )

  const adminClient = await createAdminClient()
  const uploadedKeys = deduped.map((r) => r.sync_key)

  let upsertCount = 0
  if (deduped.length > 0) {
    const { error: upsertError } = await adminClient
      .from('vacations')
      .upsert(deduped, { onConflict: 'sync_key' })
    if (upsertError) {
      console.error('vacation upsert error:', upsertError)
      return NextResponse.json({ error: '저장에 실패했습니다: ' + upsertError.message }, { status: 500 })
    }
    upsertCount = deduped.length
  }

  let deleteCount = 0
  if (uploadedKeys.length > 0) {
    const { data: deleted, error: deleteError } = await adminClient
      .from('vacations')
      .delete()
      .not('sync_key', 'in', `(${uploadedKeys.map((k) => `"${k}"`).join(',')})`)
      .select('id')
    if (deleteError) {
      console.error('vacation sync delete error:', deleteError)
    } else {
      deleteCount = deleted?.length ?? 0
    }
  } else {
    const { data: deleted } = await adminClient
      .from('vacations')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id')
    deleteCount = deleted?.length ?? 0
  }

  return NextResponse.json({
    message: '업로드 완료',
    upserted: upsertCount,
    deleted: deleteCount,
  })
}
