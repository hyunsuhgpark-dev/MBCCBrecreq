'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO, startOfDay } from 'date-fns'
import { ko } from 'date-fns/locale'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CALENDAR_ACCENT } from '@/lib/calendar-colors'
import type { OfficeEvent, Schedule, Vacation } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type DayEventListItem =
  | {
      kind: 'schedule'
      id: string
      title: string
      timeLabel: string
      borderColor: string
      schedule: Schedule
    }
  | {
      kind: 'office'
      id: string
      title: string
      timeLabel: string
      office: OfficeEvent
    }
  | {
      kind: 'vacation'
      id: string
      title: string
      timeLabel: string
      vacation: Vacation
    }

interface DayEventsPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: Date | null
  items: DayEventListItem[]
  isDesktop: boolean
  anchorRect: DOMRect | null
  onScheduleClick: (schedule: Schedule) => void
  onOfficeClick: (office: OfficeEvent) => void
}

const SURFACE_STYLE: CSSProperties = {
  backgroundColor: 'rgb(32, 32, 38)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
}

function kindLabel(kind: DayEventListItem['kind']): string {
  if (kind === 'schedule') return '제작'
  if (kind === 'office') return '송출/행정'
  return '휴가'
}

function EventRow({
  item,
  onScheduleClick,
  onOfficeClick,
}: {
  item: DayEventListItem
  onScheduleClick: (s: Schedule) => void
  onOfficeClick: (o: OfficeEvent) => void
}) {
  const clickable = item.kind !== 'vacation'

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => {
        if (item.kind === 'schedule') onScheduleClick(item.schedule)
        if (item.kind === 'office') onOfficeClick(item.office)
      }}
      className={cn(
        'w-full text-left flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors',
        clickable ? 'cursor-pointer hover:bg-white/[0.06]' : 'cursor-default',
      )}
    >
      <div
        className="w-[3px] self-stretch shrink-0 rounded-full mt-0.5"
        style={{
          backgroundColor:
            item.kind === 'schedule'
              ? item.borderColor
              : item.kind === 'office'
                ? CALENDAR_ACCENT.office
                : CALENDAR_ACCENT.vacation,
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[10px] shrink-0 px-1 py-0.5 rounded"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: 'var(--text-muted)',
            }}
          >
            {kindLabel(item.kind)}
          </span>
          {item.kind === 'schedule' && item.schedule.has_conflict && (
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          )}
          <span
            className="text-[13px] font-medium truncate"
            style={{
              color:
                item.kind === 'office'
                  ? CALENDAR_ACCENT.office
                  : item.kind === 'vacation'
                    ? CALENDAR_ACCENT.vacation
                    : 'var(--text-primary)',
            }}
          >
            {item.title}
          </span>
        </div>
        <div className="text-[11px] tabular-nums mt-0.5" style={{ color: '#9CA3AF' }}>
          {item.timeLabel}
        </div>
      </div>
    </button>
  )
}

function PopoverBody({
  date,
  items,
  onClose,
  onScheduleClick,
  onOfficeClick,
}: {
  date: Date
  items: DayEventListItem[]
  onClose: () => void
  onScheduleClick: (s: Schedule) => void
  onOfficeClick: (o: OfficeEvent) => void
}) {
  const header = format(date, 'M월 d일 (EEE) 일정 목록', { locale: ko })

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-white/[0.08] shrink-0">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{header}</h3>
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-y-auto overscroll-contain px-1 py-1.5" style={{ maxHeight: 'min(360px, 60vh)' }}>
        {items.length === 0 ? (
          <p className="text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>
            표시할 일정이 없습니다.
          </p>
        ) : (
          items.map((item) => (
            <EventRow
              key={`${item.kind}-${item.id}`}
              item={item}
              onScheduleClick={onScheduleClick}
              onOfficeClick={onOfficeClick}
            />
          ))
        )}
      </div>
    </>
  )
}

function DesktopFloatingPopover({
  open,
  onOpenChange,
  date,
  items,
  anchorRect,
  onScheduleClick,
  onOfficeClick,
}: DayEventsPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRect) {
      setPos(null)
      return
    }

    const margin = 8
    const panelW = 300
    const panelH = panelRef.current?.offsetHeight ?? 320

    let left = anchorRect.left + anchorRect.width / 2 - panelW / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - panelW - margin))

    let top = anchorRect.bottom + margin
    if (top + panelH > window.innerHeight - margin) {
      top = anchorRect.top - panelH - margin
    }
    if (top < margin) top = margin

    setPos({ top, left })
  }, [open, anchorRect, items.length])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open || !date) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60]"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="당일 전체 일정"
        className="fixed z-[61] w-[300px] rounded-lg overflow-hidden flex flex-col"
        style={{
          ...SURFACE_STYLE,
          top: pos?.top ?? anchorRect?.bottom ?? 0,
          left: pos?.left ?? anchorRect?.left ?? 0,
          visibility: pos || !anchorRect ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <PopoverBody
          date={date}
          items={items}
          onClose={() => onOpenChange(false)}
          onScheduleClick={onScheduleClick}
          onOfficeClick={onOfficeClick}
        />
      </div>
    </>,
    document.body,
  )
}

export function DayEventsPopover(props: DayEventsPopoverProps) {
  const { open, onOpenChange, date, items, isDesktop, onScheduleClick, onOfficeClick } = props

  if (isDesktop) {
    return <DesktopFloatingPopover {...props} />
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'fixed top-auto bottom-0 left-0 right-0 z-50 w-full max-w-none translate-x-0 translate-y-0 rounded-t-xl rounded-b-none p-0 gap-0 ring-0',
        )}
        style={SURFACE_STYLE}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {date ? format(date, 'M월 d일 일정 목록', { locale: ko }) : '일정 목록'}
          </DialogTitle>
        </DialogHeader>
        {date && (
          <PopoverBody
            date={date}
            items={items}
            onClose={() => onOpenChange(false)}
            onScheduleClick={onScheduleClick}
            onOfficeClick={onOfficeClick}
          />
        )}
        <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0" />
      </DialogContent>
    </Dialog>
  )
}

/** 당일 제작·송출/행정·휴가를 시간순으로 정렬 */
export function buildDayEventItems(
  day: Date,
  schedules: Schedule[],
  officeEvents: OfficeEvent[],
  vacations: Vacation[],
  scheduleBorderColor: (s: Schedule) => string,
  officeTimeLabel: (ev: OfficeEvent, day: Date) => string,
): DayEventListItem[] {
  const dayStart = startOfDay(day).getTime()
  const sorted: { sortKey: number; tie: number; item: DayEventListItem }[] = []
  let tie = 0

  for (const s of schedules) {
    const startDt = parseISO(s.broadcast_start)
    const endDt = parseISO(s.broadcast_end)
    const sd = format(startDt, 'yyyy-MM-dd')
    const ed = format(endDt, 'yyyy-MM-dd')
    const isMultiDay = sd !== ed
    const timeLabel = isMultiDay
      ? `${format(startDt, 'M/d HH:mm')}~${format(endDt, 'M/d HH:mm')}`
      : `${format(startDt, 'HH:mm')}~${format(endDt, 'HH:mm')}`

    sorted.push({
      sortKey: startDt.getTime(),
      tie: tie++,
      item: {
        kind: 'schedule',
        id: s.id,
        title: s.program_name,
        timeLabel,
        borderColor: scheduleBorderColor(s),
        schedule: s,
      },
    })
  }

  for (const ev of officeEvents) {
    const sortKey =
      ev.all_day || !ev.start_at ? dayStart - 1 : parseISO(ev.start_at).getTime()
    sorted.push({
      sortKey,
      tie: tie++,
      item: {
        kind: 'office',
        id: ev.id,
        title: ev.title,
        timeLabel: officeTimeLabel(ev, day),
        office: ev,
      },
    })
  }

  for (const v of vacations) {
    const timeLabel = v.half_day ? v.half_day : '종일'
    sorted.push({
      sortKey: dayStart,
      tie: tie++,
      item: {
        kind: 'vacation',
        id: v.id,
        title: v.name,
        timeLabel,
        vacation: v,
      },
    })
  }

  sorted.sort((a, b) => a.sortKey - b.sortKey || a.tie - b.tie)
  return sorted.map((x) => x.item)
}
