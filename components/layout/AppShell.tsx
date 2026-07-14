'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Plus, Settings, Bell, LogOut, Tv, User } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { requestNotificationPermission, onForegroundMessage } from '@/lib/firebase/client'

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

const roleColors: Record<string, string> = {
  Admin:    'bg-red-500/20 text-red-300 border border-red-500/30',
  ENG:      'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  'ENG-M':  'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  CAM:      'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  'CAM-M':  'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  Staff_Office: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  Staff_SubControl: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  Producer: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  Director: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
}

export default function AppShell({ children, profile, unreadCount = 0 }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [localUnread, setLocalUnread] = useState(unreadCount)

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
    { href: '/schedules/new', icon: Plus, label: '의뢰하기' },
    ...(profile.role === 'Admin'
      ? [{ href: '/admin', icon: Settings, label: '관리' }]
      : []),
  ]

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: 'var(--bg-body)' }}>

      {/* 상단 헤더 */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 pr-6 h-14 flex items-center justify-between gap-4">

          {/* 로고 */}
          <Link href="/calendar" className="flex items-center gap-2.5 shrink-0">
            <div
              className="rounded-lg p-1.5"
              style={{ backgroundColor: 'var(--accent)', opacity: 0.9 }}
            >
              <Tv className="w-4 h-4 text-white" />
            </div>
            <span
              className="font-bold text-[15px] tracking-tight hidden sm:block"
              style={{ color: 'var(--text-primary)' }}
            >
              MBC충북 제작 일정
            </span>
          </Link>

          {/* 데스크탑 네비게이션 */}
          <nav className="hidden sm:flex items-center gap-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'text-white'
                      : 'hover:text-white'
                  )}
                  style={
                    isActive
                      ? { backgroundColor: 'var(--accent)', color: '#fff' }
                      : { color: 'var(--text-secondary)' }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                  }}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-3">
            {/* 알림 벨 */}
            <Link
              href="/notifications"
              className="relative p-3 rounded-lg transition-all"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Bell className="w-6 h-6" />
              {localUnread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white">
                  {localUnread > 9 ? '9+' : localUnread}
                </span>
              )}
            </Link>

            {/* 사용자 정보 */}
            <div className="hidden sm:flex items-center gap-2 pl-1">
              <div className="flex flex-col items-end">
                <span
                  className="text-[13px] font-semibold leading-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {profile.full_name}
                </span>
                <span className={cn(
                  'text-[10px] mt-1 px-1.5 py-0.5 rounded font-semibold tracking-wide',
                  roleColors[profile.role ?? ''] ?? 'bg-white/10 text-white/60'
                )}>
                  {roleLabels[profile.role ?? ''] ?? profile.role}
                </span>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                <User className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 로그아웃 */}
            <button
              onClick={handleLogout}
              className="p-3 rounded-lg transition-all"
              style={{ color: 'var(--text-muted)' }}
              title="로그아웃"
            >
              <LogOut className="w-6 h-6" />
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
        className="fixed bottom-0 left-0 right-0 sm:hidden z-40 border-t"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
        }}
      >
        <div className="flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1.5 transition-colors min-h-[72px]"
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                <item.icon className={cn('w-7 h-7', isActive && 'stroke-2')} />
                <span className="text-[11px] font-semibold">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
