'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Schedule, Profile, ScheduleRecord, Vacation } from '@/lib/types'
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
  ChevronDown,
  Car,
  SlidersHorizontal,
  X,
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
import Link from 'next/link'
import FilterSidebar, {
  type SidebarFilters,
  DEFAULT_SIDEBAR_FILTERS,
  LS_FILTER_KEY,
} from '@/components/calendar/FilterSidebar'

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
    label: '대기중',
    dot: 'bg-slate-600',
    cardBg: 'transparent',
    cardBorder: '#374151',
    cardText: '#4B5563',
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

/** 장비/구분별 밝은(확정) / 어두운(대기) 색상 */
const RESOURCE_COLORS = {
  relayCar: { bright: '#A78BFA', dark: '#4C1D95' },
  studio:   { bright: '#34D399', dark: '#064E3B' },
  eng:      { bright: '#60A5FA', dark: '#1E3A8A' },
  audio:    { bright: '#FBBF24', dark: '#78350F' },
  dispatch: { bright: '#F472B6', dark: '#831843' },
  default:  { bright: '#9CA3AF', dark: '#374151' },
} as const

/** 일정의 왼쪽 색상 바 계산 — 장비×상태 조합 */
function getScheduleBorderColor(schedule: Schedule): string {
  const s = schedule.status
  if (s === 'conflict')  return '#D97706'
  if (s === 'rejected')  return '#BE185D'

  const isLit = s === 'confirmed' || s === 'assigned'
  let pair: { bright: string; dark: string }

  if (schedule.request_type === 'dispatch') pair = RESOURCE_COLORS.dispatch
  else if (schedule.use_relay_car) pair = RESOURCE_COLORS.relayCar
  else if (schedule.use_studio)    pair = RESOURCE_COLORS.studio
  else if (schedule.use_eng)       pair = RESOURCE_COLORS.eng
  else if (schedule.use_audio)     pair = RESOURCE_COLORS.audio
  else pair = RESOURCE_COLORS.default

  return isLit ? pair.bright : pair.dark
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const DOW_COLORS = ['#C07070', '#4A4A4A', '#4A4A4A', '#4A4A4A', '#4A4A4A', '#4A4A4A', '#4A7090']

export default function CalendarView({ profile }: CalendarViewProps) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [currentDate, setCurrentDate] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  // SSR 안전: false/'week'로 시작 → useEffect에서 실제 크기로 업데이트
  const [isDesktop, setIsDesktop] = useState(false)
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'list'>('week')
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false)

  // 사이드바 표시 여부 (모바일에서 토글)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // 사이드바 필터 상태 (localStorage에서 복원, SSR-safe로 기본값 사용)
  const [filters, setFilters] = useState<SidebarFilters>(DEFAULT_SIDEBAR_FILTERS)

  // Google Calendar 기술사무실/송중계 일정
  const [officeSchedules, setOfficeSchedules] = useState<ScheduleRecord[]>([])
  const [officeLoading, setOfficeLoading] = useState(false)
  const [officeConfigured, setOfficeConfigured] = useState<boolean | undefined>(undefined)
  // 구글 캘린더 일정 상세 모달
  const [selectedOfficeRecord, setSelectedOfficeRecord] = useState<ScheduleRecord | null>(null)

  // 사내 휴가 일정
  const [vacations, setVacations] = useState<Vacation[]>([])
  const [, setVacationLoading] = useState(false)
  // 업로드 후 재조회 트리거
  const [vacationVersion, setVacationVersion] = useState(0)

  // 월간 뷰 일정 칩 툴팁/팝오버
  const [hoveredScheduleId, setHoveredScheduleId] = useState<string | null>(null)
  const [tappedScheduleId, setTappedScheduleId] = useState<string | null>(null)

  // 마운트 후 실제 화면 크기 반영
  useEffect(() => {
    const desktop = window.innerWidth >= 768
    setIsDesktop(desktop)
    if (desktop) setViewMode('month')
    if (desktop) setSidebarOpen(true)

    function handleResize() {
      const d = window.innerWidth >= 768
      setIsDesktop(d)
      setViewMode((prev) => (prev === 'week' && d ? 'month' : prev))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 모바일 팝오버 외부 클릭 시 닫기
  useEffect(() => {
    if (!tappedScheduleId) return
    const close = () => setTappedScheduleId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [tappedScheduleId])

  // localStorage에서 필터 상태 복원 (마운트 후 1회)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_FILTER_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SidebarFilters>
        setFilters((prev) => ({ ...prev, ...parsed }))
      }
    } catch {
      // localStorage 접근 불가 시 기본값 유지
    }
  }, [])

  // 필터 변경 시 localStorage 자동 저장
  useEffect(() => {
    try {
      localStorage.setItem(LS_FILTER_KEY, JSON.stringify(filters))
    } catch {
      // ignore
    }
  }, [filters])

  // Google Calendar fetch — officeCalendar 체크 또는 날짜 이동 시 재로드
  useEffect(() => {
    if (!filters.officeCalendar) {
      setOfficeSchedules([])
      return
    }
    let cancelled = false
    setOfficeLoading(true)

    // 현재 뷰의 날짜 범위를 파라미터로 전달
    const rangeStart = viewMode === 'week'
      ? startOfWeek(currentDate, { locale: ko })
      : viewMode === 'month'
      ? startOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), { weekStartsOn: 0 })
      : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const rangeEnd = viewMode === 'week'
      ? endOfWeek(currentDate, { locale: ko })
      : viewMode === 'month'
      ? endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
      : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    const startParam = format(rangeStart, 'yyyy-MM-dd')
    const endParam = format(rangeEnd, 'yyyy-MM-dd')

    fetch(`/api/google-calendar/office?start=${startParam}&end=${endParam}`)
      .then((r) => r.json())
      .then((data: { records?: ScheduleRecord[]; configured?: boolean }) => {
        if (!cancelled) {
          setOfficeSchedules(data.records ?? [])
          setOfficeConfigured(data.configured ?? false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOfficeSchedules([])
          setOfficeConfigured(false)
        }
      })
      .finally(() => {
        if (!cancelled) setOfficeLoading(false)
      })
    return () => { cancelled = true }
  }, [filters.officeCalendar, currentDate, viewMode])

  // 휴가 fetch — vacation 체크 또는 날짜 이동 / 업로드 시 재조회
  useEffect(() => {
    if (!filters.vacation) {
      setVacations([])
      return
    }
    let cancelled = false
    setVacationLoading(true)

    const rangeStart = viewMode === 'week'
      ? startOfWeek(currentDate, { locale: ko })
      : viewMode === 'month'
      ? startOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), { weekStartsOn: 0 })
      : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const rangeEnd = viewMode === 'week'
      ? endOfWeek(currentDate, { locale: ko })
      : viewMode === 'month'
      ? endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
      : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    const startParam = format(rangeStart, 'yyyy-MM-dd')
    const endParam = format(rangeEnd, 'yyyy-MM-dd')

    fetch(`/api/vacations?start=${startParam}&end=${endParam}`)
      .then((r) => r.json())
      .then((data: { vacations?: Vacation[] }) => {
        if (!cancelled) setVacations(data.vacations ?? [])
      })
      .catch(() => { if (!cancelled) setVacations([]) })
      .finally(() => { if (!cancelled) setVacationLoading(false) })

    return () => { cancelled = true }
  }, [filters.vacation, currentDate, viewMode, vacationVersion])

  const weekStart = startOfWeek(currentDate, { locale: ko })
  const weekEnd = endOfWeek(currentDate, { locale: ko })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const monthEnd = endOfMonth(currentDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const allGridDays = viewMode === 'month' ? eachDayOfInterval({ start: gridStart, end: gridEnd }) : []
  // 7일씩 주 단위로 분리
  const weekRows: Date[][] = []
  for (let i = 0; i < allGridDays.length; i += 7) {
    weekRows.push(allGridDays.slice(i, i + 7))
  }

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

  const fetchSchedulesRef = useRef(fetchSchedules)
  useEffect(() => { fetchSchedulesRef.current = fetchSchedules }, [fetchSchedules])

  useEffect(() => {
    const channel = supabase
      .channel('schedules_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => {
        fetchSchedulesRef.current()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // ── 필터 적용 로직 ──
  function applyFilters(list: Schedule[]): Schedule[] {
    return list.filter((s) => {
      const isOwn = s.created_by === profile.id

      // 내 일정만 보기: 내 것이 아니면 숨김
      if (filters.myScheduleOnly && !isOwn) return false

      // 내가 신청한 일정은 필터 무관하게 항상 표시 (본인 확인 보장)
      if (isOwn) return true

      // 배차 (dispatch) 타입 — 다른 사람 것
      if (s.request_type === 'dispatch') return filters.dispatch

      // 녹화 타입 — 장비 플래그 확인
      const hasNoResource = !s.use_relay_car && !s.use_studio && !s.use_eng && !s.use_audio
      if (hasNoResource) return true

      if (s.use_relay_car && filters.relayCar) return true
      if (s.use_studio && filters.studio) return true
      if (s.use_eng && filters.eng) return true
      if (s.use_audio && filters.audio) return true

      return false
    })
  }

  function getSchedulesForDay(date: Date) {
    const daySchedules = schedules.filter((s) => isSameDay(parseISO(s.broadcast_start), date))
    return applyFilters(daySchedules)
  }

  function getOfficeSchedulesForDay(date: Date): ScheduleRecord[] {
    if (!filters.officeCalendar) return []
    const ymd = format(date, 'yyyy-MM-dd')
    return officeSchedules.filter((r) =>
      r.details.entries.some((e) => e.date === ymd)
    )
  }

  /** 휴가자 표시 라벨: 이름만 표시 (반차 텍스트 제거) */
  function vacLabel(v: Vacation): string {
    return v.name
  }

  /** 한 주(7일)에서 보이는 vacation들의 레인(row) 배정 결과 */
  interface VacationLane {
    vacation: Vacation
    startCol: number  // 0~6
    endCol: number    // 0~6
    lane: number
  }

  function getVacationLanes(weekDays: Date[]): VacationLane[] {
    if (!filters.vacation || vacations.length === 0) return []

    const weekStart = format(weekDays[0], 'yyyy-MM-dd')
    const weekEnd   = format(weekDays[6], 'yyyy-MM-dd')

    // 이 주에 걸치는 vacation만 추출
    const inWeek = vacations.filter((v) => v.start_date <= weekEnd && v.end_date >= weekStart)
    if (inWeek.length === 0) return []

    // 각 vacation의 startCol / endCol 계산
    const items = inWeek.map((v) => {
      const effStart = v.start_date < weekStart ? weekStart : v.start_date
      const effEnd   = v.end_date   > weekEnd   ? weekEnd   : v.end_date
      const startCol = weekDays.findIndex((d) => format(d, 'yyyy-MM-dd') === effStart)
      const endCol   = weekDays.findIndex((d) => format(d, 'yyyy-MM-dd') === effEnd)
      return { vacation: v, startCol: Math.max(startCol, 0), endCol: Math.max(endCol, 0) }
    })

    // 표시 우선순위: 종일(0) → 오전반차(1) → 오후반차(2)
    // bottom-up 렌더링이므로 낮은 숫자가 아래, 높은 숫자가 위에 배치됨
    const halfDayPriority = (hd: string | null) => hd === null ? 0 : hd === '오전' ? 1 : 2
    items.sort((a, b) => halfDayPriority(a.vacation.half_day) - halfDayPriority(b.vacation.half_day))

    // Greedy 레인 배정
    const lanes: VacationLane[] = []
    for (const item of items) {
      let lane = 0
      while (lanes.some((l) => l.lane === lane && l.startCol <= item.endCol && l.endCol >= item.startCol)) {
        lane++
      }
      lanes.push({ ...item, lane })
    }
    return lanes
  }

  function getVacationsForDay(date: Date): Vacation[] {
    if (!filters.vacation) return []
    const ymd = format(date, 'yyyy-MM-dd')
    return vacations.filter((v) => v.start_date <= ymd && ymd <= v.end_date)
  }

  function getApprovalRatio(schedule: Schedule) {
    if (!schedule.approvals) return null
    const approved = schedule.approvals.filter((a) => a.status === 'approved').length
    return `${approved}/${schedule.approvals.length}`
  }

  const canCreate = profile.role === 'Producer' || profile.role === 'Admin'
  const isCurrentWeek = isSameWeek(currentDate, new Date(), { locale: ko })
  const displayedSchedules = applyFilters(schedules)

  return (
    <div className={cn('flex', isDesktop && 'overflow-hidden')} style={{ height: isDesktop ? 'calc(100vh - 56px)' : 'auto' }}>

      {/* ── 데스크탑 사이드바 ── */}
      {isDesktop && (
        <FilterSidebar
          filters={filters}
          onChange={setFilters}
          profile={profile}
          officeConfigured={officeConfigured}
          onVacationUploaded={() => setVacationVersion((v) => v + 1)}
        />
      )}

      {/* ── 모바일 사이드바 오버레이 ── */}
      {!isDesktop && sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 bottom-0 z-40" style={{ top: '56px' }}>
            <div className="relative h-full" style={{ backgroundColor: '#0A0A0A', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <FilterSidebar
                filters={filters}
                onChange={setFilters}
                profile={profile}
                officeConfigured={officeConfigured}
                onVacationUploaded={() => setVacationVersion((v) => v + 1)}
              />
            </div>
          </div>
        </>
      )}

      {/* ── 메인 캘린더 영역 ── */}
      <div className={cn('flex-1 min-w-0 px-4 py-5 flex flex-col min-h-0', isDesktop ? 'overflow-hidden' : '', !isDesktop && 'max-w-full')}>

        {/* ── 컨트롤 바 ── */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            {/* 모바일: 필터 토글 버튼 */}
            {!isDesktop && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="w-8 h-8 flex items-center justify-center rounded text-[#4A4A4A] hover:text-[#BEBEBE] hover:bg-white/[0.05] transition-colors"
                title="필터"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setCurrentDate(viewMode === 'week' ? subWeeks(currentDate, 1) : new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded text-[#4A4A4A] hover:text-[#BEBEBE] hover:bg-white/[0.05] transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

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

          <div className="flex items-center gap-1">
            {/* 뷰 전환 드롭다운 */}
            <div className="relative">
              <button
                onClick={() => setViewDropdownOpen((o) => !o)}
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
          </div>
        </div>

        {/* ── 주간 뷰 ── */}
        {viewMode === 'week' && (
          <div className="border border-white/[0.15] rounded overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <div className="w-4 h-4 border border-white/[0.12] border-t-white/30 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
              </div>
            ) : (
              weekDays.map((date, idx) => {
                const daySchedules = getSchedulesForDay(date)
                const officeItems = getOfficeSchedulesForDay(date)
                const dayVacations = getVacationsForDay(date)
                const dow = date.getDay()
                const isTodayDate = isToday(date)
                const dowLabel = DOW_LABELS[dow]
                const isWeekend = dow === 0 || dow === 6
                const dateColor = isWeekend ? DOW_COLORS[dow] : '#585858'
                const allItems = daySchedules.length + officeItems.length + dayVacations.length

                return (
                  <div
                    key={idx}
                    className="flex border-b border-white/[0.15] last:border-b-0"
                    style={{
                      minHeight: '64px',
                      backgroundColor: isTodayDate ? 'rgba(255,255,255,0.02)' : 'transparent',
                    }}
                  >
                    {/* 날짜 사이드바 */}
                    <div
                      role={canCreate ? 'button' : undefined}
                      onClick={canCreate ? () => router.push(`/schedules/new?date=${format(date, 'yyyy-MM-dd')}`) : undefined}
                      className={cn(
                        'shrink-0 w-[58px] flex flex-col items-center justify-center gap-0.5 border-r border-white/[0.15]',
                        canCreate && 'cursor-pointer transition-colors hover:bg-white/[0.04]'
                      )}
                    >
                      <span className="text-[22px] font-semibold tabular-nums leading-none" style={{ color: dateColor }}>
                        {format(date, 'd')}
                      </span>
                      <span className="text-[11px] font-normal" style={{ color: '#3A3A3A' }}>
                        ({dowLabel})
                      </span>
                      {isTodayDate && (
                        <span className="text-[9px] font-bold mt-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'transparent', color: '#383838', border: 'none' }}>
                          TODAY
                        </span>
                      )}
                    </div>

                    {/* 일정 목록 */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      {/* 상단: 일반 + 구글 일정 */}
                      <div className="flex-1 flex flex-col justify-center">
                        {daySchedules.length === 0 && officeItems.length === 0 ? (
                          dayVacations.length === 0 && (
                            <div className="px-5 py-6">
                              <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>일정 없음</span>
                            </div>
                          )
                        ) : (
                          <div className="divide-y divide-white/[0.12]">
                            {/* 일반 일정 */}
                            {daySchedules.map((schedule) => {
                              const cfg = getCfg(schedule.status)
                              const startDt = parseISO(schedule.broadcast_start)
                              const noteParts: string[] = []
                              if (schedule.venue) noteParts.push(schedule.venue)
                              if (schedule.notes?.trim()) noteParts.push(schedule.notes.trim())
                              const note = noteParts.join(' · ')

                              return (
                                <Link key={schedule.id} href={`/schedules/${schedule.id}`}>
                                  <div
                                    className="flex items-center cursor-pointer border-l-[2px] hover:bg-white/[0.025] transition-colors"
                                    style={{ borderLeftColor: getScheduleBorderColor(schedule) }}
                                  >
                                    <div className="flex-1 min-w-0 px-5 py-4">
                                      <div className="flex items-baseline gap-3 flex-wrap">
                                        <span className="text-[13px] tabular-nums font-normal shrink-0 leading-none" style={{ color: 'var(--text-muted)' }}>
                                          {format(startDt, 'HH:mm')}
                                        </span>
                                        <span className="text-[15px] font-medium leading-none" style={{ color: cfg.cardText }}>
                                          {schedule.program_name}
                                        </span>
                                        {schedule.status === 'pending' && (
                                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-slate-600 text-slate-400">
                                            대기중
                                          </span>
                                        )}
                                        {note && (
                                          <span className="text-[13px] leading-none" style={{ color: 'var(--text-muted)' }}>
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
                                  </div>
                                </Link>
                              )
                            })}

                            {/* 기술사무실/송중계 구글 캘린더 일정 */}
                            {officeItems.map((record) => {
                              const entry = record.details.entries.find((e) => e.date === format(date, 'yyyy-MM-dd'))
                              return (
                                <div
                                  key={record.id}
                                  className="flex items-center border-l-[2px] cursor-pointer hover:bg-white/[0.025] transition-colors"
                                  style={{ borderLeftColor: 'rgba(255,255,255,0.55)' }}
                                  onClick={() => setSelectedOfficeRecord(record)}
                                >
                                  <div className="flex-1 min-w-0 px-5 py-3">
                                    <div className="flex items-baseline gap-3 flex-wrap">
                                      {entry?.time && (
                                        <span className="text-[13px] tabular-nums font-normal shrink-0 leading-none" style={{ color: '#9CA3AF' }}>
                                          {entry.time}
                                        </span>
                                      )}
                                      <span className="text-[14px] font-normal leading-none" style={{ color: 'var(--text-primary)' }}>
                                        {record.details.title}
                                      </span>
                                      {entry?.place && (
                                        <span className="text-[12px] leading-none" style={{ color: '#9CA3AF' }}>
                                          {entry.place}
                                        </span>
                                      )}
                                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(75,85,99,0.2)', color: '#9CA3AF' }}>
                                        사무실
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* 하단 고정: 휴가 — 바 하나에 이름 가로 나열 */}
                      {dayVacations.length > 0 && (
                        <div
                          className="flex items-center gap-2 flex-wrap"
                          style={{
                            backgroundColor: '#131719',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            padding: '3px 8px',
                          }}
                        >
                          {dayVacations.map((v, i) => (
                            <span key={v.id} className="text-[11px] font-normal leading-none whitespace-nowrap" style={{ color: '#7f8c93' }}>
                              {v.half_day ? `${v.name} ${v.half_day}` : v.name}
                              {i < dayVacations.length - 1 && <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>·</span>}
                            </span>
                          ))}
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
          <div className="flex flex-col flex-1 min-h-0">
            {loading ? (
              <div className="p-12 text-center">
                <div className="w-4 h-4 border border-white/[0.12] border-t-white/30 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
              </div>
            ) : (
              <div className="border border-white/[0.15] rounded overflow-hidden flex flex-col flex-1 min-h-0">
                {/* DOW header */}
                <div className="grid grid-cols-7 border-b border-white/[0.15] shrink-0">
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

                {/* day grid — week-row 단위 relative 컨테이너 */}
                <div className="flex flex-col flex-1 min-h-0">
                {weekRows.map((wDays, wIdx) => {
                  const lanes = getVacationLanes(wDays)
                  const laneCount = lanes.length > 0 ? Math.max(...lanes.map(l => l.lane)) + 1 : 0
                  const vacBarH = 13   // 바 슬롯 높이 (바 12px + 간격 1px)
                  const vacZoneH = laneCount * vacBarH + (laneCount > 0 ? 2 : 0)

                  return (
                    <div key={wIdx} className="relative flex-1 min-h-0">
                      <div className="grid grid-cols-7 h-full">
                        {wDays.map((day, idx) => {
                          const globalIdx = wIdx * 7 + idx
                          const daySchedules = getSchedulesForDay(day)
                          const officeItems = getOfficeSchedulesForDay(day)
                          const isInCurrentMonth = isSameMonth(day, currentDate)
                          const isTodayDate = isToday(day)
                          const dow = day.getDay()
                          const isWeekend = dow === 0 || dow === 6

                          return (
                            <div
                              key={globalIdx}
                              className="overflow-visible flex flex-col"
                              style={{
                                minHeight: isDesktop ? '100px' : '80px',
                                backgroundColor: isTodayDate ? 'rgba(255,255,255,0.025)' : 'transparent',
                                borderRight: idx !== 6 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                                borderBottom: wIdx < weekRows.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                                boxShadow: isTodayDate ? 'inset 0 0 0 1px rgba(235, 222, 175, 0.80)' : 'none',
                                cursor: canCreate && isInCurrentMonth ? 'pointer' : 'default',
                                paddingBottom: vacZoneH,
                              }}
                              onClick={() => {
                                if (canCreate && isInCurrentMonth) {
                                  router.push(`/schedules/new?date=${format(day, 'yyyy-MM-dd')}`)
                                }
                              }}
                            >
                              {/* 날짜 숫자 */}
                              <div
                                className="text-[11px] tabular-nums font-normal shrink-0"
                                style={{
                                  padding: isDesktop ? '6px 8px 3px' : '4px 5px 2px',
                                  opacity: isInCurrentMonth ? 1 : 0.22,
                                  color: isTodayDate
                                    ? 'var(--text-primary)'
                                    : isWeekend
                                    ? (dow === 0 ? '#C07070' : '#4A7090')
                                    : '#3A3A3A',
                                }}
                              >
                                {format(day, 'd')}
                              </div>

                              {/* 방송 일정 칩 (상단 영역) */}
                              <div className="flex-1 min-h-0" style={{ padding: isDesktop ? '0 6px 2px' : '0 3px 2px', display: 'flex', flexDirection: 'column', gap: '2px', opacity: isInCurrentMonth ? 1 : 0.18, overflow: 'visible' }}>
                                {/* 일반 일정 */}
                                {daySchedules.slice(0, isDesktop ? 4 : 3).map((s) => {
                                  const cfg = getCfg(s.status)
                                  const startDt = parseISO(s.broadcast_start)
                                  const endDt = parseISO(s.broadcast_end)
                                  const timeLabel = `${format(startDt, 'HH:mm')}~${format(endDt, 'HH:mm')}`
                                  const isHovered = hoveredScheduleId === s.id
                                  const isTapped = tappedScheduleId === s.id
                                  // 마지막 두 열(토/일)은 툴팁을 왼쪽으로 표시
                                  const isRightEdge = idx >= 5

                                  return (
                                    <div
                                      key={s.id}
                                      className="relative"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div
                                        className={cn('cursor-pointer transition-colors hover:bg-white/[0.04]', isDesktop && 'flex items-center gap-1')}
                                        style={{
                                          backgroundColor: cfg.cardBg,
                                          borderLeft: isDesktop ? `2px solid ${getScheduleBorderColor(s)}` : 'none',
                                          padding: isDesktop ? '2px 5px' : '2px 4px',
                                        }}
                                        onMouseEnter={() => isDesktop && setHoveredScheduleId(s.id)}
                                        onMouseLeave={() => isDesktop && setHoveredScheduleId(null)}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (isDesktop) {
                                            router.push(`/schedules/${s.id}`)
                                          } else {
                                            setTappedScheduleId(isTapped ? null : s.id)
                                          }
                                        }}
                                      >
                                        <span
                                          className={cn('font-medium', isDesktop ? 'truncate' : 'block')}
                                          style={{
                                            color: cfg.cardText,
                                            fontSize: isDesktop ? '11px' : '9px',
                                            lineHeight: isDesktop ? '1.35' : '1.25',
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

                                      {/* PC 호버 툴팁 */}
                                      {isDesktop && isHovered && (
                                        <div
                                          className="absolute z-50 rounded shadow-xl pointer-events-none"
                                          style={{
                                            top: 0,
                                            ...(isRightEdge
                                              ? { right: '100%', marginRight: 4 }
                                              : { left: '100%', marginLeft: 4 }),
                                            backgroundColor: '#1A1A1A',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            minWidth: 160,
                                            padding: '6px 10px',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                            {s.program_name}
                                          </div>
                                          <div className="text-[11px] tabular-nums" style={{ color: '#9CA3AF' }}>
                                            {timeLabel}
                                          </div>
                                          {s.venue && (
                                            <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                                              {s.venue}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* 모바일 탭 팝오버 */}
                                      {!isDesktop && isTapped && (
                                        <div
                                          className="absolute z-50 rounded shadow-xl"
                                          style={{
                                            top: '100%',
                                            left: 0,
                                            marginTop: 2,
                                            backgroundColor: '#1A1A1A',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            minWidth: 160,
                                            padding: '8px 12px',
                                            whiteSpace: 'nowrap',
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            router.push(`/schedules/${s.id}`)
                                          }}
                                        >
                                          <div className="text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                                            {s.program_name}
                                          </div>
                                          <div className="text-[11px] tabular-nums" style={{ color: '#9CA3AF' }}>
                                            {timeLabel}
                                          </div>
                                          {s.venue && (
                                            <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                                              {s.venue}
                                            </div>
                                          )}
                                          <div className="text-[10px] mt-2" style={{ color: '#6B7280' }}>
                                            탭하여 상세보기 →
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}

                                {/* 기술사무실 구글 캘린더 칩 */}
                                {isDesktop && officeItems.slice(0, 1).map((r) => {
                                  const entry = r.details.entries.find((e) => e.date === format(day, 'yyyy-MM-dd'))
                                  const isOfficeHovered = hoveredScheduleId === `office-${r.id}`
                                  const isRightEdgeOffice = idx >= 5
                                  return (
                                    <div
                                      key={r.id}
                                      className="relative"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div
                                        className="flex items-center gap-1 cursor-pointer hover:bg-white/[0.04] transition-colors"
                                        style={{ borderLeft: '2px solid rgba(255,255,255,0.55)', padding: '2px 5px' }}
                                        onMouseEnter={() => setHoveredScheduleId(`office-${r.id}`)}
                                        onMouseLeave={() => setHoveredScheduleId(null)}
                                        onClick={(e) => { e.stopPropagation(); setSelectedOfficeRecord(r) }}
                                      >
                                        <span className="truncate text-[11px]" style={{ color: 'var(--text-primary)', fontSize: '11px' }}>
                                          {r.details.title}
                                        </span>
                                      </div>

                                      {/* 호버 툴팁 */}
                                      {isOfficeHovered && (
                                        <div
                                          className="absolute z-50 rounded shadow-xl pointer-events-none"
                                          style={{
                                            top: 0,
                                            ...(isRightEdgeOffice
                                              ? { right: '100%', marginRight: 4 }
                                              : { left: '100%', marginLeft: 4 }),
                                            backgroundColor: '#1A1A1A',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            minWidth: 160,
                                            padding: '6px 10px',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                            {r.details.title}
                                          </div>
                                          {entry?.time && (
                                            <div className="text-[11px] tabular-nums" style={{ color: '#9CA3AF' }}>
                                              {entry.time}
                                            </div>
                                          )}
                                          {entry?.place && (
                                            <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                                              {entry.place}
                                            </div>
                                          )}
                                          <div className="text-[10px] mt-1.5" style={{ color: '#6B7280' }}>
                                            클릭하여 상세보기
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}

                                {/* 더보기 */}
                                {(() => {
                                  const limit = isDesktop ? 4 : 3
                                  const over = daySchedules.length + (isDesktop ? officeItems.length : 0) - limit
                                  if (over <= 0) return null
                                  return (
                                    <div style={{ color: 'var(--text-muted)', fontSize: isDesktop ? '11px' : '9px', padding: isDesktop ? '1px 7px' : '0 4px' }}>
                                      +{over}건 더
                                    </div>
                                  )
                                })()}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* 휴가 멀티데이 바 오버레이 */}
                      {vacZoneH > 0 && (
                        <div
                          className="absolute inset-x-0 bottom-0 pointer-events-none"
                          style={{ height: vacZoneH }}
                        >
                          {lanes.map((lane, li) => {
                            const hd = lane.vacation.half_day
                            // 반차: 해당 셀의 왼쪽/오른쪽 절반만 차지
                            const leftPct = hd === '오후'
                              ? ((lane.startCol + 0.5) / 7) * 100
                              : (lane.startCol / 7) * 100
                            const widthPct = hd
                              ? (0.5 / 7) * 100
                              : ((lane.endCol - lane.startCol + 1) / 7) * 100

                            return (
                              <div
                                key={li}
                                style={{
                                  position: 'absolute',
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                  top: (laneCount - 1 - lane.lane) * vacBarH + 1,
                                  height: vacBarH - 1,
                                  borderRadius: 2,
                                  backgroundColor: '#131719',
                                  color: '#7f8c93',
                                  fontSize: 10,
                                  paddingLeft: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {vacLabel(lane.vacation)}
                              </div>
                            )
                          })}
                        </div>
                      )}
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
            ) : displayedSchedules.length === 0 && officeSchedules.length === 0 && vacations.length === 0 ? (
              <div className="p-16 text-center">
                <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>이번 달 등록된 일정이 없습니다.</p>
                {canCreate && (
                  <Link href="/schedules/new">
                    <button className="mt-4 h-8 px-4 text-xs font-medium rounded border border-white/[0.15] text-[#6A6A6A] hover:text-[#C0C0C0] hover:bg-white/[0.04] transition-colors">
                      + 첫 의뢰하기
                    </button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {displayedSchedules.map((schedule) => {
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
                        style={{ backgroundColor: 'transparent', borderLeftColor: getScheduleBorderColor(schedule) }}
                      >
                        <div className="p-4 flex items-center gap-4">
                          <div className="shrink-0 w-14 text-center">
                            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                              {format(startDt, 'M/d', { locale: ko })}({format(startDt, 'EEE', { locale: ko })})
                            </div>
                            <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: cfg.cardText }}>
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
                              <h3 className="font-bold truncate text-[14px]" style={{ color: cfg.cardText }}>
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
                            <span className={cn('inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border', cfg.badge,
                              schedule.status === 'pending'
                                ? 'border-slate-600 bg-slate-800/50'
                                : 'border-transparent'
                            )}>
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

                {/* 구글 캘린더 기술사무실 일정 (목록) */}
                {filters.officeCalendar && officeLoading && (
                  <div className="p-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    사무실 일정 불러오는 중...
                  </div>
                )}
                {filters.officeCalendar && !officeLoading && officeSchedules.map((record) => (
                  record.details.entries.map((entry) => (
                    <div
                      key={`${record.id}-${entry.date}`}
                      className="border-l-[2px] overflow-hidden cursor-pointer hover:bg-white/[0.025] transition-colors"
                      style={{ borderLeftColor: 'rgba(255,255,255,0.55)', backgroundColor: 'transparent' }}
                      onClick={() => setSelectedOfficeRecord(record)}
                    >
                      <div className="p-4 flex items-center gap-4">
                        <div className="shrink-0 w-[64px] text-center">
                          <div className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                            {format(parseISO(entry.date), 'M/d', { locale: ko })}({format(parseISO(entry.date), 'EEE', { locale: ko })})
                          </div>
                          {entry.time && (
                            <div className="text-[13px] font-medium tabular-nums mt-0.5" style={{ color: '#9CA3AF' }}>
                              {entry.time}
                            </div>
                          )}
                        </div>
                        <div className="w-px h-8 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.10)' }} />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>
                            {record.details.title}
                          </h3>
                          {entry.place && (
                            <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                              {entry.place}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'rgba(75,85,99,0.2)', color: '#9CA3AF' }}>
                          사무실
                        </span>
                      </div>
                    </div>
                  ))
                ))}

                {/* 휴가 목록 — 퍼플 톤 바 스타일 */}
                {filters.vacation && vacations.map((v) => (
                  <div
                    key={v.id}
                    className="border-l-[2px] overflow-hidden transition-colors"
                    style={{ borderLeftColor: 'rgba(45, 15, 120, 0.7)', backgroundColor: 'transparent' }}
                  >
                    <div className="px-4 py-2 flex items-center gap-4">
                      <div className="shrink-0 w-[64px] text-center">
                        <div className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {format(parseISO(v.start_date), 'M/d', { locale: ko })}({format(parseISO(v.start_date), 'EEE', { locale: ko })})
                        </div>
                        {v.start_date !== v.end_date && (
                          <div className="text-[10px] tabular-nums mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            ~{format(parseISO(v.end_date), 'M/d')}
                          </div>
                        )}
                      </div>
                      <div className="w-px h-5 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-normal truncate text-[13px]" style={{ color: '#ffffff' }}>
                          {vacLabel(v)}
                        </h3>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── 구글 캘린더 일정 상세 모달 ── */}
      {selectedOfficeRecord && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 z-50 bg-black/60"
            onClick={() => setSelectedOfficeRecord(null)}
          />
          {/* 모달 박스 */}
          <div
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] max-w-[90vw] rounded-lg shadow-2xl"
            style={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            {/* 헤더 — pl: 14px로 제목 텍스트가 25px(=14+3+8)에서 시작 */}
            <div className="flex items-start justify-between gap-3 pr-5" style={{ paddingTop: '13px', paddingBottom: '7px', paddingLeft: '14px' }}>
              <div className="flex items-center gap-2">
                <span
                  className="w-[3px] h-[18px] rounded-full shrink-0"
                  style={{ backgroundColor: 'rgba(255,255,255,0.55)' }}
                />
                <h2 className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {selectedOfficeRecord.details.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedOfficeRecord(null)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 구분선 */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '0 20px' }} />

            {/* 날짜·시간 — 위아래 좌우 가운데 정렬, 넉넉한 여백 */}
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{ padding: '28px 20px' }}
            >
              {selectedOfficeRecord.details.entries.map((entry, i) => (
                <div key={i} className="flex flex-col items-center" style={{ gap: '8px' }}>
                  <div className="flex items-center justify-center gap-2 text-[13px]">
                    <span style={{ color: '#9CA3AF' }}>{entry.date}</span>
                    {entry.time && (
                      <>
                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                        <span style={{ color: 'var(--text-primary)' }}>{entry.time}</span>
                      </>
                    )}
                  </div>
                  {entry.place && (
                    <div className="flex items-center justify-center gap-1.5 text-[12px]" style={{ color: '#9CA3AF' }}>
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>{entry.place}</span>
                    </div>
                  )}
                  {entry.note && (
                    <div className="text-[12px] leading-relaxed" style={{ color: '#9CA3AF' }}>
                      {entry.note}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 구분선 */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 20px' }} />

            {/* 출처 — 제목 텍스트 시작열(25px)에 맞춰 왼쪽 정렬 */}
            <div style={{ paddingTop: '4px', paddingBottom: '4px', paddingLeft: '25px' }}>
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {selectedOfficeRecord.memo}
              </span>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
