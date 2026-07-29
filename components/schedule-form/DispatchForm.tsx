'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppBack } from '@/lib/use-app-back'
import { useForm, type SubmitHandler, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import DateTimePicker from '@/components/ui/DateTimePicker'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Schedule } from '@/lib/types'
import { useMobileKeyboard } from '@/lib/use-mobile-keyboard'

/** 배차 신청서 스케일: 가로 0.9 / 세로 1.2 (기존 max-w-4xl=896 기준) */
const FORM_MAX_W = Math.round(896 * 0.9) // 806
const SX = 0.9
const SY = 1.2

const schema = z.object({
  program_name: z.string().min(1, '프로그램명을 입력하세요'),
  responsible_pd: z.string().min(1, '담당 PD를 입력하세요'),
  broadcast_start: z.string().min(1, '이동 시작 시간을 입력하세요'),
  broadcast_end: z.string().min(1, '이동 종료 시간을 입력하세요'),
  venue: z.string().min(1, '목적지를 입력하세요'),
  passenger_count: z.coerce.number().int().min(1, '탑승 인원을 입력하세요'),
  notes: z.string().optional().default(''),
}).refine(
  (data) => new Date(data.broadcast_end) > new Date(data.broadcast_start),
  { message: '종료 시간은 시작 시간보다 늦어야 합니다', path: ['broadcast_end'] }
)

type FormValues = z.infer<typeof schema>

interface DispatchFormProps {
  initialData?: Partial<Schedule>
  scheduleId?: string
  prefillDate?: string
}

function toLocalIso(dt: string | null | undefined): string {
  if (!dt) return ''
  const d = new Date(dt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultEndTime(start?: string, end?: string | null, prefillDate?: string): string {
  if (end) return toLocalIso(end)
  if (start) {
    const d = new Date(start)
    d.setHours(d.getHours() + 2)
    return toLocalIso(d.toISOString())
  }
  if (prefillDate) return `${prefillDate}T11:00`
  return ''
}

export default function DispatchForm({ initialData, scheduleId, prefillDate }: DispatchFormProps) {
  const router = useRouter()
  const goBack = useAppBack('/schedules/new')
  const [loading, setLoading] = useState(false)
  const { isKeyboardOpen, handleFocusCapture } = useMobileKeyboard()
  const isEdit = !!scheduleId

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      program_name: initialData?.program_name ?? '',
      responsible_pd: initialData?.responsible_pd ?? '',
      broadcast_start: initialData?.broadcast_start
        ? toLocalIso(initialData.broadcast_start)
        : prefillDate
          ? `${prefillDate}T09:00`
          : '',
      broadcast_end: defaultEndTime(
        initialData?.broadcast_start ?? (prefillDate ? `${prefillDate}T09:00` : undefined),
        initialData?.broadcast_end,
        prefillDate
      ),
      venue: initialData?.venue ?? '',
      passenger_count: initialData?.passenger_count ?? 1,
      notes: initialData?.notes ?? '',
    },
  })

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setLoading(true)
    try {
      const payload = {
        request_type: 'dispatch' as const,
        program_name: values.program_name,
        responsible_pd: values.responsible_pd,
        broadcast_start: new Date(values.broadcast_start).toISOString(),
        broadcast_end: new Date(values.broadcast_end).toISOString(),
        broadcast_at: null,
        rehearsal_staff_at: null,
        rehearsal_cast_at: null,
        venue: values.venue,
        location: '',
        use_relay_car: false,
        use_studio: false,
        use_eng: false,
        use_audio: false,
        is_live: false,
        record_content: '',
        notes: values.notes,
        passenger_count: values.passenger_count,
        has_luggage: false,
      }

      const url = isEdit ? `/api/schedules/${scheduleId}` : '/api/schedules'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '오류 발생')
      }

      const data = await res.json()
      const targetId = isEdit ? scheduleId : data.id

      toast.success(isEdit ? '배차 신청이 수정되었습니다.' : '배차 신청서가 등록되었습니다.')
      router.push(`/schedules/${targetId}`)
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const labelW = Math.round(112 * SX) // 101
  const rowPadY = Math.round(12 * SY) // 14
  const rowPadX = Math.round(12 * SX) // 11
  const inputH = Math.round(32 * SY) // 38 — 행 높이만 키움
  const headerPadY = Math.round(20 * SY) // 24
  const notesMinH = Math.round(110 * SY) // 132

  const border = 'border border-[var(--border-default)]'
  const labelCls = cn(
    border,
    'bg-[var(--bg-elevated)] px-1 font-bold text-sm text-[var(--text-secondary)] text-center flex items-center justify-center tracking-wider select-none whitespace-nowrap'
  )
  const valueCls = cn(
    border,
    'bg-[var(--bg-surface)] text-[var(--text-primary)]'
  )
  const inputCls = cn(
    'w-full bg-transparent border-0 rounded-none px-1',
    'text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
    'focus:outline-none transition-colors'
  )
  const cellPad = { padding: `${rowPadY}px ${rowPadX}px` }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onFocusCapture={handleFocusCapture}
      className="w-full mx-auto"
      style={{ maxWidth: FORM_MAX_W }}
    >
      <div
        className={cn(
          'rounded-2xl overflow-hidden border shadow-2xl',
          'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)]'
        )}
        style={{ marginBottom: 20, boxShadow: 'var(--shadow-float)' }}
      >
        <div
          className="hidden md:block relative text-center overflow-hidden"
          style={{ backgroundColor: 'var(--bg-elevated)', paddingTop: headerPadY, paddingBottom: headerPadY }}
        >
          <div className="absolute inset-0 opacity-[0.08] bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.22)_0px,rgba(255,255,255,0.22)_1px,transparent_1px,transparent_8px)]" />
          <h1 className="relative text-2xl font-bold tracking-[0.5em]" style={{ color: 'var(--text-primary)' }}>
            배 차 신 청 서
          </h1>
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: 'var(--border-default)' }} />
        </div>

        <div>
          {/* 프로그램명 + 담당PD — 좌측 라벨 열을 이동 시작과 동일 폭으로 */}
          <div
            className="grid border-b border-[var(--border-default)]"
            style={{
              gridTemplateColumns: `${labelW}px minmax(0,1fr) 72px ${Math.round(152 * SX) + 60}px`,
            }}
          >
            <div className={labelCls} style={cellPad}>프로그램명</div>
            <div className={cn(valueCls, 'border-t-0 border-b-0 min-w-0')} style={cellPad}>
              <input
                type="text"
                placeholder="프로그램명 입력"
                {...register('program_name')}
                className={cn(inputCls, errors.program_name && 'outline outline-1 outline-red-400')}
                style={{ height: inputH }}
              />
              {errors.program_name && (
                <p className="text-red-500 text-[11px] mt-0.5">{errors.program_name.message}</p>
              )}
            </div>
            <div className={labelCls} style={cellPad}>담당PD</div>
            <div className={cn(valueCls, 'border-r-0 min-w-0')} style={cellPad}>
              <input
                type="text"
                placeholder="이름"
                {...register('responsible_pd')}
                className={cn(inputCls, errors.responsible_pd && 'outline outline-1 outline-red-400')}
                style={{ height: inputH }}
              />
            </div>
          </div>

          <div
            className="grid border-b border-[var(--border-default)]"
            style={{ gridTemplateColumns: `${labelW}px 1fr` }}
          >
            <div className={labelCls} style={cellPad}>이동 시작</div>
            <div className={cn(valueCls, 'border-l-0')} style={cellPad}>
              <Controller
                control={control}
                name="broadcast_start"
                render={({ field }) => (
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                    error={!!errors.broadcast_start}
                    comfortable
                  />
                )}
              />
              {errors.broadcast_start && <p className="text-red-500 text-[11px] mt-1">{errors.broadcast_start.message}</p>}
            </div>
          </div>

          <div
            className="grid border-b border-[var(--border-default)]"
            style={{ gridTemplateColumns: `${labelW}px 1fr` }}
          >
            <div className={labelCls} style={cellPad}>이동 종료</div>
            <div className={cn(valueCls, 'border-l-0')} style={cellPad}>
              <Controller
                control={control}
                name="broadcast_end"
                render={({ field }) => (
                  <DateTimePicker value={field.value} onChange={field.onChange} error={!!errors.broadcast_end} comfortable />
                )}
              />
              {errors.broadcast_end && <p className="text-red-500 text-[11px] mt-1">{errors.broadcast_end.message}</p>}
            </div>
          </div>

          <div
            className="grid border-b border-[var(--border-default)]"
            style={{ gridTemplateColumns: `${labelW}px 1fr` }}
          >
            <div className={labelCls} style={cellPad}>목 적 지</div>
            <div className={cn(valueCls, 'border-l-0')} style={cellPad}>
              <input
                type="text"
                placeholder="예: 서울 MBC 본관"
                {...register('venue')}
                className={cn(inputCls, errors.venue && 'outline outline-1 outline-red-400')}
                style={{ height: inputH }}
              />
              {errors.venue && <p className="text-red-500 text-[11px] mt-0.5">{errors.venue.message}</p>}
            </div>
          </div>

          <div
            className="grid border-b border-[var(--border-default)]"
            style={{ gridTemplateColumns: `${labelW}px 1fr` }}
          >
            <div className={labelCls} style={cellPad}>탑승 인원</div>
            <div className={cn(valueCls, 'border-l-0 flex items-center gap-3')} style={cellPad}>
              <input
                type="number"
                min={1}
                {...register('passenger_count')}
                className={cn(inputCls, errors.passenger_count && 'outline outline-1 outline-red-400')}
                style={{ height: inputH, maxWidth: 72, marginLeft: 16 }}
              />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>명</span>
              {errors.passenger_count && <p className="text-red-500 text-[11px]">{errors.passenger_count.message}</p>}
            </div>
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: `${labelW}px 1fr` }}
          >
            <div className={cn(labelCls, 'border-b-0')} style={cellPad}>특기사항</div>
            <div className={cn(valueCls, 'border-l-0 border-b-0 border-r-0')} style={cellPad}>
              <Textarea
                placeholder="특기사항을 입력하세요..."
                {...register('notes')}
                className="border-0 rounded-none focus:ring-0 bg-transparent resize-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                style={{ minHeight: notesMinH }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'left-0 right-0 z-30 border-t border-[var(--border-default)] px-4',
          isKeyboardOpen
            ? 'relative pb-[env(safe-area-inset-bottom,0px)]'
            : 'fixed bottom-0 bg-[var(--bg-surface)] pb-[calc(env(safe-area-inset-bottom,0px)+72px)]',
          'md:static md:border-0 md:bg-transparent md:px-0 md:pb-0 md:shadow-none',
        )}
      >
        <div className="flex justify-end gap-3 py-3 md:py-0">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            className="min-h-11 text-sm border-[var(--border-default)] text-[var(--text-primary)]"
            style={{ paddingLeft: 40, paddingRight: 40, backgroundColor: 'var(--bg-secondary-btn)' }}
          >
            취소
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="min-h-11 text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:bg-zinc-200"
            style={{ backgroundColor: '#FFFFFF', color: '#0A0A0A', paddingLeft: 40, paddingRight: 40 }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? '수정 제출' : '배차 신청')}
          </Button>
        </div>
      </div>
      {!isKeyboardOpen && (
        <div className="md:hidden" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }} />
      )}
    </form>
  )
}
