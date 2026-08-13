'use client'

import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { OverlapEvent } from '@/lib/types'

function fmtRange(start: string, end: string) {
  const s = parseISO(start)
  const e = parseISO(end)
  const sameDay = format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')
  const startLabel = format(s, 'M월 d일(EEE) HH:mm', { locale: ko })
  const endLabel = format(e, sameDay ? 'HH:mm' : 'M월 d일(EEE) HH:mm', { locale: ko })
  return `${startLabel} ~ ${endLabel}`
}

const typeLabel: Record<string, string> = {
  venue: '장소',
  resource: '자원',
  both: '장소·자원',
}

interface OverlapWarningDialogProps {
  open: boolean
  overlaps: OverlapEvent[]
  loading: boolean
  onEdit: () => void
  onForce: () => void
}

export default function OverlapWarningDialog({
  open,
  overlaps,
  loading,
  onEdit,
  onForce,
}: OverlapWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onEdit() }}>
      <DialogContent className="max-w-md border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="w-5 h-5" />
            일정이 겹칩니다
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            같은 시간대에 장소 또는 자원이 겹치는 일정이 있습니다. 시간을 수정하거나, 조율 후 강제 등록할 수 있습니다.
          </p>
          <ul className="space-y-2 max-h-56 overflow-y-auto">
            {overlaps.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border p-3"
                style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-elevated)' }}
              >
                <p className="text-sm font-semibold text-[var(--text-primary)]">{item.program_name}</p>
                <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {fmtRange(item.broadcast_start, item.broadcast_end)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {item.venue} · {item.responsible_pd} PD
                  {item.conflict_type ? ` · ${typeLabel[item.conflict_type] ?? item.conflict_type}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            disabled={loading}
            className="flex-1 min-h-12 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          >
            시간 수정하기
          </Button>
          <Button
            type="button"
            onClick={onForce}
            disabled={loading}
            className="flex-1 min-h-12 bg-amber-600 hover:bg-amber-500 text-white gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            강제 등록하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
