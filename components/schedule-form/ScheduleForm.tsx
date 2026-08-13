'use client'

import { useState, type CSSProperties } from 'react'
import { useNavRouter } from '@/lib/use-nav-router'
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
import type { OverlapEvent, Schedule } from '@/lib/types'
import { useMobileKeyboard } from '@/lib/use-mobile-keyboard'
import OverlapWarningDialog from '@/components/schedule-form/OverlapWarningDialog'

const schema = z.object({
  program_name: z.string().min(1, '프로그램명을 입력하세요'),
  responsible_pd: z.string().min(1, '담당 PD를 입력하세요'),
  broadcast_start: z.string().min(1, '제작 시작 시간을 입력하세요'),
  broadcast_end: z.string().min(1, '제작 종료 시간을 입력하세요'),
  broadcast_at: z.string().optional().default(''),
  venue: z.string().min(1, '녹화 장소를 입력하세요'),
  location: z.string().optional().default(''),
  use_relay_car: z.boolean().default(false),
  use_studio: z.boolean().default(false),
  use_eng: z.boolean().default(false),
  use_audio: z.boolean().default(false),
  is_live: z.boolean().default(false),
  record_content: z.string().optional().default(''),
  notes: z.string().optional().default(''),
}).refine(
  (data) => new Date(data.broadcast_end) > new Date(data.broadcast_start),
  { message: '종료 시간은 시작 시간보다 늦어야 합니다', path: ['broadcast_end'] }
)

type FormValues = z.infer<typeof schema>

interface ScheduleFormProps {
  initialData?: Partial<Schedule>
  scheduleId?: string
  prefillDate?: string // YYYY-MM-DD
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

/** 제작 시작 날짜가 바뀌면 종료 날짜를 같은 날로 맞추고, 종료≤시작이면 +1시간 */
function syncEndDateToStart(startIso: string, endIso: string): string {
  const startDate = startIso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return endIso

  const endTimeRaw = endIso.includes('T') ? endIso.split('T')[1]?.slice(0, 5) ?? '' : ''
  const endTime = /^\d{2}:\d{2}$/.test(endTimeRaw) ? endTimeRaw : '18:00'
  let next = `${startDate}T${endTime}`

  if (!endIso || new Date(next) <= new Date(startIso)) {
    const startTime = (startIso.split('T')[1] ?? '09:00').slice(0, 5)
    const [hs, ms] = startTime.split(':').map((x) => parseInt(x, 10))
    let h = (Number.isFinite(hs) ? hs : 9) + 1
    let m = Number.isFinite(ms) ? Math.round(ms / 5) * 5 : 0
    if (m >= 60) {
      h += 1
      m = 0
    }
    if (h > 23) {
      h = 23
      m = 55
    }
    next = `${startDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return next
}

export default function ScheduleForm({ initialData, scheduleId, prefillDate }: ScheduleFormProps) {
  const router = useNavRouter()
  const goBack = useAppBack('/calendar')
  const [loading, setLoading] = useState(false)
  const [overlapOpen, setOverlapOpen] = useState(false)
  const [overlaps, setOverlaps] = useState<OverlapEvent[]>([])
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null)
  const { isKeyboardOpen, handleFocusCapture } = useMobileKeyboard()
  const isEdit = !!scheduleId

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
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
      broadcast_at: toLocalIso(initialData?.broadcast_at),
      venue: initialData?.venue ?? '',
      location: initialData?.location ?? '',
      use_relay_car: initialData?.use_relay_car ?? false,
      use_studio: initialData?.use_studio ?? false,
      use_eng: initialData?.use_eng ?? false,
      use_audio: initialData?.use_audio ?? false,
      is_live: initialData?.is_live ?? false,
      record_content: initialData?.record_content ?? '',
      notes: initialData?.notes ?? '',
    },
  })

  const watchRelaycar = watch('use_relay_car')
  const watchStudio = watch('use_studio')
  const watchEng = watch('use_eng')
  const watchAudio = watch('use_audio')
  const watchLive = watch('is_live')

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    const broadcastStart = new Date(values.broadcast_start)
    const broadcastEnd = new Date(values.broadcast_end)

    const payload = {
      program_name: values.program_name,
      responsible_pd: values.responsible_pd,
      broadcast_start: broadcastStart.toISOString(),
      broadcast_end: broadcastEnd.toISOString(),
      broadcast_at: values.broadcast_at ? new Date(values.broadcast_at).toISOString() : null,
      rehearsal_staff_at: null,
      rehearsal_cast_at: null,
      venue: values.venue,
      location: values.location,
      use_relay_car: values.use_relay_car,
      use_studio: values.use_studio,
      use_eng: values.use_eng,
      use_audio: values.use_audio,
      is_live: values.is_live,
      record_content: values.record_content,
      notes: values.notes,
    }

    await submitSchedule(payload, false)
  }

  async function submitSchedule(payload: Record<string, unknown>, force: boolean) {
    setLoading(true)
    try {
      const url = isEdit ? `/api/schedules/${scheduleId}` : '/api/schedules'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, force }),
      })

      const data = await res.json() as { error?: string; conflicts?: OverlapEvent[]; id?: string }

      if (res.status === 409 && data.error === 'SCHEDULE_OVERLAP') {
        setPendingPayload(payload)
        setOverlaps(data.conflicts ?? [])
        setOverlapOpen(true)
        return
      }

      if (!res.ok) {
        throw new Error(data.error ?? '오류 발생')
      }

      setOverlapOpen(false)
      const targetId = isEdit ? scheduleId : data.id
      toast.success(isEdit ? '일정이 수정되었습니다.' : '녹화 의뢰서가 등록되었습니다.')
      router.push(`/schedules/${targetId}`)
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  /* ─── 스타일 상수 ─── */
  // 캘린더(다크 차콜 테마)와 동일한 CSS 변수 기반 스타일
  const border = 'border border-[var(--border-default)]'
  const labelCls = cn(
    border,
    'bg-[var(--bg-elevated)] px-2 md:px-3 py-[2px] md:py-3 font-bold text-[var(--text-secondary)] text-sm text-center flex items-center justify-center tracking-wider select-none'
  )
  const valueCls = cn(
    border,
    'py-[2px] md:py-3 bg-[var(--bg-surface)] text-[var(--text-primary)]'
  )
  /** 입력칸 왼쪽 여유 (기존 12px + 8px) — Tailwind 미적용 대비 인라인 */
  const valueStyle: CSSProperties = { paddingLeft: 5, paddingRight: 12 }
  const inputCls = cn(
    'w-full bg-transparent border-0 border-b rounded-none h-11 md:h-8 text-base md:text-sm',
    'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
    'border-[var(--border-default)] focus:outline-none focus:border-white/20 transition-colors'
  )
  const inputStyle: CSSProperties = { paddingLeft: 5, paddingRight: 4 }

  const resourceItems = [
    { label: '중계차', key: 'use_relay_car' as const, checked: watchRelaycar, activeColor: '#D97706', activeBg: '#2D1E00' },
    { label: '스튜디오', key: 'use_studio' as const, checked: watchStudio, activeColor: '#3B82F6', activeBg: '#0D1A35' },
    { label: 'ENG', key: 'use_eng' as const, checked: watchEng, activeColor: '#10B981', activeBg: '#07291C' },
    { label: 'AUDIO', key: 'use_audio' as const, checked: watchAudio, activeColor: '#A855F7', activeBg: '#1C0A2D' },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} onFocusCapture={handleFocusCapture} className="w-full">
      {/* 양식 카드 */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden border shadow-2xl',
          'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)]'
        )}
        style={{ marginBottom: 20, boxShadow: 'var(--shadow-float)' }}
      >

        {/* ── 제목 헤더 — 모바일에서는 숨김 (상단에 이미 "녹화 의뢰서 작성" 표시됨) ── */}
        <div className="hidden md:block relative py-5 text-center overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <div className="absolute inset-0 opacity-[0.08] bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.22)_0px,rgba(255,255,255,0.22)_1px,transparent_1px,transparent_8px)]" />
          <h1 className="relative text-2xl font-bold tracking-[0.5em]" style={{ color: 'var(--text-primary)' }}>
            녹 화 의 뢰 서
          </h1>
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: 'var(--border-default)' }} />
        </div>

        {/* ── 장비 선택 ── */}

        {/* 모바일: 풀너비 2×2 그리드 */}
        <div className="md:hidden border-b border-[var(--border-default)]" style={{ padding: '20px 16px 16px' }}>
          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '12px' }}>
            {resourceItems.map(({ label, key, checked, activeColor, activeBg }) => (
              <button
                key={key}
                type="button"
                onClick={() => setValue(key, !checked)}
                className="flex items-center justify-center rounded-xl font-bold tracking-wide transition-all border-2"
                style={{
                  minHeight: '64px',
                  fontSize: '17px',
                  backgroundColor: checked ? activeBg : 'var(--bg-elevated)',
                  borderColor: checked ? activeColor : 'var(--border-default)',
                  color: checked ? activeColor : 'var(--text-muted)',
                  boxShadow: checked ? `0 0 14px ${activeColor}40` : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex justify-end" style={{ marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setValue('is_live', !watchLive)}
              className="rounded-xl text-[15px] font-bold tracking-wide transition-all border-2"
              style={{
                padding: '6px 14px',
                backgroundColor: watchLive ? '#2D0A0A' : 'var(--bg-elevated)',
                borderColor: watchLive ? '#DC2626' : 'var(--border-default)',
                color: watchLive ? '#F87171' : 'var(--text-muted)',
                boxShadow: watchLive ? '0 0 10px #DC262633' : 'none',
              }}
            >
              생방송
            </button>
          </div>
        </div>

        {/* PC: 장비 선택 */}
        <div
          className="hidden md:flex flex-col border-b border-[var(--border-default)]"
          style={{ padding: '40px 20px 24px 20px', gap: '16px' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
            {resourceItems.map(({ label, key, checked, activeColor, activeBg }) => (
              <button
                key={key}
                type="button"
                onClick={() => setValue(key, !checked)}
                className="px-8 min-h-[80px] flex items-center justify-center rounded-xl text-[16px] font-bold tracking-wide transition-all border-2 min-w-[125px] text-center"
                style={{
                  backgroundColor: checked ? activeBg : 'var(--bg-elevated)',
                  borderColor: checked ? activeColor : 'var(--border-default)',
                  color: checked ? activeColor : 'var(--text-muted)',
                  boxShadow: checked ? `0 0 12px ${activeColor}40` : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setValue('is_live', !watchLive)}
              className="rounded-xl text-[14px] font-bold tracking-wide transition-all border-2"
              style={{
                padding: '6px 14px',
                backgroundColor: watchLive ? '#2D0A0A' : 'var(--bg-elevated)',
                borderColor: watchLive ? '#DC2626' : 'var(--border-default)',
                color: watchLive ? '#F87171' : 'var(--text-muted)',
                boxShadow: watchLive ? '0 0 10px #DC262633' : 'none',
              }}
            >
              생방송
            </button>
          </div>
        </div>

        {/* ── 본문 필드 ── */}
        <div>

          {/* 프로그램명 + 담당PD — 모바일에서는 두 행 */}
          <div className="grid grid-cols-[78px_1fr] md:grid-cols-[112px_1fr_72px_152px] border-b border-[var(--border-default)]">
            <div className={cn(labelCls, 'whitespace-nowrap text-[11px] md:text-sm tracking-normal md:tracking-wider px-1')}>
              <span className="md:hidden">프로그램명</span>
              <span className="hidden md:inline">프 로 그 램 명</span>
            </div>
            <div className={cn(valueCls, 'border-t-0 border-b-0')} style={valueStyle}>
              <input
                type="text"
                placeholder="프로그램명 입력"
                {...register('program_name')}
                className={cn(inputCls, errors.program_name && 'border-red-400 focus:border-red-400')}
                style={inputStyle}
              />
              {errors.program_name && (
                <p className="text-red-500 text-[11px] mt-0.5">{errors.program_name.message}</p>
              )}
            </div>
            <div className={cn(labelCls, 'text-[11px] md:text-xs border-t md:border-t-0 border-b-0 px-1')}>
              <span className="md:hidden">담당PD</span>
              <span className="hidden md:inline">담 당 P D</span>
            </div>
            <div className={cn(valueCls, 'border-t md:border-t-0 border-b-0 border-r-0')} style={valueStyle}>
              <input
                type="text"
                placeholder="이름"
                {...register('responsible_pd')}
                className={cn(inputCls, errors.responsible_pd && 'border-red-400 focus:border-red-400')}
                style={inputStyle}
              />
            </div>
          </div>

          {/* 제작 시작 일시 */}
          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>제작 시작</div>
            <div className={cn(valueCls, 'border-l-0')} style={valueStyle}>
              <Controller
                control={control}
                name="broadcast_start"
                render={({ field }) => (
                  <DateTimePicker
                    value={field.value}
                    onChange={(next) => {
                      const prevDate = field.value?.slice(0, 10) ?? ''
                      const nextDate = next.slice(0, 10)
                      field.onChange(next)
                      // 제작 시작 날짜가 바뀌면 제작 종료 날짜도 같은 날로 맞춤 (시간은 유지)
                      if (nextDate && nextDate !== prevDate) {
                        setValue(
                          'broadcast_end',
                          syncEndDateToStart(next, getValues('broadcast_end')),
                          { shouldDirty: true, shouldValidate: true }
                        )
                      }
                    }}
                    error={!!errors.broadcast_start}
                  />
                )}
              />
              {errors.broadcast_start && (
                <p className="text-red-500 text-[11px] mt-1">{errors.broadcast_start.message}</p>
              )}
            </div>
          </div>

          {/* 제작 종료 일시 */}
          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>제작 종료</div>
            <div className={cn(valueCls, 'border-l-0')} style={valueStyle}>
              <Controller
                control={control}
                name="broadcast_end"
                render={({ field }) => (
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                    error={!!errors.broadcast_end}
                  />
                )}
              />
              {errors.broadcast_end && (
                <p className="text-red-500 text-[11px] mt-1">{errors.broadcast_end.message}</p>
              )}
            </div>
          </div>

          {/* 방송일시 (ON-AIR) — 생방송 시 숨김 */}
          {!watchLive && (
            <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
              <div className={labelCls}>방 송 일 시</div>
              <div className={cn(valueCls, 'flex items-center gap-2 border-l-0')} style={valueStyle}>
                <Controller
                  control={control}
                  name="broadcast_at"
                  render={({ field }) => (
                    <DateTimePicker value={field.value ?? ''} onChange={field.onChange} />
                  )}
                />
              </div>
            </div>
          )}

          {/* 녹화내용 */}
          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>녹 화 내 용</div>
            <div className={cn(valueCls, 'border-l-0')} style={valueStyle}>
              <Textarea
                placeholder="녹화 내용을 입력하세요"
                {...register('record_content')}
                className="border-0 rounded-none focus:ring-0 bg-transparent text-sm resize-none min-h-[88px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                style={{ paddingLeft: 5 }}
              />
            </div>
          </div>

          {/* 녹화장소 */}
          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>녹 화 장 소</div>
            <div className={cn(valueCls, 'flex items-center gap-2 border-l-0')} style={valueStyle}>
              <input
                type="text"
                placeholder="예: 뉴스 부조정실"
                {...register('venue')}
                className={cn(inputCls, 'flex-1 text-sm', errors.venue && 'border-red-400 focus:border-red-400')}
                style={inputStyle}
              />
            </div>
          </div>

          {/* 특기사항 */}
          <div className="grid grid-cols-[112px_1fr]">
            <div className={cn(labelCls, 'border-b-0')}>특 기 사 항</div>
            <div className={cn(valueCls, 'border-l-0 border-b-0 border-r-0')} style={valueStyle}>
              <Textarea
                placeholder="특기사항 및 비고를 자유롭게 입력하세요"
                {...register('notes')}
                className="border-0 rounded-none focus:ring-0 bg-transparent text-sm resize-none min-h-[110px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                style={{ paddingLeft: 5 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단 액션 버튼 ── */}
      {/* 모바일: 하단 고정 바(탭바 위). 데스크톱: 투명 배경 + 폼과 간격 */}
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
            className="h-11 min-h-11 w-[7.5rem] border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
            style={{ backgroundColor: 'var(--bg-secondary-btn)' }}
          >
            취소
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="h-11 min-h-11 w-[7.5rem] font-semibold transition-all bg-white text-[#0A0A0A] hover:bg-zinc-200"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              isEdit ? '수정 제출' : '의뢰 등록'
            )}
          </Button>
        </div>
      </div>
      {/* 모바일에서 sticky 버튼 높이만큼 폼 하단 여백 확보 */}
      {!isKeyboardOpen && (
        <div className="md:hidden" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }} />
      )}
      <OverlapWarningDialog
        open={overlapOpen}
        overlaps={overlaps}
        loading={loading}
        onEdit={() => setOverlapOpen(false)}
        onForce={() => {
          if (pendingPayload) void submitSchedule(pendingPayload, true)
        }}
      />
    </form>
  )
}
