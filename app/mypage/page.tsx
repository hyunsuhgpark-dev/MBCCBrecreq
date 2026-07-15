import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  User,
  ChevronRight,
  Car,
  Clapperboard,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react'
import type { ScheduleStatus } from '@/lib/types'

/* ── 역할 표시 ───────────────────────────────────────── */
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

/* ── 상태 표시 ───────────────────────────────────────── */
type StatusCfg = { label: string; textCls: string; borderCls: string; icon: React.ElementType }

const statusConfig: Record<ScheduleStatus, StatusCfg> = {
  conflict:  { label: '충돌',    textCls: 'text-amber-300',   borderCls: 'border-l-amber-500',   icon: AlertTriangle },
  pending:   { label: '승인 대기', textCls: 'text-slate-400',   borderCls: 'border-l-slate-500',   icon: Clock },
  assigned:  { label: '배정 대기', textCls: 'text-purple-300',  borderCls: 'border-l-purple-500',  icon: Car },
  confirmed: { label: '확정',    textCls: 'text-emerald-300', borderCls: 'border-l-emerald-500', icon: CheckCircle2 },
  rejected:  { label: '반려',    textCls: 'text-rose-300',    borderCls: 'border-l-rose-500',    icon: XCircle },
}

/* ── 날짜 포맷 ───────────────────────────────────────── */
function fmtShort(dt: string) {
  try {
    return format(parseISO(dt), 'M/d(EEE) HH:mm', { locale: ko })
  } catch {
    return dt
  }
}

function fmtJoined(dt: string) {
  try {
    return format(parseISO(dt), 'yyyy년 M월 가입', { locale: ko })
  } catch {
    return ''
  }
}

/* ── 아바타 이니셜 ─────────────────────────────────── */
function initials(name: string) {
  return name.trim().slice(-2) || name.trim().slice(0, 1) || '?'
}

/* ── 스케줄 행 타입 ───────────────────────────────────── */
type ScheduleRow = {
  id: string
  request_type: string
  status: string
  program_name: string
  venue: string | null
  broadcast_start: string
  broadcast_end: string
  created_at: string
  creator: { full_name: string } | null
}

/* ═══════════════════════════════════════════════════════
   Page
════════════════════════════════════════════════════════ */
export default async function MyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) redirect('/pending-approval')

  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  /* ── 의뢰 목록 조회 ─────────────────────────────────── */
  const isAdmin = profile.role === 'Admin'

  let q = supabase
    .from('schedules')
    .select('id, request_type, status, program_name, venue, broadcast_start, broadcast_end, created_at, creator:profiles!schedules_created_by_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (!isAdmin) {
    q = q.eq('created_by', user.id)
  }

  const { data: rawSchedules } = await q
  const schedules = (rawSchedules as unknown as ScheduleRow[]) ?? []

  /* ── 통계 ────────────────────────────────────────────── */
  const total     = schedules.length
  const pending   = schedules.filter((s) => s.status === 'pending' || s.status === 'assigned').length
  const confirmed = schedules.filter((s) => s.status === 'confirmed').length
  const conflict  = schedules.filter((s) => s.status === 'conflict').length
  const rejected  = schedules.filter((s) => s.status === 'rejected').length

  /* ── 렌더 ─────────────────────────────────────────────── */
  return (
    <AppShell profile={profile} unreadCount={unreadCount ?? 0}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── 프로필 카드 ─────────────────────────────── */}
        <div
          className="rounded-2xl border p-5 flex items-center gap-4"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
        >
          {/* 아바타 */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 select-none"
            style={{ backgroundColor: 'var(--accent)', color: '#fff', opacity: 0.92 }}
          >
            {initials(profile.full_name ?? '?')}
          </div>

          {/* 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-[var(--text-primary)] truncate">
                {profile.full_name}
              </span>
              <span className={cn(
                'text-[11px] px-2 py-0.5 rounded font-semibold tracking-wide shrink-0',
                roleColors[profile.role ?? ''] ?? 'bg-white/10 text-white/60'
              )}>
                {roleLabels[profile.role ?? ''] ?? profile.role}
              </span>
            </div>
            <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {profile.email}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {fmtJoined(profile.created_at)}
            </p>
          </div>
        </div>

        {/* ── 의뢰 통계 ───────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '전체', value: total,     cls: 'text-[var(--text-primary)]' },
            { label: '진행 중', value: pending + conflict,  cls: 'text-amber-300' },
            { label: '확정',   value: confirmed, cls: 'text-emerald-300' },
            { label: '반려',   value: rejected,  cls: 'text-rose-300' },
          ].map(({ label, value, cls }) => (
            <div
              key={label}
              className="rounded-xl border p-3 text-center"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              <p className={cn('text-2xl font-bold tabular-nums', cls)}>{value}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── 의뢰 목록 ───────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              {isAdmin ? '전체 의뢰 목록' : '내 의뢰 목록'}
            </h2>
            {schedules.length >= 100 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>최근 100건</span>
            )}
          </div>

          {schedules.length === 0 ? (
            <div
              className="rounded-2xl border p-10 flex flex-col items-center gap-3 text-center"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              <FileText className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                등록된 의뢰서가 없습니다.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {schedules.map((s) => {
                const st = statusConfig[s.status as ScheduleStatus] ?? statusConfig.pending
                const StatusIcon = st.icon
                const isDispatch = s.request_type === 'dispatch'
                const TEAL = '#2DD4BF'
                const BLUE = '#4A9EE8'
                const typeColor = isDispatch ? TEAL : BLUE

                return (
                  <li key={s.id}>
                    <Link
                      href={`/schedules/${s.id}`}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border border-l-4 px-4 py-3.5 transition-colors',
                        'active:opacity-75 active:scale-[0.98]',
                        st.borderCls
                      )}
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderLeftColor: '' }}
                    >
                      {/* 타입 아이콘 */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: typeColor + '22' }}
                      >
                        {isDispatch
                          ? <Car className="w-4 h-4" style={{ color: TEAL }} />
                          : <Clapperboard className="w-4 h-4" style={{ color: BLUE }} />
                        }
                      </div>

                      {/* 본문 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {s.program_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <StatusIcon className={cn('w-3 h-3 shrink-0', st.textCls)} />
                          <span className={cn('text-xs font-semibold', st.textCls)}>{st.label}</span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            · {fmtShort(s.broadcast_start)}
                          </span>
                          {isAdmin && s.creator && (
                            <span className="text-xs text-[var(--text-secondary)]">
                              · {s.creator.full_name}
                            </span>
                          )}
                        </div>
                        {s.venue && (
                          <p className="text-xs mt-0.5 truncate text-[var(--text-secondary)]">
                            {s.venue}
                          </p>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

      </div>
    </AppShell>
  )
}
