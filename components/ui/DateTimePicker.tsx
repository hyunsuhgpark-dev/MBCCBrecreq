'use client'

import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'
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
  /** 모달 등에서 여유 있는 입력 높이·간격 */
  comfortable?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)      // 0 ~ 23
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5) // 0, 5, 10 … 55

function parseValue(v: string) {
  if (!v) return { date: '', hour: 9, minute: 0 }
  const [datePart, timePart] = v.split('T')
  const [hStr, mStr] = (timePart ?? '09:00').split(':')
  const hour = parseInt(hStr ?? '9', 10)
  const minute = Math.round(parseInt(mStr ?? '0', 10) / 5) * 5
  return { date: datePart ?? '', hour, minute }
}

function toIso(date: string, hour: number, minute: number): string {
  if (!date) return ''
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** YYYY-MM-DD → 표시용 */
function formatDateLabel(ymd: string): string {
  if (!ymd) return '연도-월-일'
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${y}-${m}-${d}`
}

export default function DateTimePicker({
  value,
  onChange,
  error,
  className,
  hideDate,
  anchorDate,
  comfortable,
}: DateTimePickerProps) {
  const parsed = parseValue(value)
  const [date, setDate] = useState(parsed.date)
  const [hour, setHour] = useState(parsed.hour)
  const [minute, setMinute] = useState(parsed.minute)

  useEffect(() => {
    const p = parseValue(value)
    setDate(p.date)
    setHour(p.hour)
    setMinute(p.minute)
  }, [value])

  function getEffectiveDate(d: string) {
    if (d) return d
    if (hideDate && anchorDate) return anchorDate
    return d
  }

  function emit(d: string, h: number, m: number) {
    const iso = toIso(getEffectiveDate(d), h, m)
    onChange(iso)
  }

  const selectCls = cn(
    comfortable
      ? 'h-11 rounded-lg border text-sm px-3 focus:outline-none focus:border-white/30 cursor-pointer transition-colors text-center'
      : 'h-11 sm:h-8 rounded border text-base sm:text-sm px-2 sm:px-1 focus:outline-none focus:border-[var(--accent)] cursor-pointer transition-colors text-center',
    'bg-[var(--bg-elevated)] text-[var(--text-primary)]',
    error ? 'border-red-400' : 'border-[var(--border-default)]'
  )

  const dateBoxCls = cn(
    'relative shrink-0',
    comfortable ? 'h-11 w-full sm:w-[148px]' : 'h-11 sm:h-8 w-full sm:w-[130px]'
  )

  const dateFaceCls = cn(
    'pointer-events-none absolute inset-0 flex items-center border',
    comfortable ? 'rounded-lg' : 'rounded',
    'bg-[var(--bg-elevated)] text-[var(--text-primary)]',
    error ? 'border-red-400' : 'border-[var(--border-default)]'
  )

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center w-full',
        comfortable ? 'gap-2.5 sm:gap-2.5' : 'gap-2 sm:gap-1.5',
        className
      )}
    >
      {!hideDate ? (
        <div className={dateBoxCls}>
          <div className={dateFaceCls} aria-hidden>
            <span
              className="absolute inset-0 flex items-center justify-center text-sm px-6 truncate"
              style={{ color: '#EBEBEB' }}
            >
              {formatDateLabel(date)}
            </span>
            <Calendar
              className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0"
              style={{ width: 16, height: 16, color: '#A3A3A3' }}
            />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); emit(e.target.value, hour, minute) }}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            aria-label="날짜 선택"
          />
        </div>
      ) : (
        <div className={cn('hidden sm:block shrink-0', comfortable ? 'w-[148px]' : 'w-[130px]')} />
      )}

      <div
        className={cn(
          'grid grid-cols-2 w-full sm:w-auto sm:flex sm:items-center',
          comfortable ? 'gap-2.5 sm:gap-2.5' : 'gap-2 sm:gap-1.5'
        )}
      >
        <select
          value={hour}
          onChange={(e) => { const v = parseInt(e.target.value); setHour(v); emit(date, v, minute) }}
          className={cn(selectCls, comfortable ? 'w-full sm:w-[88px]' : 'w-full sm:w-16')}
          style={{ textAlignLast: 'center' }}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>
          ))}
        </select>

        <select
          value={minute}
          onChange={(e) => { const v = parseInt(e.target.value); setMinute(v); emit(date, hour, v) }}
          className={cn(selectCls, comfortable ? 'w-full sm:w-[88px]' : 'w-full sm:w-16')}
          style={{ textAlignLast: 'center' }}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
          ))}
        </select>
      </div>
    </div>
  )
}
