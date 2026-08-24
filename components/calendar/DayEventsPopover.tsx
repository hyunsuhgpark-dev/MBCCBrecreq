'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO, startOfDay } from 'date-fns'
import { ko } from 'date-fns/locale'
import { AlertTriangle } from 'lucide-react'
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

const BOX_PAD = '3pt'

const KIND_SORT_ORDER: Record<DayEventListItem['kind'], number> = {
  schedule: 0,
  office: 1,
  vacation: 2,
}

function EventRow({
  item,
  onScheduleClick,
  onOfficeClick,
}: {
  item: Extract<DayEventListItem, { kind: 'schedule' | 'office' }>
  onScheduleClick: (s: Schedule) => void
  onOfficeClick: (o: OfficeEvent) => void
}) {
  const borderColor =
    item.kind === 'schedule' ? item.borderColor : CALENDAR_ACCENT.office
  const textColor =
    item.kind === 'office' ? CALENDAR_ACCENT.office : 'var(--text-primary)'

  return (
    <button
      type="button"
      onClick={() => {
        if (item.kind === 'schedule') onScheduleClick(item.schedule)
        else onOfficeClick(item.office)
      }}
      className="w-full text-left flex items-center gap-2 py-0.5 cursor-pointer hover:bg-white/[0.06] transition-colors rounded-sm"
    >
      <div
        className="w-[3px] h-[15px] shrink-0 rounded-full"
        style={{ backgroundColor: borderColor }}
      />
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {item.kind === 'schedule' && item.schedule.has_conflict && (
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
        )}
        <span className="text-[13px] font-medium truncate" style={{ color: textColor }}>
          {item.title}
        </span>
      </div>
    </button>
  )
}

function PopoverBody({
  items,
  onScheduleClick,
  onOfficeClick,
}: {
  items: DayEventListItem[]
  onScheduleClick: (s: Schedule) => void
  onOfficeClick: (o: OfficeEvent) => void
}) {
  const eventItems = items.filter(
    (item): item is Extract<DayEventListItem, { kind: 'schedule' | 'office' }> =>
      item.kind !== 'vacation',
  )
  const vacationNames = items
    .filter((item): item is Extract<DayEventListItem, { kind: 'vacation' }> => item.kind === 'vacation')
    .map((item) => item.title)

  if (eventItems.length === 0 && vacationNames.length === 0) return null

  return (
    <div
      className="overflow-y-auto overscroll-contain flex flex-col gap-0.5"
      style={{ padding: BOX_PAD, maxHeight: 'min(360px, 60vh)' }}
    >
      {eventItems.map((item) => (
        <EventRow
          key={`${item.kind}-${item.id}`}
          item={item}
          onScheduleClick={onScheduleClick}
          onOfficeClick={onOfficeClick}
        />
      ))}
      {vacationNames.length > 0 && (
        <div className="flex items-center gap-2 py-0.5">
          <div
            className="w-[3px] h-[15px] shrink-0 rounded-full"
            style={{ backgroundColor: CALENDAR_ACCENT.vacation }}
          />
          <span className="text-[13px] leading-snug truncate" style={{ color: CALENDAR_ACCENT.vacation }}>
            {vacationNames.join(', ')}
          </span>
        </div>
      )}
    </div>
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
          items={items}
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
        {date && items.length > 0 && (
          <PopoverBody
            items={items}
            onScheduleClick={onScheduleClick}
            onOfficeClick={onOfficeClick}
          />
        )}
        <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0" />
      </DialogContent>
    </Dialog>
  )
}

/** 당일 제작 → 송출/행정(시간순) → 휴가(맨 아래 이름 나열용) */
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
      ev.all_day || !ev.start_at ? dayStart : parseISO(ev.start_at).getTime()
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
    sorted.push({
      sortKey: dayStart,
      tie: tie++,
      item: {
        kind: 'vacation',
        id: v.id,
        title: v.name,
        timeLabel: v.half_day ?? '종일',
        vacation: v,
      },
    })
  }

  sorted.sort((a, b) => {
    const kindDiff = KIND_SORT_ORDER[a.item.kind] - KIND_SORT_ORDER[b.item.kind]
    if (kindDiff !== 0) return kindDiff
    return a.sortKey - b.sortKey || a.tie - b.tie
  })

  return sorted.map((x) => x.item)
}
