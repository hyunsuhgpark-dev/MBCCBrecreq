'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

const partLabels: Record<string, string> = {
  office: '기술국',
  sub_control: '영상국',
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

const checkboxItems = [
  { label: '중 계 차', key: 'use_relay_car' as const },
  { label: '스튜디오',  key: 'use_studio'   as const },
  { label: 'E  N  G',  key: 'use_eng'       as const },
  { label: 'A U D I O', key: 'use_audio'    as const },
]

export default function ScheduleDetail({ schedule, profile }: ScheduleDetailProps) {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)
  const [, setRefreshKey] = useState(0)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isDispatch = isDispatchRequest(schedule)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: isDispatch ? `배차의뢰서_${schedule.program_name}` : `녹화의뢰서_${schedule.program_name}`,
  })

  const statusInfo = statusConfig[schedule.status]
  const StatusIcon = statusInfo.icon

  const officeApproval     = schedule.approvals?.find((a) => a.part === 'office')
  const subControlApproval = schedule.approvals?.find((a) => a.part === 'sub_control')
  const approvedCount      = schedule.approvals?.filter((a) => a.status === 'approved').length ?? 0
  const totalApprovals     = schedule.approvals?.length ?? 2

  // assigned 상태에서는 배정 진행 중이므로 PD의 수정/삭제를 막음 (Admin은 비상 처리 허용)
  const isAssigned = schedule.status === 'assigned'
  const canEdit =
    profile.role === 'Admin' ||
    (schedule.created_by === profile.id && !isAssigned)

  const canDelete =
    profile.role === 'Admin' ||
    (schedule.created_by === profile.id && !isAssigned)

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
    'bg-[var(--bg-elevated)] font-bold text-[var(--text-primary)] text-sm text-center tracking-wider px-3 py-2 flex items-center justify-center select-none'
  )
  const valueCls = cn(
    border,
    'px-3 py-2 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)]'
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      {/* ── 상단 상태 바 ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3 no-print">
        <div className="flex items-center gap-2">
          <Badge className={cn('border text-xs font-medium', statusInfo.color)}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusInfo.label}
          </Badge>
          {schedule.status === 'pending' && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>승인 {approvedCount}/{totalApprovals}</span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrint()}
            className="gap-1.5 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">PDF 출력</span>
          </Button>

          {canEdit && (
            <Link href={`/schedules/${schedule.id}/edit`}>
              <Button
                size="sm"
                className="gap-1.5 text-white shadow-sm"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                <Edit className="w-4 h-4" />
                <span className="hidden sm:inline">수정</span>
              </Button>
            </Link>
          )}

          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="gap-1.5 border-rose-900/40 text-rose-300 hover:bg-rose-950/20 hover:border-rose-800"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">삭제</span>
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

          {!isDispatch && (
          <>
          {/* 장비 체크박스(세로) + 오류 신고 */}
          <div className="grid grid-cols-[70%_30%] border-b border-[var(--border-default)]">
            <div className="border-r border-[var(--border-default)]">
              {checkboxItems.map(({ label, key }, i) => (
                <div
                  key={key}
                  className={cn('grid grid-cols-[112px_1fr] items-center', i > 0 && 'border-t border-[var(--border-default)]')}
                >
                  <div className={cn(labelCls, 'border-0 border-r border-[var(--border-default)] h-full text-xs')}>
                    {label}
                  </div>
                  <div className="px-4 py-2.5 text-lg">
                    {schedule[key] ? (
                      <span className="font-extrabold" style={{ color: 'var(--text-primary)' }}>✓</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col">
              <div className="px-3 py-2 text-xs font-bold text-center tracking-widest" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                프로그램 오류 신고
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-3 py-4 gap-1" style={{ backgroundColor: 'var(--bg-surface)' }}>
                <p className="text-sm font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>박현서</p>
                <p className="text-sm font-medium tracking-wider" style={{ color: 'var(--text-primary)' }}>010-4523-0464</p>
              </div>
            </div>
          </div>
          </>
          )}

          {/* 본문 */}
          <div>

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
              <div className={cn(valueCls, 'border-r-0')}>{schedule.responsible_pd}</div>
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
              <div className={labelCls}>짐/장비</div>
              <div className={valueCls}>{schedule.has_luggage ? '있음' : '없음'}</div>
            </div>
            </>
            )}

            {/* 특기사항 */}
            <div className="grid grid-cols-[112px_1fr]">
              <div className={cn(labelCls, 'items-start pt-3')}>특 기 사 항</div>
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

        {/* 승인 현황 */}
        <div className="mt-4 border rounded-xl p-4 shadow-sm print:mt-3 print:border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h3 className="font-bold text-sm mb-3 tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            {isDispatch ? '영상국 승인 현황' : '스태프 승인 현황'}
          </h3>
          <div className={cn('grid gap-3', isDispatch ? 'grid-cols-1' : 'grid-cols-2')}>
            {(isDispatch ? [subControlApproval] : [officeApproval, subControlApproval]).map((approval, i) => {
              if (!approval) return null
              const isApproved = approval.status === 'approved'
              const isRejected = approval.status === 'rejected'
              return (
                <div key={i} className={cn(
                  'border rounded-xl p-3 text-sm transition-colors',
                  isApproved && 'border-emerald-800 bg-emerald-950/25',
                  isRejected && 'border-rose-800 bg-rose-950/25',
                  !isApproved && !isRejected && 'border-[var(--border-default)] bg-white/5'
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[var(--text-primary)]">{partLabels[approval.part] ?? approval.part}</span>
                    <span className={cn(
                      'text-xs font-bold',
                      isApproved && 'text-emerald-300',
                      isRejected && 'text-rose-300',
                      !isApproved && !isRejected && 'text-[var(--text-muted)]'
                    )}>
                      {isApproved ? '✓ 승인' : isRejected ? '✕ 반려' : '대기 중'}
                    </span>
                  </div>
                  {isRejected && approval.reject_reason && (
                    <p className="text-xs text-rose-300 mt-1">반려 사유: {approval.reject_reason}</p>
                  )}
                  {approval.decided_at && (
                    <p className="text-xs mt-1 text-[var(--text-secondary)]">
                      {format(parseISO(approval.decided_at), 'M/d HH:mm', { locale: ko })}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 액션 바 */}
      <div className="mt-5 no-print">
        <ActionBar
          schedule={schedule}
          profile={profile}
          onUpdate={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    </div>
  )
}
