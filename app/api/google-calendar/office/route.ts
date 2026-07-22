import { NextResponse, type NextRequest } from 'next/server'
import { fetchGoogleCalendarOfficeRecords } from '@/lib/google-calendar-office'

export const dynamic = 'force-dynamic'

function isConfigured(): boolean {
  if (process.env.GOOGLE_CALENDAR_SYNC_ENABLED === 'false') return false
  const hasApiKey = Boolean(process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_CALENDAR_API_KEY)
  const hasOAuth = Boolean(
    process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_CALENDAR_OAUTH_REFRESH_TOKEN
  )
  const hasServiceAccount = Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_EMAIL &&
    process.env.GOOGLE_CALENDAR_PRIVATE_KEY
  )
  return hasApiKey || hasOAuth || hasServiceAccount
}

export async function GET(req: NextRequest) {
  const configured = isConfigured()
  if (!configured) {
    return NextResponse.json({ records: [], configured: false })
  }

  const { searchParams } = req.nextUrl
  const startYmd = searchParams.get('start') ?? undefined
  const endYmd = searchParams.get('end') ?? undefined

  try {
    const records = await fetchGoogleCalendarOfficeRecords(
      startYmd && endYmd ? { startYmd, endYmd } : undefined
    )
    return NextResponse.json({ records, configured: true })
  } catch (error) {
    console.error('Google Calendar office fetch error:', error)
    return NextResponse.json({ records: [], configured: true, error: true })
  }
}
