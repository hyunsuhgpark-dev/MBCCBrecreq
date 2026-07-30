'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isStaffOfficeRole, isStaffSubControlRole, isDispatchRequest } from '@/lib/roles'
import AssignmentForm from '@/components/action-bar/AssignmentForm'
import type { Schedule, Profile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  AlertTriangle,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  Trash2,
  Car,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActionBarProps {
  schedule: Schedule
  profile: Profile
  onUpdate: () => void
}

export default function ActionBar({ schedule, profile, onUpdate }: ActionBarProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)
  const [showRevokeDialog, setShowRevokeDialog] = useState(false)

  const isOwner = schedule.created_by === profile.id
  const isStaffOffice = isStaffOfficeRole(profile.role)
  const isStaffSubControl = isStaffSubControlRole(profile.role)
  const isAdmin = profile.role === 'Admin'
  const isStaff = isStaffOffice || isStaffSubControl

  const isDispatch = isDispatchRequest(schedule)

  const myPart = isStaffOffice ? 'office' : isStaffSubControl ? 'sub_control' : null
  const myApproval = myPart
    ? schedule.approvals?.find((a) => a.part === myPart)
    : null

  const alreadyDecided = myApproval?.status !== 'pending'

  const approvedCount = schedule.approvals?.filter((a) => a.status === 'approved').length ?? 0
  const totalApprovals = schedule.approvals?.length ?? 2

  async function handleResolveConflict() {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_conflict' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('협의 완료 처리되었습니다.')
      router.refresh()
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    setLoading(true)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: schedule.id, action: 'approve' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      toast.success(
        data.allConfirmed
          ? (isDispatch ? '승인 완료! 배정 대기 상태입니다.' : '모든 파트 승인 완료! 일정이 확정되었습니다.')
          : '승인 완료!'
      )
      router.refresh()
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error('반려 사유를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: schedule.id,
          action: 'reject',
          rejectReason: rejectReason.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('반려 처리되었습니다.')
      setShowRejectDialog(false)
      setRejectReason('')
      router.refresh()
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  async function handleRevokeApproval() {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_approval' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('승인이 취소되어 대기 상태로 전환되었습니다.')
      setShowRevokeDialog(false)
      router.refresh()
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  async function handleWithdraw() {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('의뢰서가 철회되었습니다.')
      router.push('/calendar')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoading(false)
      setShowWithdrawDialog(false)
    }
  }

  async function handleForceApprove() {
    setLoading(true)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: schedule.id, action: 'force_approve' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('강제 승인되었습니다.')
      router.refresh()
      onUpdate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  // 배정 대기 (배차 의뢰 승인 후)
  if (schedule.status === 'assigned') {
    return (
      <>
        <div className="space-y-3">
          {(isOwner || isAdmin) && (
            <div
              className="flex items-center gap-2 p-4 border rounded-xl"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              <Car className="w-5 h-5 text-purple-300 shrink-0" />
              <div>
                <p className="font-medium text-purple-200 text-sm">배정 대기 중</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  영상국에서 차량·기사 배정 후 알림을 보내드립니다.
                </p>
              </div>
            </div>
          )}

          {isAdmin && (
            <Button
              onClick={() => setShowRevokeDialog(true)}
              variant="outline"
              disabled={loading}
              className="w-full min-h-12 font-semibold gap-2 rounded-xl border-amber-800 text-amber-300 hover:bg-amber-950/20"
            >
              <XCircle className="w-4 h-4" />
              승인 취소 (관리자)
            </Button>
          )}

          {(isStaffSubControl || isAdmin) && (
            <AssignmentForm scheduleId={schedule.id} onComplete={onUpdate} />
          )}
        </div>

        {/* 승인 취소 확인 다이얼로그 */}
        <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
          <DialogContent className="max-w-md border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-300">
                <XCircle className="w-5 h-5" />
                승인 취소
              </DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                <span className="font-semibold text-[var(--text-primary)]">&apos;{schedule.program_name}&apos;</span> 의 승인을 취소하고 대기 상태로 되돌립니다.
              </p>
              <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                담당 스태프에게 재승인 요청이 발송됩니다.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowRevokeDialog(false)}
                className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                취소
              </Button>
              <Button
                onClick={handleRevokeApproval}
                disabled={loading}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-2 min-h-12"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                승인 취소 확인
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // 확정 상태: 의뢰자/관리자는 수정 가능 (재승인 필요)
  if (schedule.status === 'confirmed') {
    if (isOwner || isAdmin) {
      return (
        <>
          <div
            className="border rounded-xl p-4 space-y-3"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
              <span className="text-emerald-200 font-medium text-sm">
                {isDispatch ? '배차가 최종 확정되었습니다.' : '이 일정은 최종 확정되었습니다.'}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isDispatch
                ? '일정 변경이 필요하면 수정 후 다시 영상국 승인·배정을 받아야 합니다.'
                : '일정 변경이 필요하면 수정 후 다시 기술국·영상국 승인을 받아야 합니다.'}
            </p>
            <Button
              onClick={() => router.push(`/schedules/${schedule.id}/edit`)}
              variant="outline"
                  className="w-full min-h-12 font-semibold gap-2 rounded-xl border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            >
              <Pencil className="w-4 h-4" />
              일정 수정하기
            </Button>
            {isAdmin && (
              <Button
                onClick={() => setShowRevokeDialog(true)}
                variant="outline"
                disabled={loading}
                className="w-full min-h-12 font-semibold gap-2 rounded-xl border-amber-800 text-amber-300 hover:bg-amber-950/20"
              >
                <XCircle className="w-4 h-4" />
                승인 취소 (관리자)
              </Button>
            )}
          </div>

          {/* 승인 취소 확인 다이얼로그 */}
          <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
            <DialogContent className="max-w-md border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-300">
                  <XCircle className="w-5 h-5" />
                  승인 취소
                </DialogTitle>
              </DialogHeader>
              <div className="py-2">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  <span className="font-semibold text-[var(--text-primary)]">&apos;{schedule.program_name}&apos;</span> 의 확정을 취소하고 대기 상태로 되돌립니다.
                </p>
                <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                  담당 스태프에게 재승인 요청이 발송됩니다.
                </p>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowRevokeDialog(false)}
                  className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                >
                  취소
                </Button>
                <Button
                  onClick={handleRevokeApproval}
                  disabled={loading}
                  className="bg-amber-600 hover:bg-amber-700 text-white gap-2 min-h-12"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  승인 취소 확인
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    return (
      <div
        className="flex items-center gap-2 p-4 border rounded-xl"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
        <span className="text-emerald-200 font-medium text-sm">
          {isDispatch ? '배차가 최종 확정되었습니다.' : '이 일정은 최종 확정되었습니다.'}
        </span>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {/* 의뢰자 액션 */}
        {(isOwner || isAdmin) && schedule.status === 'conflict' && (
          <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200 text-sm">일정 충돌이 감지되었습니다</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  다른 일정과 장소 또는 자원이 겹칩니다. 당사자간 협의 후 아래 버튼을 눌러주세요.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Button
                onClick={handleResolveConflict}
                disabled={loading}
                className="w-full min-h-14 text-white font-bold text-base gap-2 rounded-xl"
                style={{ backgroundColor: 'var(--color-conflict)', opacity: loading ? 0.9 : 1 }}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
                협의 완료
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => router.push(`/schedules/${schedule.id}/edit`)}
                  variant="outline"
                  disabled={loading}
                  className="min-h-10 text-sm font-semibold gap-1.5 rounded-xl border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  일정 수정
                </Button>
              <Button
                onClick={() => setShowWithdrawDialog(true)}
                variant="outline"
                disabled={loading}
                  className="min-h-10 text-sm font-semibold gap-1.5 rounded-xl border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
                의뢰 철회
              </Button>
              </div>
            </div>
          </div>
        )}

        {/* 의뢰자 수정/철회 (pending 상태) */}
        {(isOwner || isAdmin) && schedule.status === 'pending' && (
          <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              수정 시 승인 절차가 초기화됩니다. 철회 시 다른 의뢰서의 충돌이 자동으로 해소됩니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => router.push(`/schedules/${schedule.id}/edit`)}
                variant="outline"
                className="min-h-12 font-semibold gap-2 rounded-xl border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                <Pencil className="w-4 h-4" />
                수정하기
              </Button>
              <Button
                onClick={() => setShowWithdrawDialog(true)}
                variant="outline"
                className="min-h-12 font-semibold gap-2 rounded-xl border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-rose-400"
              >
                <Trash2 className="w-4 h-4" />
                의뢰 철회
              </Button>
            </div>
          </div>
        )}

        {/* 반려 후 재등록 안내 */}
        {(isOwner || isAdmin) && schedule.status === 'rejected' && (
          <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="flex items-start gap-3 mb-3">
              <XCircle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200 text-sm">반려된 일정입니다</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  반려 사유를 확인하고 내용을 수정하여 재등록해주세요.
                </p>
              </div>
            </div>
            <Button
              onClick={() => router.push(`/schedules/${schedule.id}/edit`)}
              className="w-full min-h-14 font-bold text-base gap-2 rounded-xl bg-white text-[#0A0A0A] hover:bg-zinc-200 disabled:opacity-50"
            >
              내용 수정 후 재등록
            </Button>
          </div>
        )}

        {/* 스태프 대표 승인 액션 */}
        {(isStaff || isAdmin) && schedule.status === 'pending' && (
          <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-[var(--text-primary)] text-sm">
                  {isDispatch ? '영상국 승인 요청' : '스태프 승인 요청'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {/* 파트별 승인 현황 체크리스트 */}
                  {schedule.approvals?.map((a) => {
                    const partLabel = a.part === 'office' ? '기술국' : '영상국'
                    const isApproved = a.status === 'approved'
                    const isRejected = a.status === 'rejected'
                    return (
                      <span key={a.id} className={cn(
                        'text-xs px-2 py-0.5 rounded-full border font-medium',
                        isApproved && 'bg-emerald-950/35 text-emerald-200 border-emerald-800',
                        isRejected && 'bg-rose-950/35 text-rose-200 border-rose-800',
                        !isApproved && !isRejected && 'bg-white/5 text-[var(--text-secondary)] border-[var(--border-default)]',
                      )}>
                        {isApproved ? '✓' : isRejected ? '✕' : '○'} {partLabel}
                      </span>
                    )
                  })}
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({approvedCount}/{totalApprovals} 승인)</span>
                </div>
              </div>
            </div>

            {/* 본인 파트 버튼만 (이미 처리됐으면 비활성) */}
            {(isStaff && (!isDispatch || isStaffSubControl)) && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleApprove}
                  disabled={loading || alreadyDecided}
                  className={cn(
                    'min-h-14 font-bold text-base gap-2 rounded-xl',
                    alreadyDecided && myApproval?.status === 'approved'
                      ? 'bg-emerald-600 text-white cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  )}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ThumbsUp className="w-5 h-5" />
                  )}
                  {alreadyDecided && myApproval?.status === 'approved' ? '승인됨' : '승인'}
                </Button>
                <Button
                  onClick={() => setShowRejectDialog(true)}
                  disabled={loading || alreadyDecided}
                  variant="outline"
                  className={cn(
                    'min-h-14 font-bold text-base gap-2 rounded-xl border-2',
                    alreadyDecided && myApproval?.status === 'rejected'
                      ? 'border-rose-900/40 text-rose-300 cursor-not-allowed'
                      : 'border-rose-800 text-rose-200 hover:bg-rose-950/20'
                  )}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ThumbsDown className="w-5 h-5" />
                  )}
                  {alreadyDecided && myApproval?.status === 'rejected' ? '반려됨' : '반려'}
                </Button>
              </div>
            )}

            {/* 관리자 강제 승인 */}
            {isAdmin && (
              <Button
                onClick={handleForceApprove}
                disabled={loading}
                className="w-full min-h-14 font-bold text-base rounded-xl mt-3 bg-white text-[#0A0A0A] hover:bg-zinc-200 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                강제 승인 (관리자)
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 의뢰 철회 확인 다이얼로그 */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="max-w-md border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-300">
              <Trash2 className="w-5 h-5" />
              의뢰 철회
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold text-[var(--text-primary)]">&apos;{schedule.program_name}&apos;</span> 의뢰서를 철회합니다.
            </p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
              철회 시 이 의뢰서와 충돌 중인 다른 의뢰서는 자동으로 충돌이 해소되어 승인 단계로 이동합니다.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowWithdrawDialog(false)}
              className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            >
              취소
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={loading}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-2 min-h-12"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              철회 확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 반려 사유 다이얼로그 */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-300">
              <XCircle className="w-5 h-5" />
              반려 사유 입력
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              반려 사유를 입력하면 의뢰자에게 즉시 알림이 발송됩니다.
            </p>
            <Textarea
              placeholder="반려 사유를 상세히 입력해주세요..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="min-h-[100px] text-sm bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowRejectDialog(false); setRejectReason('') }}
              className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            >
              취소
            </Button>
            <Button
              onClick={handleReject}
              disabled={loading || !rejectReason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-2 min-h-12"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              반려 처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
