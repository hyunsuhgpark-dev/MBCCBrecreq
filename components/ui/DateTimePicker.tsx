'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface DateTimePickerProps {
  value: string          // "YYYY-MM-DDTHH:mm" 형식
  onChange: (value: string) => void
  error?: boolean
  className?: string
  hideDate?: boolean
  /**
   * hideDate 모드에서 날짜가 비어있을 때 사용할 앵커 날짜 (YYYY-MM-DD).
   * 종료 시간 입력처럼 "시간만" 바꿀 때도 폼 값이 비지 않도록 합니다.
   */
  anchorDate?: string
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)   // 1 ~ 12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5) // 0, 5, 10 … 55

function parseValue(v: string) {
  if (!v) return { date: '', ampm: 'AM' as const, hour: 9, minute: 0 }
  const [datePart, timePart] = v.split('T')
  const [hStr, mStr] = (timePart ?? '09:00').split(':')
  const h24 = parseInt(hStr ?? '9', 10)
  const m = Math.round(parseInt(mStr ?? '0', 10) / 5) * 5
  const ampm: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM'
  const hour = h24 % 12 === 0 ? 12 : h24 % 12
  return { date: datePart ?? '', ampm, hour, minute: m }
}

function toIso(date: string, ampm: 'AM' | 'PM', hour: number, minute: number): string {
  if (!date) return ''
  const h24 = ampm === 'AM'
    ? (hour === 12 ? 0 : hour)
    : (hour === 12 ? 12 : hour + 12)
  return `${date}T${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export default function DateTimePicker({ value, onChange, error, className, hideDate, anchorDate }: DateTimePickerProps) {
  const parsed = parseValue(value)
  const [date, setDate] = useState(parsed.date)
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(parsed.ampm)
  const [hour, setHour] = useState(parsed.hour)
  const [minute, setMinute] = useState(parsed.minute)

  // 외부 value가 바뀌면 내부 상태 동기화
  useEffect(() => {
    const p = parseValue(value)
    setDate(p.date)
    setAmpm(p.ampm)
    setHour(p.hour)
    setMinute(p.minute)
  }, [value])

  function getEffectiveDate(d: string) {
    if (d) return d
    if (hideDate && anchorDate) return anchorDate
    return d
  }

  function emit(d: string, a: 'AM' | 'PM', h: number, m: number) {
    const iso = toIso(getEffectiveDate(d), a, h, m)
    onChange(iso)
  }

  const selectCls = cn(
    'h-11 sm:h-8 rounded border text-base sm:text-sm px-2 sm:px-1 focus:outline-none focus:border-[var(--accent)] cursor-pointer transition-colors',
    'bg-[var(--bg-elevated)] text-[var(--text-primary)]',
    error ? 'border-red-400' : 'border-[var(--border-default)]'
  )

  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1.5 w-full', className)}>
      {/* 날짜 — 고정 너비로 hideDate 시 spacer와 열 맞춤 */}
      {!hideDate ? (
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); emit(e.target.value, ampm, hour, minute) }}
          className={cn(
            'h-11 sm:h-8 w-full sm:w-[130px] shrink-0 rounded border text-base sm:text-sm px-2 focus:outline-none focus:border-[var(--accent)] cursor-pointer transition-colors',
            'bg-[var(--bg-elevated)] text-[var(--text-primary)]',
            error ? 'border-red-400' : 'border-[var(--border-default)]'
          )}
        />
      ) : (
        /* hideDate 모드: 날짜 input과 동일한 너비의 투명 spacer → 오전/오후 열 정렬 */
        <div className="hidden sm:block w-[130px] shrink-0" />
      )}

      <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-1.5 w-full sm:w-auto">
        {/* 오전/오후 */}
        <select
          value={ampm}
          onChange={(e) => { const v = e.target.value as 'AM' | 'PM'; setAmpm(v); emit(date, v, hour, minute) }}
          className={cn(selectCls, 'w-full sm:w-auto')}
        >
          <option value="AM">오전</option>
          <option value="PM">오후</option>
        </select>

        {/* 시 */}
        <select
          value={hour}
          onChange={(e) => { const v = parseInt(e.target.value); setHour(v); emit(date, ampm, v, minute) }}
          className={cn(selectCls, 'w-full sm:w-14')}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>{h}시</option>
          ))}
        </select>

        {/* 분 */}
        <select
          value={minute}
          onChange={(e) => { const v = parseInt(e.target.value); setMinute(v); emit(date, ampm, hour, v) }}
          className={cn(selectCls, 'w-full sm:w-16')}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
          ))}
        </select>
      </div>
    </div>
  )
}
