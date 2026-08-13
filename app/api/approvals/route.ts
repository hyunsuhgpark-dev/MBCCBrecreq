import { NextRequest, NextResponse } from 'next/server'

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: '일정 승인 절차가 제거되었습니다' },
    { status: 410 },
  )
}
