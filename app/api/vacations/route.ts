import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Vacation } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['Admin', 'ENG', 'ENG-M'] as const

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved || !ALLOWED_ROLES.includes(profile.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: '조회 권한이 없습니다' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  let query = supabase
    .from('vacations')
    .select('*')
    .order('start_date', { ascending: true })

  if (start && end) {
    query = query.lte('start_date', end).gte('end_date', start)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ vacations: (data ?? []) as Vacation[] })
}
