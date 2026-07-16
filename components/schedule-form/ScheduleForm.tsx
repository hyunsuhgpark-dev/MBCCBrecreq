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

export default function ScheduleForm({ initialData, scheduleId, prefillDate }: ScheduleFormProps) {
  const router = useRouter()
  const goBack = useAppBack('/calendar')
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
    'px-3 py-[2px] md:py-3 bg-[var(--bg-surface)] text-[var(--text-primary)]'
  )
  const inputCls = cn(
    'w-full bg-transparent border-0 border-b rounded-none h-11 md:h-8 text-base md:text-sm px-1',
    'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
    'border-[var(--border-default)] focus:outline-none focus:border-[var(--accent)] transition-colors'
  )

  const resourceItems = [
    { label: '중계차', key: 'use_relay_car' as const, checked: watchRelaycar, activeColor: '#D97706', activeBg: '#2D1E00' },
    { label: '스튜디오', key: 'use_studio' as const, checked: watchStudio, activeColor: '#3B82F6', activeBg: '#0D1A35' },
    { label: 'ENG', key: 'use_eng' as const, checked: watchEng, activeColor: '#10B981', activeBg: '#07291C' },
    { label: 'AUDIO', key: 'use_audio' as const, checked: watchAudio, activeColor: '#A855F7', activeBg: '#1C0A2D' },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} onFocusCapture={handleFocusCapture} className="max-w-4xl mx-auto">
      {/* 양식 카드 */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden border shadow-[0_10px_40px_rgba(0,0,0,0.35)]',
          'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)]'
        )}
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
              className="px-5 py-2.5 rounded-xl text-[15px] font-bold tracking-wide transition-all border-2"
              style={{
                backgroundColor: watchLive ? '#2D0A0A' : 'var(--bg-elevated)',
                borderColor: watchLive ? '#DC2626' : 'var(--border-default)',
                color: watchLive ? '#F87171' : 'var(--text-muted)',
                boxShadow: watchLive ? '0 0 10px #DC262633' : 'none',
              }}
            >
              🔴 생방송
            </button>
          </div>
        </div>

        {/* PC: 기존 70%/30% 레이아웃 + 오류 신고 */}
        <div className="hidden md:grid grid-cols-[70%_30%] border-b border-[var(--border-default)]">
          <div
            className="border-r border-[var(--border-default)] flex flex-col justify-between"
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
                className="px-5 py-2.5 rounded-xl text-[14px] font-bold tracking-wide transition-all border-2"
                style={{
                  backgroundColor: watchLive ? '#2D0A0A' : 'var(--bg-elevated)',
                  borderColor: watchLive ? '#DC2626' : 'var(--border-default)',
                  color: watchLive ? '#F87171' : 'var(--text-muted)',
                  boxShadow: watchLive ? '0 0 10px #DC262633' : 'none',
                }}
              >
                🔴 생방송
              </button>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="px-3 py-2 text-xs font-bold text-center tracking-widest" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              프로그램 오류 신고
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-3 py-4 gap-1" style={{ backgroundColor: 'var(--bg-surface)' }}>
              <p className="text-sm font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>박현서</p>
              <p className="text-sm font-medium tracking-wider" style={{ color: 'var(--text-primary)' }}>010-4523-0464</p>
            </div>
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
            <div className={cn(valueCls, 'border-t-0 border-b-0')}>
              <input
                type="text"
                placeholder="프로그램명 입력"
                {...register('program_name')}
                className={cn(inputCls, errors.program_name && 'border-red-400 focus:border-red-400')}
              />
              {errors.program_name && (
                <p className="text-red-500 text-[11px] mt-0.5">{errors.program_name.message}</p>
              )}
            </div>
            <div className={cn(labelCls, 'text-[11px] md:text-xs border-t md:border-t-0 border-b-0 px-1')}>
              <span className="md:hidden">담당PD</span>
              <span className="hidden md:inline">담 당 P D</span>
            </div>
            <div className={cn(valueCls, 'border-t md:border-t-0 border-b-0 border-r-0 px-2 md:px-3')}>
              <input
                type="text"
                placeholder="이름"
                {...register('responsible_pd')}
                className={cn(inputCls, errors.responsible_pd && 'border-red-400 focus:border-red-400')}
              />
            </div>
          </div>

          {/* 제작일시 */}
          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>제 작 일 시</div>
            <div className={cn(valueCls, 'border-l-0')}>
              {/* 시작 시각 */}
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="broadcast_start"
                  render={({ field }) => (
                    <DateTimePicker
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v)
                        syncEndDate(v)
                      }}
                      error={!!errors.broadcast_start}
                    />
                  )}
                />
              </div>
              {/* 종료 시각 — hideDate + spacer 덕분에 오전/오후·시·분이 시작 시각과 열 정렬됨 */}
              <div className="relative mt-2">
                {/* ~ 를 spacer 위에 절대 배치하여 날짜 열에 겹침 */}
                <span
                  className="block sm:absolute text-sm font-medium text-slate-500 pointer-events-none select-none text-center mb-1 sm:mb-0"
                  style={{ left: 0, width: '130px' }}
                >
                  ~
                </span>
                <Controller
                  control={control}
                  name="broadcast_end"
                  render={({ field }) => (
                    <DateTimePicker
                      value={field.value}
                      onChange={field.onChange}
                      hideDate
                      anchorDate={(watch('broadcast_start') ?? '').split('T')[0]}
                      error={!!errors.broadcast_end}
                    />
                  )}
                />
              </div>
              {errors.broadcast_start && (
                <p className="text-red-500 text-[11px] mt-1">{errors.broadcast_start.message}</p>
              )}
              {errors.broadcast_end && (
                <p className="text-red-500 text-[11px] mt-1">{errors.broadcast_end.message}</p>
              )}
            </div>
          </div>

          {/* 방송일시 (ON-AIR) — 생방송 시 숨김 */}
          {!watchLive && (
            <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
              <div className={labelCls}>방 송 일 시</div>
              <div className={cn(valueCls, 'flex items-center gap-2 border-l-0')}>
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
            <div className={cn(valueCls, 'border-l-0')}>
              <Textarea
                placeholder="녹화 내용을 입력하세요"
                {...register('record_content')}
                className="border-0 rounded-none focus:ring-0 bg-transparent text-sm resize-none min-h-[88px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          {/* 녹화장소 */}
          <div className="grid grid-cols-[112px_1fr] border-b border-[var(--border-default)]">
            <div className={labelCls}>녹 화 장 소</div>
            <div className={cn(valueCls, 'flex items-center gap-2 border-l-0')}>
              <input
                type="text"
                placeholder="예: 뉴스 부조정실"
                {...register('venue')}
                className={cn(inputCls, 'flex-1 text-sm', errors.venue && 'border-red-400 focus:border-red-400')}
              />
            </div>
          </div>

          {/* 특기사항 */}
          <div className="grid grid-cols-[112px_1fr]">
            <div className={cn(labelCls, 'border-b-0')}>특 기 사 항</div>
            <div className={cn(valueCls, 'border-l-0 border-b-0 border-r-0')}>
              <Textarea
                placeholder="특기사항 및 비고를 자유롭게 입력하세요"
                {...register('notes')}
                className="border-0 rounded-none focus:ring-0 bg-transparent text-sm resize-none min-h-[110px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단 액션 버튼 ── */}
      {/* 모바일: 화면 하단 고정 (하단 탭바 위에 위치) */}
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
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            className="min-h-11 px-6 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-all"
          >
            취소
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="min-h-11 px-8 text-white gap-2 font-semibold shadow-md hover:shadow-lg transition-all"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                {isEdit ? '수정 제출' : '의뢰 등록'}
              </>
            )}
          </Button>
        </div>
      </div>
      {/* 모바일에서 sticky 버튼 높이만큼 폼 하단 여백 확보 */}
      {!isKeyboardOpen && (
        <div className="md:hidden" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }} />
      )}
    </form>
  )
}
