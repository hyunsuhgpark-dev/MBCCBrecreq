'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Schedule, Profile } from '@/lib/types'
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Radio,
  Calendar,
  List,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface CalendarViewProps {
  profile: Profile
}

const statusConfig = {
  conflict: {
    label: '충돌',
    color: 'bg-amber-50 border-l-amber-500 text-amber-900',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    cardBg: 'bg-amber-500',
    icon: AlertTriangle,
  },
  pending: {
    label: '대기',
    color: 'bg-slate-50 border-l-slate-400 text-slate-700',
    dot: 'bg-slate-400',
    badge: 'bg-slate-50 text-slate-600 border-slate-200',
    cardBg: 'bg-slate-400',
    icon: Clock,
  },
  confirmed: {
    label: '확정',
    color: 'bg-emerald-50 border-l-emerald-600 text-emerald-900',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cardBg: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  rejected: {
    label: '반려',
    color: 'bg-red-50 border-l-red-500 text-red-900',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200',
    cardBg: 'bg-red-500',
    icon: XCircle,
  },
}

export default function CalendarView({ profile }: CalendarViewProps) {
  const supabase = createClient()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month')

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)

    const { data } = await supabase
      .from('schedules')
      .select(`
        *,
        creator:profiles!schedules_created_by_fkey(id, full_name, role),
        approvals(id, part, status, reject_reason)
      `)
      .gte('broadcast_start', start.toISOString())
      .lte('broadcast_start', end.toISOString())
      .order('broadcast_start', { ascending: true })

    setSchedules((data as Schedule[]) ?? [])
    setLoading(false)
  }, [currentDate, supabase])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  useEffect(() => {
    const channel = supabase
      .channel('schedules_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => {
        fetchSchedules()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchSchedules, supabase])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart, { locale: ko })
  const calendarEnd = endOfWeek(monthEnd, { locale: ko })

  const calendarDays: Date[] = []
  let day = calendarStart
  while (day <= calendarEnd) {
    calendarDays.push(day)
    day = addDays(day, 1)
  }

  function getSchedulesForDay(date: Date) {
    return schedules.filter((s) => isSameDay(parseISO(s.broadcast_start), date))
  }

  function getApprovalRatio(schedule: Schedule) {
    if (!schedule.approvals) return null
    const total = schedule.approvals.length
    const approved = schedule.approvals.filter((a) => a.status === 'approved').length
    return `${approved}/${total}`
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between mb-5">

        {/* 월 네비게이션 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-[#004F9A] hover:text-[#004F9A] hover:bg-[#EEF3FB] transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-bold text-slate-800 min-w-[140px] text-center tabular-nums">
            {format(currentDate, 'yyyy년 M월', { locale: ko })}
          </h2>
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-[#004F9A] hover:text-[#004F9A] hover:bg-[#EEF3FB] transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="ml-1 px-3 h-9 text-sm font-medium text-[#004F9A] border border-[#004F9A]/30 rounded-lg hover:bg-[#EEF3FB] transition-all"
          >
            오늘
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* 범례 */}
          <div className="hidden sm:flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2 shadow-sm">
            {Object.entries(statusConfig).map(([status, config]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-full', config.dot)} />
                <span className="text-xs text-slate-500">{config.label}</span>
              </div>
            ))}
          </div>

          {/* 뷰 전환 */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
            <button
              onClick={() => setViewMode('month')}
              className={cn(
                'p-2.5 transition-colors',
                viewMode === 'month'
                  ? 'bg-[#004F9A] text-white'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              )}
            >
              <Calendar className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2.5 transition-colors border-l border-slate-200',
                viewMode === 'list'
                  ? 'bg-[#004F9A] text-white'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* 의뢰하기 버튼 */}
          {(profile.role === 'Producer' || profile.role === 'Admin') && (
            <Link href="/schedules/new">
              <Button className="bg-[#004F9A] hover:bg-[#003A73] text-white min-h-10 gap-1.5 shadow-md hover:shadow-lg transition-all font-semibold">
                <span className="text-base font-bold leading-none">+</span>
                <span className="hidden sm:inline">의뢰하기</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {viewMode === 'month' ? (
        /* ── 월간 캘린더 ── */
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,79,154,0.08)] overflow-hidden border border-slate-100">

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 bg-[#004F9A]">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div
                key={d}
                className={cn(
                  'py-3 text-center text-xs font-bold tracking-widest uppercase',
                  i === 0 ? 'text-red-200' : i === 6 ? 'text-sky-200' : 'text-white/90'
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {calendarDays.map((date, idx) => {
              const daySchedules = getSchedulesForDay(date)
              const isCurrentMonth = isSameMonth(date, currentDate)
              const isTodayDate = isToday(date)
              const dow = date.getDay()

              return (
                <div
                  key={idx}
                  className={cn(
                    'min-h-[130px] p-1.5 transition-colors',
                    !isCurrentMonth && 'bg-slate-50/70',
                    isTodayDate && 'bg-[#EEF3FB]/60'
                  )}
                >
                  {/* 날짜 숫자 */}
                  <div className="mb-1.5">
                    <span
                      className={cn(
                        'inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-medium',
                        !isCurrentMonth && 'text-slate-300',
                        isTodayDate && 'bg-[#004F9A] text-white font-bold shadow-sm',
                        !isTodayDate && isCurrentMonth && dow === 0 && 'text-red-500',
                        !isTodayDate && isCurrentMonth && dow === 6 && 'text-sky-500',
                        !isTodayDate && isCurrentMonth && dow !== 0 && dow !== 6 && 'text-slate-700'
                      )}
                    >
                      {format(date, 'd')}
                    </span>
                  </div>

                  {/* 일정 카드 */}
                  <div className="space-y-1">
                    {daySchedules.slice(0, 2).map((schedule) => {
                      const config = statusConfig[schedule.status]
                      const startTime = format(parseISO(schedule.broadcast_start), 'HH:mm')

                      return (
                        <Link key={schedule.id} href={`/schedules/${schedule.id}`}>
                          <div className={cn(
                            'flex items-center gap-1.5 px-1.5 py-1 rounded-md border-l-[3px] cursor-pointer',
                            'hover:brightness-95 transition-all',
                            config.color
                          )}>
                            {schedule.is_live && (
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0" />
                            )}
                            <span className="text-[10px] font-medium tabular-nums shrink-0 leading-tight opacity-70">
                              {startTime}
                            </span>
                            <span className={cn(
                              'text-sm leading-tight truncate',
                              schedule.status === 'confirmed'
                                ? 'font-bold text-[#003A8C]'
                                : 'font-medium'
                            )}>
                              {schedule.program_name}
                            </span>
                          </div>
                        </Link>
                      )
                    })}
                    {daySchedules.length > 2 && (
                      <div className="text-xs text-slate-400 pl-1.5 font-medium">
                        +{daySchedules.length - 2}개 더
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      ) : (
        /* ── 리스트 뷰 ── */
        <div className="space-y-2">
          {loading ? (
            <div className="bg-white rounded-xl p-10 text-center text-slate-400 text-sm border border-slate-100">
              불러오는 중...
            </div>
          ) : schedules.length === 0 ? (
            <div className="bg-white rounded-xl p-14 text-center border border-slate-100 shadow-sm">
              <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">이번 달 등록된 일정이 없습니다.</p>
            </div>
          ) : (
            schedules.map((schedule) => {
              const config = statusConfig[schedule.status]
              const Icon = config.icon
              const ratio = schedule.status === 'pending' ? getApprovalRatio(schedule) : null

              return (
                <Link key={schedule.id} href={`/schedules/${schedule.id}`}>
                  <div className={cn(
                    'bg-white rounded-xl border border-slate-100 border-l-4 shadow-sm hover:shadow-md hover:-translate-y-px transition-all p-4',
                    schedule.status === 'conflict' && 'border-l-amber-500',
                    schedule.status === 'pending' && 'border-l-slate-400',
                    schedule.status === 'confirmed' && 'border-l-emerald-500',
                    schedule.status === 'rejected' && 'border-l-red-500',
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {schedule.is_live && (
                            <div className="flex items-center gap-1 bg-red-500 text-white px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0">
                              <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                              LIVE
                            </div>
                          )}
                          <h3 className="font-semibold text-slate-800 truncate">{schedule.program_name}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Radio className="w-3 h-3" />
                            {format(parseISO(schedule.broadcast_start), 'M/d(EEE) HH:mm', { locale: ko })}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span>{schedule.venue}</span>
                          <span className="text-slate-300">|</span>
                          <span>담당 {schedule.responsible_pd}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Badge className={cn('text-[11px] font-medium border', config.badge)}>
                          <Icon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                        {ratio && (
                          <span className="text-[11px] text-slate-400 tabular-nums">승인 {ratio}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
