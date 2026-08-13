'use client'

import { useState } from 'react'
import { useNavRouter } from '@/lib/use-nav-router'
import { isStaffRole, isStaffSubControlRole, isDispatchRequest } from '@/lib/roles'
import AssignmentForm from '@/components/action-bar/AssignmentForm'
import type { Schedule, Profile } from '@/lib/types'
import { Button } from '@/components/ui/button'
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
  AlertTriangle,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'

interface ActionBarProps {
  schedule: Schedule
  profile: Profile
  onUpdate: () => void
}

export default function ActionBar({ schedule, profile, onUpdate }: ActionBarProps) {
  const router = useNavRouter()
  const [loading, setLoading] = useState(false)
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)
  const [resolvedLocal, setResolvedLocal] = useState(false)

  const isOwner = schedule.created_by === profile.id
  const isAdmin = profile.role === 'Admin'
  const canResolve = isAdmin || isStaffRole(profile.role)
  const isStaffSubControl = isStaffSubControlRole(profile.role)
  const isDispatch = isDispatchRequest(schedule)
  const hasConflict = schedule.has_conflict === true && !resolvedLocal

  async function handleResolveConflict() {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_conflict' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('조율 완료로 표시했습니다.')
      setResolvedLocal(true)
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
      toast.success('의뢰서가 삭제되었습니다.')
      router.push('/calendar')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoading(false)
      setShowWithdrawDialog(false)
    }
  }

  return (
    <>
      <div className="space-y-3">
        {hasConflict && (
          <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200 text-sm">시간·자원이 다른 일정과 겹칩니다</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  당사자와 조율한 뒤 경고 표시를 해제할 수 있습니다.
                </p>
              </div>
            </div>
            {canResolve && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={loading}
                  onChange={() => { void handleResolveConflict() }}
                  className="h-4 w-4 rounded border-[var(--border-default)] accent-amber-400"
                />
                <span className="text-sm text-[var(--text-primary)]">조율 완료</span>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-amber-300" />}
              </label>
            )}
          </div>
        )}

        {!hasConflict && (
          <div
            className="flex items-center gap-2 p-4 border rounded-xl"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            <span className="text-emerald-200 font-medium text-sm">
              {isDispatch ? '배차가 등록되었습니다.' : '이 일정은 확정 공개되었습니다.'}
            </span>
          </div>
        )}

        {(isOwner || isAdmin) && (
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
              삭제
            </Button>
          </div>
        )}

        {isDispatch && (isStaffSubControl || isAdmin) && (
          <AssignmentForm scheduleId={schedule.id} onComplete={onUpdate} />
        )}
      </div>

      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="max-w-md border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>일정 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm py-2" style={{ color: 'var(--text-muted)' }}>
            <span className="font-semibold text-[var(--text-primary)]">&apos;{schedule.program_name}&apos;</span>
            을(를) 삭제합니다. 겹침이 있던 다른 일정의 경고는 자동으로 재검사됩니다.
          </p>
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
              className="bg-rose-700 hover:bg-rose-600 text-white gap-2 min-h-12"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              삭제 확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
