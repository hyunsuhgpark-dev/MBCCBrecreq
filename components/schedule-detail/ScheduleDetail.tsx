'use client'

import { useRef, useState } from 'react'
import { useNavRouter } from '@/lib/use-nav-router'
import { useReactToPrint } from 'react-to-print'
import type { Schedule, Profile } from '@/lib/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Printer, Edit, Trash2, AlertTriangle, Clock, CheckCircle2, XCircle, Loader2, Car } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { isDispatchRequest } from '@/lib/roles'
import Link from 'next/link'
import ActionBar from '@/components/action-bar/ActionBar'
import PdCallButton from '@/components/schedule-detail/PdCallButton'

interface ScheduleDetailProps {
  schedule: Schedule
  profile: Profile
}

const statusConfig = {
  conflict:  { label: '충돌',     color: 'text-amber-300 bg-amber-950/40 border-amber-800',   icon: AlertTriangle },
  pending:   { label: '승인 대기', color: 'text-slate-300 bg-white/5 border-white/10',        icon: Clock },
  assigned:  { label: '배정 대기', color: 'text-purple-300 bg-purple-950/35 border-purple-800', icon: Car },
  confirmed: { label: '확정',     color: 'text-emerald-300 bg-emerald-950/35 border-emerald-800', icon: CheckCircle2 },
  rejected:  { label: '반려',     color: 'text-rose-300 bg-rose-950/35 border-rose-800',      icon: XCircle },
}

function fmt(dt: string | null | undefined, withDay = true) {
  if (!dt) return '-'
  return format(parseISO(dt), withDay ? 'M월 d일(EEE) HH시 mm분' : 'HH시 mm분', { locale: ko })
}

function fmtRange(start: string, end: string) {
  const s = parseISO(start)
  const e = parseISO(end)
  const sameDay = format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')
  if (sameDay) {
    return `${fmt(start)} ~ ${fmt(end, false)}`
  }
  return `${fmt(start)} ~ ${fmt(end)}`
}

const resourceChips = [
  { label: '중계차', key: 'use_relay_car' as const, color: '#FCD34D', bg: 'rgba(217,119,6,0.18)', border: 'rgba(217,119,6,0.45)' },
  { label: '스튜디오', key: 'use_studio' as const, color: '#93C5FD', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)' },
  { label: 'ENG', key: 'use_eng' as const, color: '#6EE7B7', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' },
  { label: 'AUDIO', key: 'use_audio' as const, color: '#D8B4FE', bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.4)' },
]

export default function ScheduleDetail({ schedule, profile }: ScheduleDetailProps) {
  const router = useNavRouter()
  const printRef = useRef<HTMLDivElement>(null)
  const [, setRefreshKey] = useState(0)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [conflictCleared, setConflictCleared] = useState(false)

  const isDispatch = isDispatchRequest(schedule)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: isDispatch ? `배차신청서_${schedule.program_name}` : `녹화의뢰서_${schedule.program_name}`,
  })

  const statusInfo = schedule.has_conflict && !conflictCleared
    ? { label: '겹침', color: 'text-amber-300 bg-amber-950/40 border-amber-800', icon: AlertTriangle }
    : statusConfig[schedule.status] ?? statusConfig.confirmed
  const StatusIcon = statusInfo.icon

  const canEdit =
    profile.role === 'Admin' || schedule.created_by === profile.id

  const canDelete =
    profile.role === 'Admin' || schedule.created_by === profile.id

  const requestedResources = resourceChips.filter((r) => schedule[r.key])

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? '삭제 실패')
      toast.success('일정이 삭제되었습니다.')
      router.push('/calendar')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류가 발생했습니다')
      setDeleting(false)
    }
  }

  /* ─── 스타일 상수 (폼과 동일 계열) ─── */
  const border = 'border border-[var(--border-default)]'
  const labelCls = cn(
    border,
    'schedule-detail-cell bg-[var(--bg-elevated)] font-bold text-[var(--text-primary)] text-sm text-center tracking-wider px-3 flex items-center justify-center select-none'
  )
  const valueCls = cn(
    border,
    'schedule-detail-cell px-3 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)]'
  )

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-5rem)] sm:min-h-[calc(100dvh-3.5rem)] w-full justify-center px-4 py-8 pb-28 sm:pb-10">
      <div className="w-full max-w-4xl my-auto">

      {/* ── 상단 상태 바 ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3 no-print">
        <div className="flex items-center gap-2">
          {schedule.has_conflict && !conflictCleared && (
            <Badge className={cn('border text-sm font-semibold px-3 py-1.5', statusInfo.color)}>
              <StatusIcon className="w-6 h-6 mr-1.5" />
              {statusInfo.label}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handlePrint()}
            className="h-11 w-11 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] touch-manipulation"
            aria-label="PDF 출력"
          >
            <Printer className="w-5 h-5" />
          </Button>

          {canEdit && (
            <Link href={`/schedules/${schedule.id}/edit`}>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] touch-manipulation"
                aria-label="수정"
              >
                <Edit className="w-5 h-5" />
              </Button>
            </Link>
          )}

          {canDelete && (
            <Button
              size="icon"
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="h-11 w-11 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-rose-400 hover:border-rose-800/50 touch-manipulation"
              aria-label="삭제"
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-300">
              <Trash2 className="w-5 h-5" />
              일정 삭제
            </DialogTitle>
            <DialogDescription className="pt-1" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold text-[var(--text-primary)]">"{schedule.program_name}"</span> 일정을
              삭제하면 복구할 수 없습니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
              className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            >
              취소
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-2"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              삭제 확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 인쇄 영역 ── */}
      <div ref={printRef}>
        <div className="rounded-2xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_10px_40px_rgba(0,0,0,0.35)] print:shadow-none print:rounded-none">

          {/* 제목 헤더 */}
          <div className="relative py-5 text-center overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <div className="absolute inset-0 opacity-[0.08] bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.22)_0px,rgba(255,255,255,0.22)_1px,transparent_1px,transparent_8px)]" />
            <h1 className={cn('relative text-2xl font-bold tracking-[0.5em]', isDispatch && 'text-purple-200')} style={{ color: isDispatch ? undefined : 'var(--text-primary)' }}>
              {isDispatch ? '배 차 의 뢰 서' : '녹 화 의 뢰 서'}
            </h1>
            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: 'var(--border-default)' }} />
          </div>

          {/* 본문 */}
          <div>

            {/* 분류 — 신청 자원을 표 행으로 표시 (본문 text-sm 대비 1.5배) */}
            {!isDispatch && (
              <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
                <div className={labelCls}>분 류</div>
                <div className={cn(valueCls, 'flex flex-wrap items-center gap-x-5 gap-y-1')}>
                  {requestedResources.length > 0 ? (
                    requestedResources.map(({ label, key, color }) => (
                      <span
                        key={key}
                        className="text-sm font-semibold tracking-wide"
                        style={{ color }}
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </div>
              </div>
            )}

            {/* 프로그램명 + 담당PD */}
            <div className="grid grid-cols-[112px_1fr_72px_152px] border-b border-[var(--border-default)]">
              <div className={labelCls}>프 로 그 램 명</div>
              <div className={cn(valueCls, 'font-semibold flex items-center gap-2')}>
                {schedule.program_name}
                {schedule.is_live && (
                  <span className="flex items-center gap-1 bg-rose-600 text-white px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0">
                    <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <div className={cn(labelCls, 'text-xs')}>담 당 P D</div>
              <div className={cn(valueCls, 'border-r-0')}>
                <PdCallButton name={schedule.responsible_pd} />
              </div>
            </div>

            {/* 제작/이동 일시 */}
            <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
              <div className={labelCls}>{isDispatch ? '이동 일시' : '제 작 일 시'}</div>
              <div className={valueCls}>{fmtRange(schedule.broadcast_start, schedule.broadcast_end)}</div>
            </div>

            {!isDispatch && (
            <>
            {/* 방송일시 — 생방송이면 숨김 */}
            {!schedule.is_live && (
              <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
                <div className={labelCls}>방 송 일 시</div>
                <div className={valueCls}>
                  {schedule.broadcast_at
                    ? fmt(schedule.broadcast_at)
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </div>
              </div>
            )}

            {/* 녹화내용 */}
            <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
              <div className={labelCls}>녹 화 내 용</div>
              <div className={cn(valueCls, 'min-h-[80px] whitespace-pre-wrap')}>
                {schedule.record_content || <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </div>
            </div>

            {/* 녹화장소 */}
            <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
              <div className={labelCls}>녹 화 장 소</div>
              <div className={valueCls}>
                {schedule.venue}
                {schedule.location && (
                  <span className="ml-3 text-xs text-[var(--text-secondary)]">자원ID: {schedule.location}</span>
                )}
              </div>
            </div>
            </>
            )}

            {isDispatch && (
            <>
            <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
              <div className={labelCls}>목 적 지</div>
              <div className={valueCls}>{schedule.venue}</div>
            </div>
            <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
              <div className={labelCls}>탑승 인원</div>
              <div className={valueCls}>{schedule.passenger_count ?? '-'}명</div>
            </div>
            <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
              <div className={labelCls}>기술국 알림</div>
              <div className={valueCls}>{schedule.notify_tech ? '예 (중계차 일정으로 표시)' : '아니오'}</div>
            </div>
            </>
            )}

            {/* 특기사항 */}
            <div className="grid grid-cols-[112px_1fr]">
              <div className={cn(labelCls, 'items-start')}>특 기 사 항</div>
              <div className={cn(valueCls, 'min-h-[100px] whitespace-pre-wrap border-b-0 border-r-0')}>
                {schedule.notes || <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 배정 정보 (배차 확정 후) */}
        {isDispatch && schedule.assignment_vehicles && schedule.assignment_vehicles.length > 0 && (
          <div className="mt-4 border rounded-xl p-4 shadow-sm print:mt-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <h3 className="font-bold text-sm mb-3 tracking-wide text-purple-200">차량 배정 정보</h3>
            <div className="space-y-3">
              {schedule.assignment_vehicles.map((v, i) => (
                <div key={i} className="rounded-xl border p-3" style={{ borderColor: 'var(--border-default)' }}>
                  <p className="font-semibold text-sm text-[var(--text-primary)]">차량 {i + 1}: {v.driver_name}</p>
                  {v.vehicle_info && <p className="text-sm mt-1 text-[var(--text-primary)]">차량: {v.vehicle_info}</p>}
                  {v.contact && <p className="text-sm mt-0.5 text-[var(--text-primary)]">연락처: {v.contact}</p>}
                </div>
              ))}
              {schedule.assignment_director_accompany && (
                <p className="text-sm font-medium text-purple-200">영상감독 동행</p>
              )}
              {schedule.assignment_notes && (
                <p className="text-sm whitespace-pre-wrap text-[var(--text-primary)]">메모: {schedule.assignment_notes}</p>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 액션 바 */}
      <div className="mt-5 no-print">
        <ActionBar
          schedule={schedule}
          profile={profile}
          onUpdate={() => {
            setConflictCleared(true)
            setRefreshKey((k) => k + 1)
            router.refresh()
          }}
        />
      </div>
      </div>
    </div>
  )
}
