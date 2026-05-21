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
  CalendarDays,
  LayoutList,
  MapPin,
  User,
} from 'lucide-react'
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
    dot: 'bg-amber-400',
    cardBg: '#2D1E00',
    cardBorder: '#D97706',
    cardText: '#FCD34D',
    timeColor: '#B45309',
    badge: 'bg-amber-950 text-amber-300 border border-amber-800',
    listBorder: '#D97706',
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
  },
  pending: {
    label: '대기',
    dot: 'bg-slate-500',
    cardBg: '#1E1E20',
    cardBorder: '#4A4A4C',
    cardText: '#9CA3AF',
    timeColor: '#636368',
    badge: 'bg-[#2A2A2C] text-slate-400 border border-[#3A3A3C]',
    listBorder: '#4A4A4C',
    icon: Clock,
    iconColor: 'text-slate-500',
  },
  confirmed: {
    label: '확정',
    dot: 'bg-emerald-400',
    cardBg: '#07291C',
    cardBorder: '#059669',
    cardText: '#6EE7B7',
    timeColor: '#065F46',
    badge: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
    listBorder: '#059669',
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
  },
  rejected: {
    label: '반려',
    dot: 'bg-rose-400',
    cardBg: '#2D0A0A',
    cardBorder: '#DC2626',
    cardText: '#FCA5A5',
    timeColor: '#7F1D1D',
    badge: 'bg-rose-950 text-rose-300 border border-rose-800',
    listBorder: '#DC2626',
    icon: XCircle,
    iconColor: 'text-rose-400',
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
      .select(`*, creator:profiles!schedules_created_by_fkey(id, full_name, role), approvals(id, part, status, reject_reason)`)
      .gte('broadcast_start', start.toISOString())
      .lte('broadcast_start', end.toISOString())
      .order('broadcast_start', { ascending: true })
    setSchedules((data as Schedule[]) ?? [])
    setLoading(false)
  }, [currentDate, supabase])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])
  useEffect(() => {
    const channel = supabase
      .channel('schedules_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => fetchSchedules())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchSchedules, supabase])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart, { locale: ko })
  const calendarEnd = endOfWeek(monthEnd, { locale: ko })
  const calendarDays: Date[] = []
  let day = calendarStart
  while (day <= calendarEnd) { calendarDays.push(day); day = addDays(day, 1) }

  function getSchedulesForDay(date: Date) {
    return schedules.filter((s) => isSameDay(parseISO(s.broadcast_start), date))
  }
  function getApprovalRatio(schedule: Schedule) {
    if (!schedule.approvals) return null
    const approved = schedule.approvals.filter((a) => a.status === 'approved').length
    return `${approved}/${schedule.approvals.length}`
  }

  const totalThisMonth = schedules.length
  const confirmedThisMonth = schedules.filter(s => s.status === 'confirmed').length

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">

      {/* ── 컨트롤 바 ── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-baseline gap-2 min-w-[148px] px-2">
            <span className="text-[13px] tabular-nums font-medium" style={{ color: 'var(--text-muted)' }}>
              {format(currentDate, 'yyyy')}
            </span>
            <span className="text-[22px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {format(currentDate, 'M월', { locale: ko })}
            </span>
          </div>

          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => setCurrentDate(new Date())}
            className="ml-1 h-7 px-2.5 text-[11px] font-semibold rounded-lg border transition-colors tracking-wide"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)', opacity: 0.85 }}
          >
            오늘
          </button>

          {!loading && (
            <span className="hidden sm:inline-flex items-center gap-1.5 ml-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>총 {totalThisMonth}건</span>
              {confirmedThisMonth > 0 && (
                <span className="text-emerald-400 font-semibold">/ {confirmedThisMonth}건 확정</span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 범례 */}
          <div
            className="hidden md:flex items-center gap-3 rounded-xl px-3 py-1.5 border text-[11px]"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
          >
            {Object.entries(statusConfig).map(([, cfg]) => (
              <div key={cfg.label} className="flex items-center gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                <span style={{ color: 'var(--text-muted)' }}>{cfg.label}</span>
              </div>
            ))}
          </div>

          {/* 뷰 전환 */}
          <div
            className="flex rounded-xl overflow-hidden border"
            style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)' }}
          >
            {[
              { mode: 'month' as const, Icon: CalendarDays, label: '월간' },
              { mode: 'list'  as const, Icon: LayoutList,  label: '목록' },
            ].map(({ mode, Icon, label }, i) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn('px-3 py-2 flex items-center gap-1.5 text-xs font-semibold transition-all', i > 0 && 'border-l')}
                style={{
                  borderColor: 'var(--border-default)',
                  backgroundColor: viewMode === mode ? 'var(--accent)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* 의뢰하기 */}
          {(profile.role === 'Producer' || profile.role === 'Admin') && (
            <Link href="/schedules/new">
              <button
                className="flex items-center gap-1.5 h-9 px-4 text-xs font-bold rounded-xl transition-all tracking-wide text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                <span className="text-sm font-bold leading-none">+</span>
                <span className="hidden sm:inline">의뢰하기</span>
              </button>
            </Link>
          )}
        </div>
      </div>

      {viewMode === 'month' ? (
        /* ── 월간 캘린더 ── */
        <div
          className="rounded-2xl overflow-hidden border"
          style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)' }}
        >
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-elevated)' }}>
            {[
              { d: '일', i: 0 }, { d: '월', i: 1 }, { d: '화', i: 2 },
              { d: '수', i: 3 }, { d: '목', i: 4 }, { d: '금', i: 5 }, { d: '토', i: 6 },
            ].map(({ d, i }) => (
              <div
                key={d}
                className="py-2.5 text-center text-[10px] font-bold tracking-[0.18em]"
                style={{
                  color: i === 0 ? '#F87171' : i === 6 ? '#60A5FA' : 'var(--text-muted)',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 divide-x divide-y" style={{ '--tw-divide-color': 'var(--border-subtle)' } as React.CSSProperties}>
            {calendarDays.map((date, idx) => {
              const daySchedules = getSchedulesForDay(date)
              const isCurrentMonth = isSameMonth(date, currentDate)
              const isTodayDate = isToday(date)
              const dow = date.getDay()

              return (
                <div
                  key={idx}
                  className="min-h-[128px] p-1.5 flex flex-col"
                  style={{
                    backgroundColor: !isCurrentMonth
                      ? 'rgba(0,0,0,0.15)'
                      : isTodayDate
                        ? 'rgba(74,158,232,0.06)'
                        : 'transparent',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {/* 날짜 숫자 */}
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className="inline-flex w-6 h-6 items-center justify-center rounded-full text-[12px] font-semibold leading-none"
                      style={{
                        backgroundColor: isTodayDate ? 'var(--accent)' : 'transparent',
                        color: isTodayDate
                          ? '#fff'
                          : !isCurrentMonth
                            ? 'var(--text-muted)'
                            : dow === 0
                              ? '#F87171'
                              : dow === 6
                                ? '#60A5FA'
                                : 'var(--text-secondary)',
                      }}
                    >
                      {format(date, 'd')}
                    </span>
                    {daySchedules.length > 0 && isCurrentMonth && (
                      <span className="text-[9px] tabular-nums pr-0.5" style={{ color: 'var(--text-muted)' }}>
                        {daySchedules.length}건
                      </span>
                    )}
                  </div>

                  {/* 일정 카드 */}
                  <div className="space-y-[3px] flex-1">
                    {daySchedules.slice(0, 3).map((schedule) => {
                      const cfg = statusConfig[schedule.status]
                      const startTime = format(parseISO(schedule.broadcast_start), 'HH:mm')
                      return (
                        <Link key={schedule.id} href={`/schedules/${schedule.id}`}>
                          <div
                            className="flex items-center gap-1 px-1.5 py-[3px] rounded-[5px] border-l-[3px] cursor-pointer transition-all duration-100 hover:brightness-125"
                            style={{
                              backgroundColor: cfg.cardBg,
                              borderLeftColor: cfg.cardBorder,
                            }}
                          >
                            {schedule.is_live && (
                              <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse shrink-0" />
                            )}
                            <span
                              className="text-[9px] tabular-nums shrink-0 font-medium"
                              style={{ color: cfg.timeColor }}
                            >
                              {startTime}
                            </span>
                            <span
                              className="text-[11px] leading-snug truncate font-semibold"
                              style={{ color: cfg.cardText }}
                            >
                              {schedule.program_name}
                            </span>
                          </div>
                        </Link>
                      )
                    })}
                    {daySchedules.length > 3 && (
                      <div className="text-[9px] pl-1 pt-0.5" style={{ color: 'var(--text-muted)' }}>
                        +{daySchedules.length - 3}건
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
        <div>
          {loading ? (
            <div className="rounded-2xl p-12 text-center border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
              <div className="w-5 h-5 border-2 border-[#4A9EE8]/30 border-t-[#4A9EE8] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
            </div>
          ) : schedules.length === 0 ? (
            <div className="rounded-2xl p-16 text-center border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
              <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>이번 달 등록된 일정이 없습니다.</p>
              {(profile.role === 'Producer' || profile.role === 'Admin') && (
                <Link href="/schedules/new">
                  <button
                    className="mt-4 h-9 px-5 text-xs font-bold rounded-xl text-white transition-colors"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    + 첫 의뢰하기
                  </button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {schedules.map((schedule) => {
                const cfg = statusConfig[schedule.status]
                const Icon = cfg.icon
                const ratio = schedule.status === 'pending' ? getApprovalRatio(schedule) : null
                const startDt = parseISO(schedule.broadcast_start)
                const endDt = parseISO(schedule.broadcast_end)
                const durationMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000)
                const durationStr = durationMin >= 60
                  ? `${Math.floor(durationMin / 60)}시간${durationMin % 60 > 0 ? ` ${durationMin % 60}분` : ''}`
                  : `${durationMin}분`

                return (
                  <Link key={schedule.id} href={`/schedules/${schedule.id}`}>
                    <div
                      className="group rounded-xl border border-l-4 transition-all duration-150 hover:brightness-110 overflow-hidden"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        borderLeftColor: cfg.listBorder,
                      }}
                    >
                      <div className="p-4 flex items-center gap-4">

                        {/* 날짜 블록 */}
                        <div className="shrink-0 w-14 text-center">
                          <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {format(startDt, 'M/d', { locale: ko })}({format(startDt, 'EEE', { locale: ko })})
                          </div>
                          <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>
                            {format(startDt, 'HH:mm')}
                          </div>
                          <div className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{durationStr}</div>
                        </div>

                        {/* 구분선 */}
                        <div className="w-px h-10 shrink-0" style={{ backgroundColor: 'var(--border-default)' }} />

                        {/* 메인 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {schedule.is_live && (
                              <span className="flex items-center gap-1 bg-red-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 tracking-wide">
                                <span className="w-1 h-1 bg-white rounded-full animate-pulse" />LIVE
                              </span>
                            )}
                            <h3 className="font-bold truncate text-[14px]" style={{ color: 'var(--text-primary)' }}>
                              {schedule.program_name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2.5 text-[11px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />{schedule.venue}
                            </span>
                            <span style={{ color: 'var(--border-strong)' }}>|</span>
                            <span className="flex items-center gap-1">
                              <User className="w-2.5 h-2.5" />{schedule.responsible_pd} PD
                            </span>
                          </div>
                        </div>

                        {/* 상태 배지 */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold', cfg.badge)}>
                            <Icon className={cn('w-3 h-3', cfg.iconColor)} />
                            {cfg.label}
                          </span>
                          {ratio && (
                            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>승인 {ratio}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
