'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  Zap,
  AlertTriangle,
  Loader2,
  ThumbsUp,
  ThumbsDown,
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

  const isProducer = profile.role === 'Producer'
  const isOwner = schedule.created_by === profile.id
  const isStaffOffice = profile.role === 'ENG'
  const isStaffSubControl = profile.role === 'CAM'
  const isAdmin = profile.role === 'Admin'
  const isStaff = isStaffOffice || isStaffSubControl

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
      toast.success(data.allConfirmed ? '모든 파트 승인 완료! 일정이 확정되었습니다.' : '승인 완료!')
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

  // 확정 상태: 아무 액션 없음
  if (schedule.status === 'confirmed') {
    return (
      <div
        className="flex items-center gap-2 p-4 border rounded-xl"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
        <span className="text-emerald-200 font-medium text-sm">이 일정은 최종 확정되었습니다.</span>
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
            <Button
              onClick={handleResolveConflict}
              disabled={loading}
              className="w-full min-h-14 text-white font-bold text-base gap-2 rounded-xl"
              style={{ backgroundColor: 'var(--color-conflict)', opacity: loading ? 0.9 : 1 }}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
              협의 완료
            </Button>
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
              className="w-full min-h-14 text-white font-bold text-base gap-2 rounded-xl"
              style={{ backgroundColor: 'var(--accent)' }}
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
                <p className="font-semibold text-[var(--text-primary)] text-sm">스태프 승인 요청</p>
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
            {(isStaff) && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleApprove}
                  disabled={loading || alreadyDecided}
                  className={cn(
                    'min-h-14 font-bold text-base gap-2 rounded-xl',
                    alreadyDecided && myApproval?.status === 'approved'
                      ? 'bg-green-500 text-white cursor-not-allowed'
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
                className="w-full min-h-14 text-white font-bold text-base gap-2 rounded-xl mt-3"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                강제 승인 (관리자)
              </Button>
            )}
          </div>
        )}
      </div>

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
