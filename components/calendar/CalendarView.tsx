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
    cardBg: 'transparent',
    cardBorder: '#78350F',
    cardText: 'var(--text-primary)',
    timeColor: 'var(--text-muted)',
    badge: 'text-amber-400',
    listBorder: '#78350F',
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
  },
  pending: {
    label: '대기',
    dot: 'bg-slate-500',
    cardBg: 'transparent',
    cardBorder: '#374151',
    cardText: 'var(--text-primary)',
    timeColor: 'var(--text-muted)',
    badge: 'text-slate-500',
    listBorder: '#374151',
    icon: Clock,
    iconColor: 'text-slate-500',
  },
  assigned: {
    label: '배정',
    dot: 'bg-purple-400',
    cardBg: 'transparent',
    cardBorder: '#5B21B6',
    cardText: 'var(--text-primary)',
    timeColor: 'var(--text-muted)',
    badge: 'text-purple-400',
    listBorder: '#5B21B6',
    icon: Car,
    iconColor: 'text-purple-400',
  },
  confirmed: {
    label: '확정',
    dot: 'bg-emerald-400',
    cardBg: 'transparent',
    cardBorder: '#064E3B',
    cardText: 'var(--text-primary)',
    timeColor: 'var(--text-muted)',
    badge: 'text-emerald-400',
    listBorder: '#064E3B',
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
  },
  rejected: {
    label: '반려',
    dot: 'bg-rose-400',
    cardBg: 'transparent',
    cardBorder: '#7F1D1D',
    cardText: 'var(--text-primary)',
    timeColor: 'var(--text-muted)',
    badge: 'text-rose-400',
    listBorder: '#7F1D1D',
    icon: XCircle,
    iconColor: 'text-rose-400',
  },
} as const

type StatusKey = keyof typeof statusConfig
function getCfg(status: string) {
  return statusConfig[(status as StatusKey) in statusConfig ? (status as StatusKey) : 'pending']
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const DOW_COLORS = ['#C07070', '#4A4A4A', '#4A4A4A', '#4A4A4A', '#4A4A4A', '#4A4A4A', '#4A7090']


export default function CalendarView({ profile }: CalendarViewProps) {
  const router = useRouter()
  // createClient()는 호출마다 새 인스턴스를 반환하므로, 리렌더마다 바뀌지 않도록 한 번만 생성해 고정
  const [supabase] = useState(() => createClient())
  const [currentDate, setCurrentDate] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  // SSR 안전: 항상 false/'week'로 시작 → hydration mismatch 방지
  // useEffect 에서 실제 화면 크기로 업데이트
  const [isDesktop, setIsDesktop] = useState(false)
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'list'>('week')
  // 스케줄 필터 — 역할별 기본값 (PD/Admin: 전체, 기술국: 기술, 영상국: 영상)
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>(() =>
    getDefaultScheduleFilter(profile.role)
  )
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false)

  // 마운트 후 실제 화면 크기 반영 + resize 대응
  useEffect(() => {
    const desktop = window.innerWidth >= 768
    setIsDesktop(desktop)
    if (desktop) setViewMode('month')

    function handleResize() {
      const d = window.innerWidth >= 768
      setIsDesktop(d)
      setViewMode((prev) => (prev === 'week' && d ? 'month' : prev))
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
            className="w-8 h-8 flex items-center justify-center rounded text-[#4A4A4A] hover:text-[#BEBEBE] hover:bg-white/[0.05] transition-colors shrink-0"
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
            className="w-8 h-8 flex items-center justify-center rounded text-[#4A4A4A] hover:text-[#BEBEBE] hover:bg-white/[0.05] transition-colors shrink-0"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-x-4">
          {/* 범례 — 테두리/배경 없이 점 + 텍스트만 가볍게 */}

          {/* '+ 의뢰' 버튼은 상단 GNB(PC) / 하단 탭바(모바일)에 이미 '제작 의뢰' 진입점이 있어 중복이므로 제거함 */}

          {/* 뷰 전환 드롭다운 + 스케줄 필터 드롭다운을 한 그룹으로 묶어서, 그룹 내부 간격(gap-1)을
              바깥 gap-x-4와 별개로 훨씬 좁게 직접 제어함. (패딩까지 줄여야 실제로 눈에 보이는 변화가 생김) */}
          <div className="flex items-center gap-1">

          {/* 뷰 전환 — 개별 버튼 대신 단일 드롭다운으로 통합 */}
          <div className="relative">
            <button
              onClick={() => { setViewDropdownOpen((o) => !o); setFilterDropdownOpen(false) }}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded text-[13px] font-medium text-[#4A4A4A] hover:text-[#C0C0C0] hover:bg-white/[0.05] transition-colors"
            >
              <span>{viewMode === 'week' ? '주간' : viewMode === 'month' ? '월간' : '목록'}</span>
              <ChevronDown
                className={cn('w-4 h-4 transition-transform', viewDropdownOpen && 'rotate-180')}
              />
            </button>

            {viewDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setViewDropdownOpen(false)} />
                <div
                  className="absolute right-0 top-full mt-1 z-20 rounded-md border border-white/[0.15] overflow-hidden shadow-xl min-w-[120px]"
                  style={{ backgroundColor: '#0F0F0F' }}
                >
                  {([
                    { mode: 'week'  as const, Icon: CalendarDays, label: '주간' },
                    { mode: 'month' as const, Icon: LayoutGrid,   label: '월간' },
                    { mode: 'list'  as const, Icon: LayoutList,   label: '목록' },
                  ]).map(({ mode, Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => { setViewMode(mode); setViewDropdownOpen(false) }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-[13px] transition-colors',
                        viewMode === mode
                          ? 'bg-white/[0.06] text-[#D0D0D0] font-medium'
                          : 'text-[#4A4A4A] hover:bg-white/[0.04] hover:text-[#C0C0C0]'
                      )}
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
              className="flex items-center gap-1.5 h-8 px-2.5 rounded text-[13px] font-medium text-[#4A4A4A] hover:text-[#C0C0C0] hover:bg-white/[0.05] transition-colors"
            >
              <span>{scheduleFilter === 'all' ? '전체' : scheduleFilter === 'tech' ? '기술' : '영상'}</span>
              <ChevronDown
                className={cn('w-4 h-4 transition-transform', filterDropdownOpen && 'rotate-180')}
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
                  className="absolute right-0 top-full mt-1 z-20 rounded-md border border-white/[0.15] overflow-hidden shadow-xl min-w-[150px]"
                  style={{ backgroundColor: '#0F0F0F' }}
                >
                  {([
                    { key: 'all',  label: '전체 스케줄',  sub: '모든 일정 표시' },
                    { key: 'tech', label: '기술 스케줄',  sub: '중계차 · 스튜디오 · AUDIO' },
                    { key: 'cam',  label: '영상 스케줄',  sub: '중계차 · 스튜디오 · ENG' },
                  ] as const).map(({ key, label, sub }) => (
                    <button
                      key={key}
                      onClick={() => { setScheduleFilter(key); setFilterDropdownOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-2.5 transition-colors flex flex-col gap-0.5',
                        scheduleFilter === key
                          ? 'bg-white/[0.06] text-[#D0D0D0]'
                          : 'text-[#4A4A4A] hover:bg-white/[0.04] hover:text-[#C0C0C0]'
                      )}
                    >
                      <span className="text-[13px] font-medium">
                        {label}
                      </span>
                      <span className="text-[11px] opacity-40">{sub}</span>
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
        <div className="border border-white/[0.15] rounded overflow-hidden">
          {loading ? (
            <div
              className="p-12 text-center"
            >
              <div className="w-4 h-4 border border-white/[0.12] border-t-white/30 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
            </div>
          ) : (
            weekDays.map((date, idx) => {
              const daySchedules = getSchedulesForDay(date)
              const dow = date.getDay()
              const isTodayDate = isToday(date)
              const dowLabel = DOW_LABELS[dow]
              const isWeekend = dow === 0 || dow === 6
              const dateColor = isWeekend ? DOW_COLORS[dow] : '#585858'

              return (
                <div
                  key={idx}
                  className="flex border-b border-white/[0.15] last:border-b-0"
                  style={{
                    minHeight: '64px',
                    backgroundColor: isTodayDate ? 'rgba(255,255,255,0.02)' : 'transparent',
                  }}
                >
                  {/* 왼쪽: 날짜 사이드바 (PD/Admin은 클릭 시 의뢰 이동) */}
                  <div
                    role={canCreate ? 'button' : undefined}
                    onClick={canCreate ? () => router.push(`/schedules/new?date=${format(date, 'yyyy-MM-dd')}`) : undefined}
                    className={cn(
                      'shrink-0 w-[58px] flex flex-col items-center justify-center gap-0.5 border-r border-white/[0.15]',
                      canCreate && 'cursor-pointer transition-colors hover:bg-white/[0.04]'
                    )}
                  >
                    <span
                      className="text-[22px] font-semibold tabular-nums leading-none"
                      style={{ color: dateColor }}
                    >
                      {format(date, 'd')}
                    </span>
                    <span
                      className="text-[11px] font-normal"
                      style={{ color: '#3A3A3A' }}
                    >
                      ({dowLabel})
                    </span>
                    {isTodayDate && (
                      <span className="text-[9px] font-bold mt-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'transparent', color: '#383838', border: 'none' }}>
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
                            className="flex items-center gap-1 text-[12px] px-2 py-1 rounded border border-white/[0.15] text-[#5A5A5A] hover:text-[#C0C0C0] transition-colors opacity-70 hover:opacity-100"
                          >
                            <Plus className="w-3 h-3" /> 의뢰
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.12]">
                        {daySchedules.map((schedule) => {
                          const cfg = getCfg(schedule.status)
                          const startDt = parseISO(schedule.broadcast_start)

                          // 특기사항: 장소 + 비고(notes)만 표시
                          const noteParts: string[] = []
                          if (schedule.venue) noteParts.push(schedule.venue)
                          if (schedule.notes?.trim()) noteParts.push(schedule.notes.trim())
                          const note = noteParts.join(' · ')

                          return (
                            <Link key={schedule.id} href={`/schedules/${schedule.id}`}>
                              <div
                                className="flex items-center cursor-pointer border-l-[2px] hover:bg-white/[0.025] transition-colors"
                                style={{ borderLeftColor: cfg.cardBorder }}
                              >
                                <div className="flex-1 min-w-0 px-5 py-4">
                                  <div className="flex items-baseline gap-3 flex-wrap">
                                    {/* 시간 */}
                                    <span
                                      className="text-[13px] tabular-nums font-normal shrink-0 leading-none"
                                      style={{ color: 'var(--text-muted)' }}
                                    >
                                      {format(startDt, 'HH:mm')}
                                    </span>
                                    {/* 프로그램명 */}
                                    <span
                                      className="text-[15px] font-medium leading-none"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {schedule.program_name}
                                    </span>
                                    {/* 특기사항 */}
                                    {note && (
                                      <span
                                        className="text-[13px] leading-none"
                                        style={{ color: 'var(--text-muted)' }}
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
                              </div>
                            </Link>
                          )
                        })}

                        {/* 일정 추가 버튼 (일정 있는 날) */}
                        {canCreate && (
                          <div className="px-4 py-2 flex justify-end">
                            <button
                              onClick={() => router.push(`/schedules/new?date=${format(date, 'yyyy-MM-dd')}`)}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-white/[0.15] text-[#5A5A5A] hover:text-[#C0C0C0] transition-colors opacity-60 hover:opacity-100"
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
              className="p-12 text-center"
            >
              <div className="w-4 h-4 border border-white/[0.12] border-t-white/30 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
            </div>
          ) : (
            <div className="border border-white/[0.15] rounded overflow-hidden">
              {/* DOW header */}
              <div className="grid grid-cols-7 border-b border-white/[0.15]">
                {DOW_LABELS.map((label, i) => (
                  <div
                    key={i}
                    className="text-center text-[11px] font-normal tracking-wider border-r border-white/[0.10] last:border-r-0"
                    style={{
                      color: DOW_COLORS[i],
                      paddingTop: isDesktop ? '8px' : '6px',
                      paddingBottom: isDesktop ? '8px' : '6px',
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* day grid */}
              <div className="grid grid-cols-7">
                {allGridDays.map((day, idx) => {
                  const daySchedules = getSchedulesForDay(day)
                  const isInCurrentMonth = isSameMonth(day, currentDate)
                  const isTodayDate = isToday(day)
                  const dow = day.getDay()
                  const isWeekend = dow === 0 || dow === 6

                  return (
                    <div
                      key={idx}
                      className="overflow-hidden"
                      style={{
                        minHeight: isDesktop ? '108px' : '96px',
                        backgroundColor: isTodayDate ? 'rgba(255,255,255,0.025)' : 'transparent',
                        borderRight: (idx % 7) !== 6 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                        borderBottom: idx < allGridDays.length - 7 ? '1px solid rgba(255,255,255,0.15)' : 'none',
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
                      {/* 날짜 숫자 — 모바일은 칩 텍스트 노출 공간 확보를 위해 70% 수준으로 축소 */}
                      <div
                        className="text-right font-bold tabular-nums"
                        style={{
                          color: isWeekend ? DOW_COLORS[dow] : '#484848',
                          fontSize: isDesktop ? '15px' : '9px',
                          opacity: isInCurrentMonth ? 1 : 0.2,
                          padding: isDesktop ? '8px 10px 4px' : '5px 6px 1px',
                        }}
                      >
                        {format(day, 'd')}
                      </div>

                      {/* 일정 칩 — 모바일은 점/좌측 바/여백을 없애고 글자 색으로만 상태를 구분,
                          2줄(line-clamp-2)까지 노출해 프로그램명이 잘리지 않고 최대한 읽히게 함 */}
                      <div style={{ padding: isDesktop ? '0 6px 8px' : '0 3px 4px', display: 'flex', flexDirection: 'column', gap: '3px', opacity: isInCurrentMonth ? 1 : 0.18 }}>
                        {daySchedules.slice(0, isDesktop ? 5 : 3).map((s) => {
                          const cfg = getCfg(s.status)
                          return (
                            <Link key={s.id} href={`/schedules/${s.id}`}>
                              <div
                                className={cn('cursor-pointer transition-colors hover:bg-white/[0.04]', isDesktop && 'flex items-center gap-1')}
                                style={{
                                  backgroundColor: cfg.cardBg,
                                  borderLeft: isDesktop ? `2px solid ${cfg.cardBorder}` : 'none',
                                  padding: isDesktop ? '3px 6px' : '2px 4px',
                                }}
                              >

                                <span
                                  className={cn('font-medium', isDesktop ? 'truncate' : 'block')}
                                  style={{
                                    color: 'var(--text-primary)',
                                    fontSize: isDesktop ? '12px' : '9px',
                                    lineHeight: isDesktop ? '1.4' : '1.25',
                                    ...(isDesktop
                                      ? {}
                                      : {
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical' as const,
                                          overflow: 'hidden',
                                          wordBreak: 'break-all' as const,
                                        }),
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
            </div>
          )}
        </div>
      )}

      {/* ── 목록 뷰 ── */}
      {viewMode === 'list' && (
        <div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-5 h-5 border border-white/[0.12] border-t-white/30 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
            </div>
          ) : applyScheduleFilter(schedules).length === 0 ? (
            <div className="p-16 text-center">
              <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>이번 달 등록된 일정이 없습니다.</p>
              {canCreate && (
                <Link href="/schedules/new">
                  <button
                    className="mt-4 h-8 px-4 text-xs font-medium rounded border border-white/[0.15] text-[#6A6A6A] hover:text-[#C0C0C0] hover:bg-white/[0.04] transition-colors"
                  >
                    + 첫 의뢰하기
                  </button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {applyScheduleFilter(schedules).map((schedule) => {
                const cfg = getCfg(schedule.status)
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
                      className="group border-l-[2px] transition-colors hover:bg-white/[0.025] overflow-hidden"
                      style={{
                        backgroundColor: 'transparent',
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
                        <div className="w-px h-8 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
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
                          <span className={cn('inline-flex items-center gap-1 text-[11px]', cfg.badge)}>
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
