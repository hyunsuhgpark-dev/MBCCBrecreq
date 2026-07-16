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
import { Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Schedule } from '@/lib/types'
import { useMobileKeyboard } from '@/lib/use-mobile-keyboard'

const schema = z.object({
  program_name: z.string().min(1, '프로그램명을 입력하세요'),
  responsible_pd: z.string().min(1, '담당 PD를 입력하세요'),
  broadcast_start: z.string().min(1, '이동 시작 시간을 입력하세요'),
  broadcast_end: z.string().min(1, '이동 종료 시간을 입력하세요'),
  venue: z.string().min(1, '목적지를 입력하세요'),
  passenger_count: z.coerce.number().int().min(1, '탑승 인원을 입력하세요'),
  has_luggage: z.boolean().default(false),
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
    watch,
    setValue,
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
      has_luggage: initialData?.has_luggage ?? false,
      notes: initialData?.notes ?? '',
    },
  })

  const watchLuggage = watch('has_luggage')

  function syncEndDate(startValue: string) {
    const endValue = watch('broadcast_end')
    if (!startValue || !endValue) return
    const startDate = startValue.split('T')[0]
    const endTime = endValue.split('T')[1]
    if (!startDate || !endTime) return
    const synced = `${startDate}T${endTime}`
    if (synced !== endValue) setValue('broadcast_end', synced)
  }

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
        has_luggage: values.has_luggage,
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

      toast.success(isEdit ? '배차 의뢰가 수정되었습니다.' : '배차 의뢰서가 등록되었습니다.')
      router.push(`/schedules/${targetId}`)
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const border = 'border border-[var(--border-default)]'
  const labelCls = cn(
    border,
    'bg-[var(--bg-elevated)] px-2 md:px-3 py-[2px] md:py-3 font-bold text-[var(--text-secondary)] text-sm text-center flex items-center justify-center tracking-wider select-none'
  )
  const valueCls = cn(
    border,
    'px-3 py-[2px] md:py-3 bg-[var(--bg-surface)] text-[var(--text-primary)]'
  )
  const inputCls = cn(
    'w-full bg-transparent border-0 border-b rounded-none h-11 md:h-8 text-base md:text-sm px-1',
    'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
    'border-[var(--border-default)] focus:outline-none focus:border-purple-400 transition-colors'
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} onFocusCapture={handleFocusCapture} className="max-w-4xl mx-auto">
      <div
        className={cn(
          'rounded-2xl overflow-hidden border shadow-[0_10px_40px_rgba(0,0,0,0.35)]',
          'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)]'
        )}
      >
        <div className="hidden md:block relative py-5 text-center overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <div className="absolute inset-0 opacity-[0.08] bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.22)_0px,rgba(255,255,255,0.22)_1px,transparent_1px,transparent_8px)]" />
          <h1 className="relative text-2xl font-bold tracking-[0.5em] text-purple-200">
            배 차 의 뢰 서
          </h1>
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: 'var(--border-default)' }} />
        </div>

        <div>
          <div className="grid grid-cols-[78px_1fr] md:grid-cols-[112px_1fr_72px_152px] border-b border-[var(--border-default)]">
            <div className={cn(labelCls, 'whitespace-nowrap text-[11px] md:text-sm px-1')}>프로그램명</div>
            <div className={cn(valueCls, 'border-t-0 border-b-0')}>
              <input type="text" placeholder="프로그램명 입력" {...register('program_name')} className={cn(inputCls, errors.program_name && 'border-red-400')} />
              {errors.program_name && <p className="text-red-500 text-[11px] mt-0.5">{errors.program_name.message}</p>}
            </div>
            <div className={cn(labelCls, 'text-[11px] md:text-xs border-t md:border-t-0 border-b-0 px-1')}>담당PD</div>
            <div className={cn(valueCls, 'border-t md:border-t-0 border-b-0 border-r-0 px-2 md:px-3')}>
              <input type="text" placeholder="이름" {...register('responsible_pd')} className={cn(inputCls, errors.responsible_pd && 'border-red-400')} />
            </div>
          </div>

          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>이동 일시</div>
            <div className={cn(valueCls, 'border-l-0')}>
              <Controller
                control={control}
                name="broadcast_start"
                render={({ field }) => (
                  <DateTimePicker
                    value={field.value}
                    onChange={(v) => { field.onChange(v); syncEndDate(v) }}
                    error={!!errors.broadcast_start}
                  />
                )}
              />
              <div className="relative mt-2">
                <span className="block sm:absolute text-sm font-medium text-slate-500 pointer-events-none select-none text-center mb-1 sm:mb-0" style={{ left: 0, width: '130px' }}>~</span>
                <Controller
                  control={control}
                  name="broadcast_end"
                  render={({ field }) => (
                    <DateTimePicker value={field.value} onChange={field.onChange} hideDate anchorDate={(watch('broadcast_start') ?? '').split('T')[0]} error={!!errors.broadcast_end} />
                  )}
                />
              </div>
              {errors.broadcast_start && <p className="text-red-500 text-[11px] mt-1">{errors.broadcast_start.message}</p>}
              {errors.broadcast_end && <p className="text-red-500 text-[11px] mt-1">{errors.broadcast_end.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>목 적 지</div>
            <div className={cn(valueCls, 'border-l-0')}>
              <input type="text" placeholder="예: 서울 MBC 본관" {...register('venue')} className={cn(inputCls, errors.venue && 'border-red-400')} />
              {errors.venue && <p className="text-red-500 text-[11px] mt-0.5">{errors.venue.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>탑승 인원</div>
            <div className={cn(valueCls, 'border-l-0 flex items-center gap-3')}>
              <input type="number" min={1} {...register('passenger_count')} className={cn(inputCls, 'max-w-[80px]', errors.passenger_count && 'border-red-400')} />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>명</span>
              {errors.passenger_count && <p className="text-red-500 text-[11px]">{errors.passenger_count.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>짐/장비</div>
            <div className={cn(valueCls, 'border-l-0')}>
              <button
                type="button"
                onClick={() => setValue('has_luggage', !watchLuggage)}
                className="px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all"
                style={{
                  backgroundColor: watchLuggage ? '#1C0A2D' : 'var(--bg-elevated)',
                  borderColor: watchLuggage ? '#A855F7' : 'var(--border-default)',
                  color: watchLuggage ? '#C084FC' : 'var(--text-muted)',
                }}
              >
                {watchLuggage ? '있음' : '없음'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[112px_1fr]">
            <div className={cn(labelCls, 'border-b-0')}>특기사항</div>
            <div className={cn(valueCls, 'border-l-0 border-b-0 border-r-0')}>
              <Textarea
                placeholder="특기사항을 입력하세요..."
                {...register('notes')}
                className="border-0 rounded-none focus:ring-0 bg-transparent text-sm resize-none min-h-[110px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'left-0 right-0 z-30 px-4 border-t',
          isKeyboardOpen ? 'relative mt-5' : 'fixed bottom-0',
          'md:static md:relative md:mt-5 md:pb-0 md:bg-transparent md:border-0 md:shadow-none md:px-0',
        )}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
          paddingBottom: isKeyboardOpen
            ? 'env(safe-area-inset-bottom, 0px)'
            : 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        } as React.CSSProperties}
      >
        <div className="flex gap-3 py-3 justify-end">
          <Button type="button" variant="outline" onClick={goBack} className="min-h-11 px-6 border-[var(--border-default)] text-[var(--text-secondary)]">
            취소
          </Button>
          <Button type="submit" disabled={loading} className="min-h-11 px-8 text-white gap-2 font-semibold" style={{ backgroundColor: '#7C3AED' }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />{isEdit ? '수정 제출' : '의뢰 등록'}</>}
          </Button>
        </div>
      </div>
      {!isKeyboardOpen && (
        <div className="md:hidden" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }} />
      )}
    </form>
  )
}
