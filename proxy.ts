import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 인증 필요 없는 경로
  const publicPaths = ['/login', '/auth/callback']
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p))

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (user && !isPublicPath) {
    // 미승인 계정 차단 (관리자 승인 대기 페이지로)
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_approved, role')
      .eq('id', user.id)
      .single()

    if (!profile?.is_approved && pathname !== '/pending-approval') {
      const pendingUrl = request.nextUrl.clone()
      pendingUrl.pathname = '/pending-approval'
      return NextResponse.redirect(pendingUrl)
    }

    if (profile?.is_approved && pathname === '/pending-approval') {
      const calendarUrl = request.nextUrl.clone()
      calendarUrl.pathname = '/calendar'
      return NextResponse.redirect(calendarUrl)
    }
  }

  if (user && pathname === '/login') {
    const calendarUrl = request.nextUrl.clone()
    calendarUrl.pathname = '/calendar'
    return NextResponse.redirect(calendarUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|api).*)'],
}
