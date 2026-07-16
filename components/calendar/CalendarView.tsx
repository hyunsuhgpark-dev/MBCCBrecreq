'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  LayoutGrid,
  MapPin,
  User,
  Plus,
  ChevronDown,
  Car,
} from 'lucide-react'
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  isSameWeek,
  eachDayOfInterval,
  endOfMonth,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { getDefaultScheduleFilter, matchesScheduleFilter, type ScheduleFilter } from '@/lib/roles'
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
  assigned: {
    label: '배정',
    dot: 'bg-purple-400',
    cardBg: '#1C0A2D',
    cardBorder: '#7C3AED',
    cardText: '#C084FC',
    timeColor: '#A855F7',
    badge: 'bg-purple-950 text-purple-300 border border-purple-800',
    listBorder: '#7C3AED',
    icon: Car,
    iconColor: 'text-purple-400',
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

// SSR에서는 window가 없으므로 데스크탑 여부를 알 수 없어 모바일(주간) 기준으로 시작
function getInitialIsDesktop() {
  if (typeof window === 'undefined') return false
  return window.innerWidth >= 768
}

export default function CalendarView({ profile }: CalendarViewProps) {
  const router = useRouter()
  // createClient()는 호출마다 새 인스턴스를 반환하므로, 리렌더마다 바뀌지 않도록 한 번만 생성해 고정
  const [supabase] = useState(() => createClient())
  const [currentDate, setCurrentDate] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  // PC(≥768px)는 월간 달력, 모바일은 주간 기본 — 최초 렌더에서 바로 올바른 값으로 시작해
  // "week → month" 뒤늦은 전환으로 인한 이중 fetch(cascading render)를 방지
  const [isDesktop, setIsDesktop] = useState(getInitialIsDesktop)
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'list'>(() =>
    getInitialIsDesktop() ? 'month' : 'week'
  )
  // 스케줄 필터 — 역할별 기본값 (PD/Admin: 전체, 기술국: 기술, 영상국: 영상)
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>(() =>
    getDefaultScheduleFilter(profile.role)
  )
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false)

  // 화면 크기 변경(창 리사이즈, 태블릿 회전 등)에만 대응 — 초기값은 이미 올바르게 세팅되어 있음
  useEffect(() => {
    function handleResize() {
      const desktop = window.innerWidth >= 768
      setIsDesktop(desktop)
      setViewMode((prev) => (prev === 'week' && desktop ? 'month' : prev))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const weekStart = startOfWeek(currentDate, { locale: ko })
  const weekEnd = endOfWeek(currentDate, { locale: ko })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const monthEnd = endOfMonth(currentDate)
  // 월간 그리드: 첫 주 일요일 ~ 마지막 주 토요일
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const allGridDays = viewMode === 'month' ? eachDayOfInterval({ start: gridStart, end: gridEnd }) : []

  // 마운트 시점의 viewMode 전환(월간/주간)이나 여러 트리거(마운트, 실시간 이벤트)가
  // 겹쳐 발생해도, "가장 나중에 시작된 요청"의 응답만 반영되도록 요청 ID로 경쟁 상태를 차단
  const latestRequestIdRef = useRef(0)

  const fetchSchedules = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current
    setLoading(true)
    const rangeStart = viewMode === 'week' ? weekStart
      : viewMode === 'month' ? startOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), { weekStartsOn: 0 })
      : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const rangeEnd = viewMode === 'week' ? weekEnd
      : viewMode === 'month' ? endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
      : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59)
    const { data, error } = await supabase
      .from('schedules')
      .select(`*, creator:profiles!schedules_created_by_fkey(id, full_name, role), approvals(id, part, status, reject_reason)`)
      .gte('broadcast_start', rangeStart.toISOString())
      .lte('broadcast_start', rangeEnd.toISOString())
      .order('broadcast_start', { ascending: true })

    // 이 응답을 기다리는 동안 더 최신 요청이 시작됐다면, 오래된(stale) 응답은 버린다
    if (requestId !== latestRequestIdRef.current) return

    if (error) {
      console.error('일정 조회 실패:', error)
      setLoading(false)
      return
    }

    setSchedules((data as Schedule[]) ?? [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, viewMode, supabase])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])

  // 실시간 구독은 supabase 클라이언트가 고정되어 있는 한 마운트 시 한 번만 연결하고,
  // 이벤트 발생 시엔 ref를 통해 항상 "최신" fetchSchedules를 호출한다 (매 변경마다 재연결 방지)
  const fetchSchedulesRef = useRef(fetchSchedules)
  useEffect(() => {
    fetchSchedulesRef.current = fetchSchedules
  }, [fetchSchedules])

  useEffect(() => {
    const channel = supabase
      .channel('schedules_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => {
        fetchSchedulesRef.current()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  function applyScheduleFilter(list: typeof schedules) {
    return list.filter((s) => matchesScheduleFilter(s, scheduleFilter))
  }

  function getSchedulesForDay(date: Date) {
    const daySchedules = schedules.filter((s) => isSameDay(parseISO(s.broadcast_start), date))
    return applyScheduleFilter(daySchedules)
  }

  function getApprovalRatio(schedule: Schedule) {
    if (!schedule.approvals) return null
    const approved = schedule.approvals.filter((a) => a.status === 'approved').length
    return `${approved}/${schedule.approvals.length}`
  }

  const canCreate = profile.role === 'Producer' || profile.role === 'Admin'
  const isCurrentWeek = isSameWeek(currentDate, new Date(), { locale: ko })

  const displayedSchedules = applyScheduleFilter(schedules)

  return (
    <div className={cn('px-4 py-5', !isDesktop && 'max-w-7xl mx-auto')}>

      {/* ── 컨트롤 바 ── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(viewMode === 'week' ? subWeeks(currentDate, 1) : new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* 좌우 화살표 정중앙에 오도록 justify-center + text-center로 정렬 (5px만 왼쪽으로 미세 조정) */}
          <div className="flex items-center justify-center gap-2 min-w-[150px] text-center -translate-x-[5px]">
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
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-x-4">
          {/* 범례 — 테두리/배경 없이 점 + 텍스트만 가볍게 */}
          <div className="hidden md:flex items-center gap-x-4 text-[11px]">
            {Object.entries(statusConfig).map(([, cfg]) => (
              <div key={cfg.label} className="flex items-center gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                <span style={{ color: 'var(--text-muted)' }}>{cfg.label}</span>
              </div>
            ))}
          </div>

          {/* 의뢰하기 — 투명 배경의 심플한 텍스트 버튼, 호버 시에만 옅은 배경. +와 텍스트는 한 단어처럼 붙여줌 */}
          {canCreate && (
            <Link href="/schedules/new">
              <button
                className="flex items-center gap-1 h-11 px-2.5 text-sm font-bold rounded-lg transition-colors text-white touch-manipulation active:scale-95 hover:bg-white/10"
              >
                <Plus className="w-5 h-5" />
                <span>의뢰</span>
              </button>
            </Link>
          )}

          {/* 뷰 전환 드롭다운 + 스케줄 필터 드롭다운을 한 그룹으로 묶어서, 그룹 내부 간격(gap-1)을
              바깥 gap-x-4와 별개로 훨씬 좁게 직접 제어함. (패딩까지 줄여야 실제로 눈에 보이는 변화가 생김) */}
          <div className="flex items-center gap-1">

          {/* 뷰 전환 — 개별 버튼 대신 단일 드롭다운으로 통합 */}
          <div className="relative">
            <button
              onClick={() => { setViewDropdownOpen((o) => !o); setFilterDropdownOpen(false) }}
              className="flex items-center gap-1.5 h-11 pl-2.5 pr-1.5 rounded-lg text-sm font-semibold transition-colors hover:bg-white/10"
              style={{ color: 'var(--text-primary)' }}
            >
              <span>{viewMode === 'week' ? '주간' : viewMode === 'month' ? '달력' : '목록'}</span>
              <ChevronDown
                className={cn('w-4 h-4 transition-transform', viewDropdownOpen && 'rotate-180')}
                style={{ color: 'var(--text-muted)' }}
              />
            </button>

            {viewDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setViewDropdownOpen(false)} />
                <div
                  className="absolute right-0 top-full mt-2 z-20 rounded-xl border overflow-hidden shadow-xl min-w-[140px]"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
                >
                  {([
                    { mode: 'week'  as const, Icon: CalendarDays, label: '주간' },
                    { mode: 'month' as const, Icon: LayoutGrid,   label: '달력' },
                    { mode: 'list'  as const, Icon: LayoutList,   label: '목록' },
                  ]).map(({ mode, Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => { setViewMode(mode); setViewDropdownOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-all"
                      style={{
                        backgroundColor: viewMode === mode ? 'color-mix(in srgb, var(--accent) 28%, var(--bg-surface))' : 'transparent',
                        color: viewMode === mode ? '#fff' : 'var(--text-secondary)',
                        borderLeft: viewMode === mode ? '3px solid var(--accent)' : '3px solid transparent',
                      }}
                      onMouseEnter={e => { if (viewMode !== mode) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)' }}
                      onMouseLeave={e => { if (viewMode !== mode) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 스케줄 필터 — 왼쪽의 뷰 전환 드롭다운과 동일한 패밀리 룩 (아이콘 없이 텍스트 + 화살표만) */}
          <div className="relative">
            <button
              onClick={() => { setFilterDropdownOpen((o) => !o); setViewDropdownOpen(false) }}
              className="flex items-center gap-1.5 h-11 pl-1.5 pr-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-white/10"
              style={{ color: scheduleFilter !== 'all' ? 'var(--accent)' : 'var(--text-primary)' }}
            >
              <span>{scheduleFilter === 'all' ? '전체' : scheduleFilter === 'tech' ? '기술' : '영상'}</span>
              <ChevronDown
                className={cn('w-4 h-4 transition-transform', filterDropdownOpen && 'rotate-180')}
                style={{ color: 'var(--text-muted)' }}
              />
            </button>

            {filterDropdownOpen && (
              <>
                {/* 배경 닫기 레이어 */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setFilterDropdownOpen(false)}
                />
                <div
                  className="absolute right-0 top-full mt-2 z-20 rounded-xl border overflow-hidden shadow-xl min-w-[160px]"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
                >
                  {([
                    { key: 'all',  label: '전체 스케줄',  sub: '모든 일정 표시' },
                    { key: 'tech', label: '기술 스케줄',  sub: '중계차 · 스튜디오 · AUDIO' },
                    { key: 'cam',  label: '영상 스케줄',  sub: '중계차 · 스튜디오 · ENG' },
                  ] as const).map(({ key, label, sub }) => (
                    <button
                      key={key}
                      onClick={() => { setScheduleFilter(key); setFilterDropdownOpen(false) }}
                      className="w-full text-left px-4 py-3 transition-all flex flex-col gap-0.5"
                      style={{
                        backgroundColor: scheduleFilter === key ? 'color-mix(in srgb, var(--accent) 28%, var(--bg-surface))' : 'transparent',
                        borderLeft: scheduleFilter === key ? '3px solid var(--accent)' : '3px solid transparent',
                      }}
                      onMouseEnter={e => { if (scheduleFilter !== key) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)' }}
                      onMouseLeave={e => { if (scheduleFilter !== key) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                    >
                      <span className="text-sm font-semibold" style={{ color: scheduleFilter === key ? '#fff' : 'var(--text-muted)' }}>
                        {label}
                      </span>
                      <span className="text-[11px]" style={{ color: scheduleFilter === key ? 'rgba(255,255,255,0.65)' : 'var(--text-muted)' }}>{sub}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          </div>

        </div>
      </div>

      {/* ── 주간 뷰 ── */}
      {viewMode === 'week' && (
        <div className="space-y-4">
          {loading ? (
            <div
              className="rounded-2xl p-12 text-center border"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              <div className="w-5 h-5 border-2 border-[#4A9EE8]/30 border-t-[#4A9EE8] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
            </div>
          ) : (
            weekDays.map((date, idx) => {
              const daySchedules = getSchedulesForDay(date)
              const dow = date.getDay()
              const isTodayDate = isToday(date)
              const dowLabel = DOW_LABELS[dow]
              const isWeekend = dow === 0 || dow === 6
              const dateColor = isWeekend ? DOW_COLORS[dow] : 'var(--text-primary)'

              return (
                <div
                  key={idx}
                  className="rounded-2xl border overflow-hidden flex"
                  style={{
                    borderColor: isTodayDate ? 'rgba(240,240,242,0.55)' : 'var(--border-default)',
                    backgroundColor: 'var(--bg-surface)',
                    boxShadow: isTodayDate ? '0 0 0 1px rgba(240,240,242,0.55)' : 'none',
                    minHeight: '80px',
                  }}
                >
                  {/* 왼쪽: 날짜 사이드바 (PD/Admin은 클릭 시 의뢰 이동) */}
                  <div
                    role={canCreate ? 'button' : undefined}
                    onClick={canCreate ? () => router.push(`/schedules/new?date=${format(date, 'yyyy-MM-dd')}`) : undefined}
                    className={cn(
                      'shrink-0 w-20 flex flex-col items-center justify-center gap-0.5 border-r',
                      canCreate && 'cursor-pointer transition-colors hover:brightness-125'
                    )}
                    style={{
                      borderColor: 'var(--border-subtle)',
                      backgroundColor: 'var(--bg-elevated)',
                    }}
                  >
                    <span
                      className="text-[36px] font-bold tabular-nums leading-none"
                      style={{ color: dateColor }}
                    >
                      {format(date, 'd')}
                    </span>
                    <span
                      className="text-[14px] font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      ({dowLabel})
                    </span>
                    {isTodayDate && (
                      <span className="text-[9px] font-bold mt-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(240,240,242,0.15)', color: 'var(--text-secondary)', border: '1px solid rgba(240,240,242,0.3)' }}>
                        TODAY
                      </span>
                    )}
                  </div>

                  {/* 오른쪽: 일정 목록 */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {daySchedules.length === 0 ? (
                      <div className="flex items-center justify-between px-5 py-6">
                        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>일정 없음</span>
                        {canCreate && (
                          <button
                            onClick={() => router.push(`/schedules/new?date=${format(date, 'yyyy-MM-dd')}`)}
                            className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-lg border transition-opacity opacity-40 hover:opacity-100"
                            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                          >
                            <Plus className="w-3 h-3" /> 의뢰
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y" style={{ '--tw-divide-color': 'var(--border-subtle)' } as React.CSSProperties}>
                        {daySchedules.map((schedule) => {
                          const cfg = statusConfig[schedule.status]
                          const startDt = parseISO(schedule.broadcast_start)

                          // 특기사항: 장소 + 비고(notes)만 표시
                          const noteParts: string[] = []
                          if (schedule.venue) noteParts.push(schedule.venue)
                          if (schedule.notes?.trim()) noteParts.push(schedule.notes.trim())
                          const note = noteParts.join(' · ')

                          return (
                            <Link key={schedule.id} href={`/schedules/${schedule.id}`}>
                              <div
                                className="flex items-center gap-0 px-0 transition-all hover:brightness-110 cursor-pointer border-l-4"
                                style={{ borderLeftColor: cfg.cardBorder, backgroundColor: cfg.cardBg }}
                              >
                                <div className="flex-1 min-w-0 px-5 py-4">
                                  <div className="flex items-baseline gap-3 flex-wrap">
                                    {/* 시간 */}
                                    <span
                                      className="text-[18px] tabular-nums font-bold shrink-0 leading-none"
                                      style={{ color: cfg.timeColor }}
                                    >
                                      {format(startDt, 'HH:mm')}
                                    </span>
                                    {/* 프로그램명 */}
                                    <span
                                      className="text-[18px] font-bold leading-none"
                                      style={{ color: cfg.cardText }}
                                    >
                                      {schedule.program_name}
                                    </span>
                                    {/* 특기사항 */}
                                    {note && (
                                      <span
                                        className="text-[13px] leading-none"
                                        style={{ color: cfg.cardText, opacity: 0.8 }}
                                      >
                                        {note}
                                      </span>
                                    )}
                                    {schedule.is_live && (
                                      <span className="inline-flex items-center gap-1 bg-red-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                                        <span className="w-1 h-1 bg-white rounded-full animate-pulse" />LIVE
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* 상태 */}
                                <div className="shrink-0 pr-4">
                                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', cfg.badge)}>
                                    {cfg.label}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          )
                        })}

                        {/* 일정 추가 버튼 (일정 있는 날) */}
                        {canCreate && (
                          <div className="px-5 py-2.5 flex justify-end" style={{ backgroundColor: 'var(--bg-surface)' }}>
                            <button
                              onClick={() => router.push(`/schedules/new?date=${format(date, 'yyyy-MM-dd')}`)}
                              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-opacity opacity-30 hover:opacity-100"
                              style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                            >
                              <Plus className="w-3 h-3" /> 추가
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── 월간 달력 뷰 ── */}
      {viewMode === 'month' && (
        <div>
          {loading ? (
            <div
              className="rounded-2xl p-12 text-center border"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              <div className="w-5 h-5 border-2 border-[#4A9EE8]/30 border-t-[#4A9EE8] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
            </div>
          ) : (
            <>
              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 mb-1">
                {DOW_LABELS.map((label, i) => (
                  <div
                    key={i}
                    className="text-center font-bold tracking-wide"
                    style={{
                      color: DOW_COLORS[i],
                      fontSize: isDesktop ? '14px' : '11px',
                      paddingTop: isDesktop ? '10px' : '8px',
                      paddingBottom: isDesktop ? '10px' : '8px',
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7" style={{ gap: isDesktop ? '4px' : '4px' }}>
                {allGridDays.map((day, idx) => {
                  const daySchedules = getSchedulesForDay(day)
                  const isInCurrentMonth = isSameMonth(day, currentDate)
                  const isTodayDate = isToday(day)
                  const dow = day.getDay()
                  const isWeekend = dow === 0 || dow === 6

                  return (
                    <div
                      key={idx}
                      className="rounded-xl border overflow-hidden"
                      style={{
                        minHeight: isDesktop ? '120px' : '72px',
                        backgroundColor: isTodayDate ? 'rgba(240,240,242,0.05)' : 'var(--bg-surface)',
                        borderColor: isTodayDate ? 'rgba(240,240,242,0.45)' : 'var(--border-subtle)',
                        boxShadow: isTodayDate ? '0 0 0 1px rgba(240,240,242,0.25)' : 'none',
                        opacity: isInCurrentMonth ? 1 : 0.28,
                        cursor: canCreate && isInCurrentMonth ? 'pointer' : 'default',
                      }}
                      onDoubleClick={() => {
                        if (canCreate && isInCurrentMonth) {
                          router.push(`/schedules/new?date=${format(day, 'yyyy-MM-dd')}`)
                        }
                      }}
                      onClick={(e) => {
                        // 일정 칩을 클릭한 경우에는 제외 (Link로 처리)
                        if ((e.target as HTMLElement).closest('a')) return
                        if (canCreate && isInCurrentMonth && isDesktop) {
                          router.push(`/schedules/new?date=${format(day, 'yyyy-MM-dd')}`)
                        }
                      }}
                    >
                      {/* 날짜 숫자 */}
                      <div
                        className="text-right font-bold tabular-nums"
                        style={{
                          color: isWeekend ? DOW_COLORS[dow] : 'var(--text-secondary)',
                          fontSize: isDesktop ? '15px' : '12px',
                          padding: isDesktop ? '8px 10px 4px' : '6px 8px 2px',
                        }}
                      >
                        {format(day, 'd')}
                      </div>

                      {/* 일정 칩 */}
                      <div style={{ padding: isDesktop ? '0 6px 8px' : '0 4px 6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {daySchedules.slice(0, isDesktop ? 5 : 3).map((s) => {
                          const cfg = statusConfig[s.status]
                          return (
                            <Link key={s.id} href={`/schedules/${s.id}`}>
                              <div
                                className="flex items-center gap-1 rounded cursor-pointer transition-all hover:brightness-125"
                                style={{
                                  backgroundColor: cfg.cardBg,
                                  borderLeft: `3px solid ${cfg.cardBorder}`,
                                  padding: isDesktop ? '4px 8px' : '2px 6px',
                                }}
                              >
                                <span className={cn('rounded-full shrink-0', cfg.dot)} style={{ width: isDesktop ? '6px' : '4px', height: isDesktop ? '6px' : '4px' }} />
                                <span
                                  className="truncate font-medium"
                                  style={{
                                    color: cfg.cardText,
                                    fontSize: isDesktop ? '13px' : '10px',
                                    lineHeight: isDesktop ? '1.4' : '1.2',
                                  }}
                                >
                                  {s.program_name}
                                </span>
                              </div>
                            </Link>
                          )
                        })}
                        {daySchedules.length > (isDesktop ? 5 : 3) && (
                          <div
                            style={{
                              color: 'var(--text-muted)',
                              fontSize: isDesktop ? '12px' : '9px',
                              padding: isDesktop ? '2px 8px' : '0 4px',
                            }}
                          >
                            +{daySchedules.length - (isDesktop ? 5 : 3)}건 더
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
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
          ) : applyScheduleFilter(schedules).length === 0 ? (
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
              {applyScheduleFilter(schedules).map((schedule) => {
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
