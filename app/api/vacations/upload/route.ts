import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['Admin', 'ENG', 'ENG-M'] as const

/** SheetJS 날짜 시리얼 또는 문자열을 YYYY-MM-DD로 변환 */
function toDateStr(cell: unknown): string | null {
  if (cell === null || cell === undefined || cell === '') return null

  // SheetJS 날짜 시리얼 (숫자)
  if (typeof cell === 'number') {
    const date = XLSX.SSF.parse_date_code(cell)
    if (!date) return null
    const y = date.y
    const m = String(date.m).padStart(2, '0')
    const d = String(date.d).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // 문자열 형태 (예: "2026-07-01", "2026/07/01", "20260701")
  if (typeof cell === 'string') {
    const s = cell.trim()
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-')
    // YYYYMMDD
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }

  return null
}

export async function POST(request: NextRequest) {
  // 1. 인증 및 권한 확인
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved || !ALLOWED_ROLES.includes(profile.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: '기술국(ENG/ENG-M) 또는 관리자만 업로드할 수 있습니다' }, { status: 403 })
  }

  // 2. FormData에서 파일 추출
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

  // 3. SheetJS 파싱 — xls/xlsx 모두 자동 감지
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  } catch {
    return NextResponse.json({ error: '엑셀 파일을 읽을 수 없습니다' }, { status: 400 })
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  // header:1 → 2D 배열 (인덱스 0 = 헤더 행)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

  interface VacationRow {
    approval_number: string
    name: string
    vacation_type: string
    start_date: string
    end_date: string
  }

  const validRows: VacationRow[] = []

  // 헤더 제외하고 2번째 행부터 파싱 (0-indexed: row[0] = 헤더)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const approvalStatus = String(row[15] ?? '').trim()  // P열 (index 15)
    if (approvalStatus !== '결재완료') continue

    const name = String(row[4] ?? '').trim()             // E열 (index 4)
    const vacationType = String(row[5] ?? '').trim()     // F열 (index 5)
    const startDate = toDateStr(row[6])                  // G열 (index 6)
    const endDate = toDateStr(row[8])                    // I열 (index 8)
    const approvalNumber = String(row[14] ?? '').trim()  // O열 (index 14)

    if (!name || !startDate || !endDate || !approvalNumber) continue

    validRows.push({ approval_number: approvalNumber, name, vacation_type: vacationType, start_date: startDate, end_date: endDate })
  }

  // 엑셀 내 중복 결재번호 제거 (같은 번호가 여러 행이면 마지막 행 기준)
  const deduped = Object.values(
    validRows.reduce((acc, r) => {
      acc[r.approval_number] = r
      return acc
    }, {} as Record<string, VacationRow>)
  )

  const adminClient = await createAdminClient()
  const uploadedNumbers = deduped.map(r => r.approval_number)

  // 4. UPSERT
  let upsertCount = 0
  if (deduped.length > 0) {
    const { error: upsertError } = await adminClient
      .from('vacations')
      .upsert(deduped, { onConflict: 'approval_number' })
    if (upsertError) {
      console.error('vacation upsert error:', upsertError)
      return NextResponse.json({ error: '저장에 실패했습니다: ' + upsertError.message }, { status: 500 })
    }
    upsertCount = deduped.length
  }

  // 5. Sync Delete — 엑셀에 없는 기존 데이터 삭제
  let deleteCount = 0
  if (uploadedNumbers.length > 0) {
    const { data: deleted, error: deleteError } = await adminClient
      .from('vacations')
      .delete()
      .not('approval_number', 'in', `(${uploadedNumbers.map(n => `"${n}"`).join(',')})`)
      .select('id')
    if (deleteError) {
      console.error('vacation sync delete error:', deleteError)
    } else {
      deleteCount = deleted?.length ?? 0
    }
  } else {
    // 엑셀에 결재완료 건이 하나도 없으면 전체 삭제
    const { data: deleted } = await adminClient.from('vacations').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id')
    deleteCount = deleted?.length ?? 0
  }

  return NextResponse.json({
    message: '업로드 완료',
    upserted: upsertCount,
    deleted: deleteCount,
  })
}
