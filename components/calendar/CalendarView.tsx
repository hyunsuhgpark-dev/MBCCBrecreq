'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Schedule, Profile } from '@/lib/types'
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  LayoutList,
  CalendarDays,
  MapPin,
  User,
  Plus,
} from 'lucide-react'
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  isToday,
  parseISO,
  isSameWeek,
} from 'date-fns'
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
    timeColor: '#D97706',
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
    timeColor: '#7A7A80',
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
    timeColor: '#10B981',
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
    timeColor: '#F87171',
    badge: 'bg-rose-950 text-rose-300 border border-rose-800',
    listBorder: '#DC2626',
    icon: XCircle,
    iconColor: 'text-rose-400',
  },
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const DOW_COLORS = ['#F87171', 'var(--text-primary)', 'var(--text-primary)', 'var(--text-primary)', 'var(--text-primary)', 'var(--text-primary)', '#60A5FA']

export default function CalendarView({ profile }: CalendarViewProps) {
  const router = useRouter()
  const supabase = createClient()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week')

  const weekStart = startOfWeek(currentDate, { locale: ko })
  const weekEnd = endOfWeek(currentDate, { locale: ko })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    const rangeStart = viewMode === 'week' ? weekStart : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const rangeEnd = viewMode === 'week' ? weekEnd : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59)
    const { data } = await supabase
      .from('schedules')
      .select(`*, creator:profiles!schedules_created_by_fkey(id, full_name, role), approvals(id, part, status, reject_reason)`)
      .gte('broadcast_start', rangeStart.toISOString())
      .lte('broadcast_start', rangeEnd.toISOString())
      .order('broadcast_start', { ascending: true })
    setSchedules((data as Schedule[]) ?? [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, viewMode])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])
  useEffect(() => {
    const channel = supabase
      .channel('schedules_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => fetchSchedules())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchSchedules, supabase])

  function getSchedulesForDay(date: Date) {
    return schedules.filter((s) => isSameDay(parseISO(s.broadcast_start), date))
  }

  function getApprovalRatio(schedule: Schedule) {
    if (!schedule.approvals) return null
    const approved = schedule.approvals.filter((a) => a.status === 'approved').length
    return `${approved}/${schedule.approvals.length}`
  }

  const canCreate = profile.role === 'Producer' || profile.role === 'Admin'
  const isCurrentWeek = isSameWeek(currentDate, new Date(), { locale: ko })

  const totalCount = schedules.length
  const confirmedCount = schedules.filter(s => s.status === 'confirmed').length

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">

      {/* ── 컨트롤 바 ── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentDate(viewMode === 'week' ? subWeeks(currentDate, 1) : new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-baseline gap-2 px-2 min-w-[160px]">
            {viewMode === 'week' ? (
              <span className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {format(weekStart, 'M/d', { locale: ko })} – {format(weekEnd, 'M/d', { locale: ko })}
              </span>
            ) : (
              <>
                <span className="text-[13px] tabular-nums font-medium" style={{ color: 'var(--text-muted)' }}>
                  {format(currentDate, 'yyyy')}
                </span>
                <span className="text-[22px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {format(currentDate, 'M월', { locale: ko })}
                </span>
              </>
            )}
          </div>

          <button
            onClick={() => setCurrentDate(viewMode === 'week' ? addWeeks(currentDate, 1) : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* 이번주/오늘 버튼 */}
          {(viewMode === 'week' ? !isCurrentWeek : true) && (
            <button
              onClick={() => setCurrentDate(new Date())}
              className="ml-1 h-7 px-2.5 text-[11px] font-semibold rounded-lg border transition-colors tracking-wide"
              style={{ color: 'var(--accent)', borderColor: 'var(--accent)', opacity: 0.85 }}
            >
              {viewMode === 'week' ? '이번주' : '오늘'}
            </button>
          )}

          {!loading && (
            <span className="hidden sm:inline-flex items-center gap-1.5 ml-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>총 {totalCount}건</span>
              {confirmedCount > 0 && (
                <span className="text-emerald-400 font-semibold">/ {confirmedCount}건 확정</span>
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
              { mode: 'week' as const, Icon: CalendarDays, label: '주간' },
              { mode: 'list'  as const, Icon: LayoutList,  label: '목록' },
            ].map(({ mode, Icon, label }, i) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn('px-4 py-2.5 flex items-center gap-2 text-sm font-semibold transition-all', i > 0 && 'border-l')}
                style={{
                  borderColor: 'var(--border-default)',
                  backgroundColor: viewMode === mode ? 'var(--accent)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* 의뢰하기 */}
          {canCreate && (
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

      {/* ── 주간 뷰 ── */}
      {viewMode === 'week' && (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)' }}
        >
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-5 h-5 border-2 border-[#4A9EE8]/30 border-t-[#4A9EE8] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
            </div>
          ) : (
            <div className="divide-y" style={{ '--tw-divide-color': 'var(--border-subtle)' } as React.CSSProperties}>
              {weekDays.map((date, idx) => {
                const daySchedules = getSchedulesForDay(date)
                const dow = date.getDay()
                const isTodayDate = isToday(date)
                const dowLabel = DOW_LABELS[dow]
                const dowColor = DOW_COLORS[dow]

                return (
                  <div key={idx} className="flex min-h-[56px]">

                    {/* 날짜 컬럼 */}
                    <div
                      className="shrink-0 w-16 sm:w-20 flex flex-col items-center justify-start pt-3 pb-3 border-r"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        backgroundColor: isTodayDate ? 'rgba(74,158,232,0.07)' : 'transparent',
                      }}
                    >
                      <span
                        className="text-[11px] font-semibold leading-none mb-1"
                        style={{ color: isTodayDate ? 'var(--accent)' : dowColor }}
                      >
                        {dowLabel}
                      </span>
                      <span
                        className={cn(
                          'text-[22px] font-bold tabular-nums leading-none',
                          isTodayDate && 'w-9 h-9 flex items-center justify-center rounded-full text-white text-[18px]'
                        )}
                        style={{
                          backgroundColor: isTodayDate ? 'var(--accent)' : 'transparent',
                          color: isTodayDate ? '#fff' : dowColor,
                        }}
                      >
                        {format(date, 'd')}
                      </span>
                    </div>

                    {/* 일정 영역 */}
                    <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col gap-2">
                      {daySchedules.length === 0 ? (
                        /* 일정 없음 */
                        canCreate ? (
                          <button
                            onClick={() => router.push(`/schedules/new?date=${format(date, 'yyyy-MM-dd')}`)}
                            className="flex items-center gap-1.5 self-start text-[11px] opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100 transition-opacity rounded-lg px-2 py-1"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Plus className="w-3 h-3" />
                            <span>의뢰 추가</span>
                          </button>
                        ) : (
                          <span className="text-[11px] self-center mt-1" style={{ color: 'var(--border-default)' }}>—</span>
                        )
                      ) : (
                        <>
                          {daySchedules.map((schedule) => {
                            const cfg = statusConfig[schedule.status]
                            const Icon = cfg.icon
                            const startDt = parseISO(schedule.broadcast_start)
                            const endDt = parseISO(schedule.broadcast_end)
                            const durationMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000)
                            const durationStr = durationMin >= 60
                              ? `${Math.floor(durationMin / 60)}시간${durationMin % 60 > 0 ? ` ${durationMin % 60}분` : ''}`
                              : `${durationMin}분`

                            return (
                              <Link key={schedule.id} href={`/schedules/${schedule.id}`} onClick={(e) => e.stopPropagation()}>
                                <div
                                  className="rounded-xl border-l-4 px-3 py-2.5 transition-all hover:brightness-110 cursor-pointer"
                                  style={{
                                    backgroundColor: cfg.cardBg,
                                    borderLeftColor: cfg.cardBorder,
                                  }}
                                >
                                  {/* 상단: 시간 + 상태 */}
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="text-[13px] tabular-nums font-bold"
                                        style={{ color: cfg.timeColor }}
                                      >
                                        {format(startDt, 'HH:mm')}
                                      </span>
                                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                        {durationStr}
                                      </span>
                                      {schedule.is_live && (
                                        <span className="flex items-center gap-0.5 bg-red-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide">
                                          <span className="w-1 h-1 bg-white rounded-full animate-pulse" />LIVE
                                        </span>
                                      )}
                                    </div>
                                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0', cfg.badge)}>
                                      <Icon className={cn('w-2.5 h-2.5', cfg.iconColor)} />
                                      {cfg.label}
                                    </span>
                                  </div>

                                  {/* 프로그램명 */}
                                  <p className="text-[14px] font-bold mb-1.5" style={{ color: cfg.cardText }}>
                                    {schedule.program_name}
                                  </p>

                                  {/* 하단: 장소 + PD */}
                                  <div className="flex items-center gap-3 text-[11px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-2.5 h-2.5 shrink-0" />
                                      {schedule.venue}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <User className="w-2.5 h-2.5 shrink-0" />
                                      {schedule.responsible_pd} PD
                                    </span>
                                  </div>
                                </div>
                              </Link>
                            )
                          })}

                          {/* 일정이 있는 날에도 PD는 추가 가능 */}
                          {canCreate && (
                            <button
                              onClick={() => router.push(`/schedules/new?date=${format(date, 'yyyy-MM-dd')}`)}
                              className="flex items-center gap-1 self-start text-[11px] px-2 py-1 rounded-lg transition-all opacity-40 hover:opacity-100"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Plus className="w-3 h-3" />
                              <span>추가</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 목록 뷰 ── */}
      {viewMode === 'list' && (
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
              {canCreate && (
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
                        <div className="shrink-0 w-14 text-center">
                          <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {format(startDt, 'M/d', { locale: ko })}({format(startDt, 'EEE', { locale: ko })})
                          </div>
                          <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>
                            {format(startDt, 'HH:mm')}
                          </div>
                          <div className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{durationStr}</div>
                        </div>
                        <div className="w-px h-10 shrink-0" style={{ backgroundColor: 'var(--border-default)' }} />
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
