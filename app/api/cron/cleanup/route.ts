import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Vercel Cron Job: 매월 1일 오전 3시 실행
 * schedule: "0 3 1 * *"
 *
 * broadcast_end 기준 6개월 이상 지난 일정과 연관 데이터를 삭제합니다.
 * CRON_SECRET 환경변수로 무단 호출을 차단합니다.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const cutoff = sixMonthsAgo.toISOString()

  const { data: oldSchedules, error: fetchError } = await supabase
    .from('schedules')
    .select('id')
    .lt('broadcast_end', cutoff)

  if (fetchError) {
    console.error('[Cron/Cleanup] 조회 오류:', fetchError.message)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!oldSchedules || oldSchedules.length === 0) {
    return NextResponse.json({ deleted: 0, message: '삭제 대상 없음' })
  }

  const ids = oldSchedules.map((s) => s.id)

  await supabase.from('conflicts').delete().in('schedule_id', ids)
  await supabase.from('conflicts').delete().in('conflicting_schedule_id', ids)
  await supabase.from('approvals').delete().in('schedule_id', ids)
  await supabase.from('notifications').delete().in('schedule_id', ids)

  const { error: deleteError } = await supabase
    .from('schedules')
    .delete()
    .in('id', ids)

  if (deleteError) {
    console.error('[Cron/Cleanup] 삭제 오류:', deleteError.message)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  console.log(`[Cron/Cleanup] ${ids.length}개 일정 삭제 완료 (기준: ${cutoff})`)
  return NextResponse.json({ deleted: ids.length, cutoff })
}
