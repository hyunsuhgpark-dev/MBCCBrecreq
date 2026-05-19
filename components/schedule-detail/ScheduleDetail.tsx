'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useReactToPrint } from 'react-to-print'
import type { Schedule, Profile } from '@/lib/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Printer, Edit, Trash2, AlertTriangle, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
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
import Link from 'next/link'
import ActionBar from '@/components/action-bar/ActionBar'

interface ScheduleDetailProps {
  schedule: Schedule
  profile: Profile
}

const statusConfig = {
  conflict:  { label: '충돌',    color: 'text-amber-700 bg-amber-50 border-amber-300',   icon: AlertTriangle },
  pending:   { label: '승인 대기', color: 'text-slate-600 bg-slate-100 border-slate-300',  icon: Clock },
  confirmed: { label: '확정',    color: 'text-emerald-700 bg-emerald-50 border-emerald-300', icon: CheckCircle2 },
  rejected:  { label: '반려',    color: 'text-red-700 bg-red-50 border-red-300',         icon: XCircle },
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
  const mins = Math.round((e.getTime() - s.getTime()) / 60000)
  const hours = Math.floor(mins / 60)
  const rem   = mins % 60
  const durStr = rem === 0 ? `${hours}시간` : `${hours}시간 ${rem}분`
  return `${fmt(start)}  ·  ${durStr}`
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

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `녹화의뢰서_${schedule.program_name}`,
  })

  const statusInfo = statusConfig[schedule.status]
  const StatusIcon = statusInfo.icon

  const officeApproval     = schedule.approvals?.find((a) => a.part === 'office')
  const subControlApproval = schedule.approvals?.find((a) => a.part === 'sub_control')
  const approvedCount      = schedule.approvals?.filter((a) => a.status === 'approved').length ?? 0
  const totalApprovals     = schedule.approvals?.length ?? 2

  const canEdit =
    (schedule.created_by === profile.id || profile.role === 'Admin') &&
    schedule.status !== 'confirmed'

  const canDelete = schedule.created_by === profile.id || profile.role === 'Admin'

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
  const labelCls = 'bg-[#EEF3FB] font-bold text-[#1a3a6b] text-sm text-center tracking-wider border border-slate-200 px-3 py-2 flex items-center justify-center select-none'
  const valueCls = 'border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white'

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
            <span className="text-xs text-slate-400">승인 {approvedCount}/{totalApprovals}</span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrint()}
            className="gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">PDF 출력</span>
          </Button>

          {canEdit && (
            <Link href={`/schedules/${schedule.id}/edit`}>
              <Button
                size="sm"
                className="gap-1.5 bg-[#004F9A] hover:bg-[#003A73] text-white shadow-sm"
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
              className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">삭제</span>
            </Button>
          )}
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" />
              일정 삭제
            </DialogTitle>
            <DialogDescription className="text-slate-500 pt-1">
              <span className="font-semibold text-slate-700">"{schedule.program_name}"</span> 일정을
              삭제하면 복구할 수 없습니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
              className="border-slate-200"
            >
              취소
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
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
        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-[0_4px_24px_rgba(0,79,154,0.08)] print:shadow-none print:rounded-none">

          {/* 제목 헤더 */}
          <div className="relative bg-[#004F9A] py-5 text-center overflow-hidden">
            <div className="absolute inset-0 opacity-[0.06] bg-[repeating-linear-gradient(45deg,#fff_0px,#fff_1px,transparent_1px,transparent_8px)]" />
            <h1 className="relative text-2xl font-bold tracking-[0.5em] text-white drop-shadow-sm">
              녹 화 의 뢰 서
            </h1>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          </div>

          {/* 장비 체크박스(세로) + 오류 신고 */}
          <div className="grid grid-cols-[70%_30%] border-b border-slate-200">
            <div className="border-r border-slate-200">
              {checkboxItems.map(({ label, key }, i) => (
                <div
                  key={key}
                  className={cn('grid grid-cols-[112px_1fr] items-center', i > 0 && 'border-t border-slate-200')}
                >
                  <div className={cn(labelCls, 'border-0 border-r border-slate-200 h-full text-xs')}>
                    {label}
                  </div>
                  <div className="px-4 py-2.5 text-lg">
                    {schedule[key] ? (
                      <span className="text-[#004F9A] font-bold">✓</span>
                    ) : (
                      <span className="text-slate-200">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col">
              <div className="bg-[#004F9A] px-3 py-2 text-xs font-bold text-center text-white tracking-widest">
                프로그램 오류 신고
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-3 py-4 bg-[#EEF3FB] gap-1">
                <p className="text-sm font-bold text-[#1a3a6b] tracking-wide">박현서</p>
                <p className="text-sm text-[#004F9A] font-medium tracking-wider">010-4523-0464</p>
              </div>
            </div>
          </div>

          {/* 본문 */}
          <div>

            {/* 프로그램명 + 담당PD */}
            <div className="grid grid-cols-[112px_1fr_72px_152px] border-b border-slate-200">
              <div className={labelCls}>프 로 그 램 명</div>
              <div className={cn(valueCls, 'font-semibold flex items-center gap-2')}>
                {schedule.program_name}
                {schedule.is_live && (
                  <span className="flex items-center gap-1 bg-red-500 text-white px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0">
                    <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <div className={cn(labelCls, 'text-xs')}>담 당 P D</div>
              <div className={cn(valueCls, 'border-r-0')}>{schedule.responsible_pd}</div>
            </div>

            {/* 제작일시 */}
            <div className="grid grid-cols-[112px_1fr] border-b border-slate-200">
              <div className={labelCls}>제 작 일 시</div>
              <div className={valueCls}>{fmtRange(schedule.broadcast_start, schedule.broadcast_end)}</div>
            </div>

            {/* 방송일시 — 생방송이면 숨김 */}
            {!schedule.is_live && (
              <div className="grid grid-cols-[112px_1fr] border-b border-slate-200">
                <div className={labelCls}>방 송 일 시</div>
                <div className={valueCls}>
                  {schedule.broadcast_at
                    ? fmt(schedule.broadcast_at)
                    : <span className="text-slate-300">—</span>
                  }
                </div>
              </div>
            )}

            {/* 녹화내용 */}
            <div className="grid grid-cols-[112px_1fr] border-b border-slate-200">
              <div className={labelCls}>녹 화 내 용</div>
              <div className={cn(valueCls, 'min-h-[80px] whitespace-pre-wrap')}>
                {schedule.record_content || <span className="text-slate-300">—</span>}
              </div>
            </div>

            {/* 녹화장소 */}
            <div className="grid grid-cols-[112px_1fr] border-b border-slate-200">
              <div className={labelCls}>녹 화 장 소</div>
              <div className={valueCls}>
                {schedule.venue}
                {schedule.location && (
                  <span className="ml-3 text-xs text-slate-400">자원ID: {schedule.location}</span>
                )}
              </div>
            </div>

            {/* 특기사항 */}
            <div className="grid grid-cols-[112px_1fr]">
              <div className={cn(labelCls, 'items-start pt-3')}>특 기 사 항</div>
              <div className={cn(valueCls, 'min-h-[100px] whitespace-pre-wrap border-b-0 border-r-0')}>
                {schedule.notes || <span className="text-slate-300">—</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 승인 현황 */}
        <div className="mt-4 bg-white border border-slate-100 rounded-xl p-4 shadow-sm print:mt-3 print:border">
          <h3 className="font-bold text-sm text-slate-600 mb-3 tracking-wide">스태프 승인 현황</h3>
          <div className="grid grid-cols-2 gap-3">
            {[officeApproval, subControlApproval].map((approval, i) => {
              if (!approval) return null
              const isApproved = approval.status === 'approved'
              const isRejected = approval.status === 'rejected'
              return (
                <div key={i} className={cn(
                  'border rounded-xl p-3 text-sm transition-colors',
                  isApproved && 'border-emerald-200 bg-emerald-50',
                  isRejected && 'border-red-200 bg-red-50',
                  !isApproved && !isRejected && 'border-slate-100 bg-slate-50'
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700">{partLabels[approval.part] ?? approval.part}</span>
                    <span className={cn(
                      'text-xs font-bold',
                      isApproved && 'text-emerald-700',
                      isRejected && 'text-red-600',
                      !isApproved && !isRejected && 'text-slate-400'
                    )}>
                      {isApproved ? '✓ 승인' : isRejected ? '✕ 반려' : '대기 중'}
                    </span>
                  </div>
                  {isRejected && approval.reject_reason && (
                    <p className="text-xs text-red-600 mt-1">반려 사유: {approval.reject_reason}</p>
                  )}
                  {approval.decided_at && (
                    <p className="text-xs text-slate-400 mt-1">
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
