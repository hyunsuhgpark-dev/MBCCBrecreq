'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Plus, Settings, Bell, LogOut, User, ChevronLeft } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { requestNotificationPermission, onForegroundMessage } from '@/lib/firebase/client'
import { useAppBack } from '@/lib/use-app-back'

const MAIN_TAB_PATHS = ['/calendar', '/schedules/new', '/admin', '/mypage']

interface AppShellProps {
  children: React.ReactNode
  profile: Profile
  unreadCount?: number
}

const roleLabels: Record<string, string> = {
  Admin: '관리자',
  ENG: '기술국',
  'ENG-M': '기술(모니터)',
  CAM: '영상국',
  'CAM-M': '영상(모니터)',
  Staff_Office: '기술국',
  Staff_SubControl: '영상국',
  Producer: 'PD',
  Director: '편성',
}

export default function AppShell({ children, profile, unreadCount = 0 }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const goBack = useAppBack('/calendar')
  const supabase = createClient()
  const [localUnread, setLocalUnread] = useState(unreadCount)

  const showMobileBack = !MAIN_TAB_PATHS.includes(pathname)

  // iOS PWA: 왼쪽 가장자리 스와이프로 이전 화면
  useEffect(() => {
    if (!showMobileBack) return

    let startX = 0
    let startY = 0

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    function onTouchEnd(e: TouchEvent) {
      const endX = e.changedTouches[0].clientX
      const endY = e.changedTouches[0].clientY
      const dx = endX - startX
      const dy = Math.abs(endY - startY)
      // 왼쪽 40px 이내에서 시작, 오른쪽으로 72px 이상 스와이프
      if (startX <= 40 && dx > 72 && dy < 60) {
        goBack()
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [showMobileBack, goBack])

  useEffect(() => {
    async function registerFcm() {
      const token = await requestNotificationPermission()
      if (token) {
        await fetch('/api/notifications/fcm-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      }
    }
    registerFcm()

    const unsubscribe = onForegroundMessage((payload: unknown) => {
      const p = payload as {
        notification?: { title?: string; body?: string }
        data?: { scheduleId?: string; url?: string }
      }
      const title = p?.notification?.title ?? 'MBC 일정'
      const body = p?.notification?.body
      const scheduleId = p?.data?.scheduleId?.trim()
      const targetUrl = scheduleId
        ? `/schedules/${scheduleId}`
        : p?.data?.url?.trim() || '/calendar'

      toast(title, {
        description: body,
        duration: 8000,
        action: {
          label: '일정 보기',
          onClick: () => router.push(targetUrl),
        },
      })
      setLocalUnread((n) => n + 1)
    })

    return () => {
      unsubscribe?.then?.((fn: (() => void) | undefined) => fn?.())
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { href: '/calendar', icon: Calendar, label: '캘린더' },
    { href: '/schedules/new', icon: Plus, label: '제작/배차 요청' },
    ...(profile.role === 'Admin'
      ? [{ href: '/admin', icon: Settings, label: '관리' }]
      : []),
  ]

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* 상단 헤더 */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md"
        style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'rgba(15, 15, 18, 0.92)' }}
      >
        <div className="w-full px-4 sm:px-6 h-12 flex items-center justify-between">

          {/* 모바일 뒤로가기 */}
          {showMobileBack && (
            <button
              type="button"
              onClick={goBack}
              className="sm:hidden flex items-center gap-1 shrink-0 p-1.5 -ml-1 mr-1 rounded transition-colors"
              style={{ color: '#A3A3A3' }}
              aria-label="이전 화면"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* 데스크탑 네비게이션 — 왼쪽 정렬 */}
          <nav className="hidden sm:flex items-center gap-2" style={{ marginLeft: '20px' }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-0 px-3 py-1.5 rounded text-[13px] transition-colors whitespace-nowrap',
                    isActive
                      ? 'font-semibold'
                      : 'hover:bg-white/[0.06]'
                  )}
                  style={{ color: isActive ? '#EBEBEB' : '#A3A3A3' }}
                >
                  <item.icon className="w-3.5 h-3.5 mr-[3px]" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* 오른쪽: 알림 / 사용자 / 로그아웃 */}
          <div className="flex items-center gap-1" style={{ marginRight: '20px' }}>
            <Link
              href="/notifications"
              className="relative p-2 rounded transition-colors hover:bg-white/[0.06]"
              style={{ color: '#A3A3A3' }}
            >
              <Bell className="w-[18px] h-[18px]" />
              {localUnread > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center" style={{ backgroundColor: '#BE123C', color: '#EBEBEB' }}>
                  {localUnread > 9 ? '9+' : localUnread}
                </span>
              )}
            </Link>

            <div className="hidden sm:flex items-center px-1">
              <Link
                href="/mypage"
                className="flex items-center gap-1.5 rounded px-2 py-1.5 transition-colors hover:bg-white/[0.06]"
              >
                <span className="text-[12px] tracking-wide" style={{ color: '#737373' }}>
                  {roleLabels[profile.role ?? ''] ?? profile.role}
                </span>
                <span className="text-[13px] font-medium leading-none" style={{ color: '#EBEBEB' }}>
                  {profile.full_name}
                </span>
              </Link>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded transition-colors hover:bg-white/[0.06] cursor-pointer"
              style={{ color: '#737373' }}
              title="로그아웃"
              aria-label="로그아웃"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 pb-20 sm:pb-0">
        {children}
      </main>

      {/* 모바일 하단 탭바 */}
      <nav
        className="fixed bottom-0 left-0 right-0 sm:hidden z-40"
        style={{ borderTop: '1px solid var(--border-default)', backgroundColor: 'rgba(15, 15, 18, 0.96)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex safe-area-pb">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors min-h-[60px]"
                style={{ color: isActive ? '#EBEBEB' : '#737373' }}
              >
                <item.icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          <Link
            href="/mypage"
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors min-h-[60px]"
            style={{ color: pathname === '/mypage' ? '#EBEBEB' : '#737373' }}
          >
            <User className={cn('w-5 h-5', pathname === '/mypage' && 'stroke-[2.5]')} />
            <span className="text-[10px] font-medium">마이페이지</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
