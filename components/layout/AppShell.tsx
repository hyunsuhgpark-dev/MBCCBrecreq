'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Plus, Settings, Bell, LogOut, Tv, User } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { requestNotificationPermission } from '@/lib/firebase/client'

interface AppShellProps {
  children: React.ReactNode
  profile: Profile
  unreadCount?: number
}

const roleLabels: Record<string, string> = {
  Admin: '관리자',
  Staff_Office: '사무실',
  Staff_SubControl: '부조정실',
  Producer: 'PD',
}

const roleColors: Record<string, string> = {
  Admin: 'bg-red-100 text-red-700',
  Staff_Office: 'bg-blue-100 text-blue-700',
  Staff_SubControl: 'bg-purple-100 text-purple-700',
  Producer: 'bg-green-100 text-green-700',
}

export default function AppShell({ children, profile, unreadCount = 0 }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [localUnread, setLocalUnread] = useState(unreadCount)

  useEffect(() => {
    // FCM 토큰 등록
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
    <div className="flex flex-col min-h-screen bg-[#F3F4F6]">
      {/* 상단 헤더 */}
      <header className="bg-[#004F9A] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* 로고 */}
          <Link href="/calendar" className="flex items-center gap-2.5 shrink-0">
            <div className="bg-white/20 rounded-lg p-1.5">
              <Tv className="w-5 h-5" />
            </div>
            <span className="font-bold text-base tracking-tight hidden sm:block">
              MBC 방송일정
            </span>
          </Link>

          {/* 데스크탑 중앙 내비게이션 */}
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-3">
            {/* 알림 벨 */}
            <Link href="/notifications" className="relative p-2 hover:bg-white/10 rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
              {localUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#E1002D] rounded-full text-[10px] font-bold flex items-center justify-center">
                  {localUnread > 9 ? '9+' : localUnread}
                </span>
              )}
            </Link>

            {/* 사용자 정보 */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium leading-none">{profile.full_name}</span>
                <span className={cn(
                  'text-xs mt-1 px-1.5 py-0.5 rounded font-medium',
                  roleColors[profile.role ?? ''] ?? 'bg-gray-100 text-gray-600'
                )}>
                  {roleLabels[profile.role ?? ''] ?? profile.role}
                </span>
              </div>
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
            </div>

            {/* 로그아웃 */}
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 pb-20 sm:pb-0">
        {children}
      </main>

      {/* 모바일 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg sm:hidden z-40">
        <div className="flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors min-h-[60px]',
                  isActive ? 'text-[#004F9A]' : 'text-gray-400 hover:text-gray-600'
                )}
              >
                <item.icon className={cn('w-6 h-6', isActive && 'stroke-2')} />
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
