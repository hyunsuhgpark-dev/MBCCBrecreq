'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type SubmitHandler, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import DateTimePicker from '@/components/ui/DateTimePicker'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Schedule } from '@/lib/types'

const schema = z.object({
  program_name: z.string().min(1, '프로그램명을 입력하세요'),
  responsible_pd: z.string().min(1, '담당 PD를 입력하세요'),
  broadcast_start: z.string().min(1, '제작 시작 시간을 입력하세요'),
  duration_hours: z.number().min(1).max(24).default(2),
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
})

type FormValues = z.infer<typeof schema>

interface ScheduleFormProps {
  initialData?: Partial<Schedule>
  scheduleId?: string
}

function toLocalIso(dt: string | null | undefined): string {
  if (!dt) return ''
  const d = new Date(dt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function computeDuration(start?: string | null, end?: string | null): number {
  if (!start || !end) return 2
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, Math.min(24, Math.round(diff / (1000 * 60 * 60))))
}

export default function ScheduleForm({ initialData, scheduleId }: ScheduleFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
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
      broadcast_start: toLocalIso(initialData?.broadcast_start),
      duration_hours: computeDuration(initialData?.broadcast_start, initialData?.broadcast_end),
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
  const watchDuration = watch('duration_hours')

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setLoading(true)
    try {
      const broadcastStart = new Date(values.broadcast_start)
      const broadcastEnd = new Date(broadcastStart.getTime() + values.duration_hours * 60 * 60 * 1000)

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
  // 셀 테두리: 부드러운 slate 계열
  const border = 'border border-slate-200'
  // 라벨 셀: 브랜드 블루 미묘한 틴트
  const labelCls = cn(border, 'bg-[#EEF3FB] px-3 py-2 font-bold text-[#1a3a6b] text-sm text-center flex items-center justify-center tracking-wider select-none')
  // 값 셀
  const valueCls = cn(border, 'px-3 py-2 bg-white')
  // 텍스트 입력
  const inputCls = 'w-full bg-transparent border-0 border-b border-slate-200 rounded-none h-8 text-sm px-1 text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-[#004F9A] transition-colors'

  const checkboxItems = [
    { label: '중 계 차', key: 'use_relay_car' as const, checked: watchRelaycar },
    { label: '스튜디오', key: 'use_studio' as const, checked: watchStudio },
    { label: 'E  N  G', key: 'use_eng' as const, checked: watchEng },
    { label: 'A U D I O', key: 'use_audio' as const, checked: watchAudio },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl mx-auto">
      {/* 양식 카드 */}
      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-[0_4px_24px_rgba(0,79,154,0.08)]">

        {/* ── 제목 헤더 ── */}
        <div className="relative bg-[#004F9A] py-5 text-center overflow-hidden">
          {/* 배경 워터마크 느낌 */}
          <div className="absolute inset-0 opacity-[0.06] bg-[repeating-linear-gradient(45deg,#fff_0px,#fff_1px,transparent_1px,transparent_8px)]" />
          <h1 className="relative text-2xl font-bold tracking-[0.5em] text-white drop-shadow-sm">
            녹 화 의 뢰 서
          </h1>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </div>

        {/* ── 장비 체크박스(세로) + 오류 신고 결재란 ── */}
        <div className="grid grid-cols-[70%_30%] border-b border-slate-200">
          {/* 왼쪽 70%: 세로 체크박스 */}
          <div className="border-r border-slate-200">
            {checkboxItems.map(({ label, key, checked }, i) => (
              <div
                key={key}
                className={cn(
                  'grid grid-cols-[112px_1fr] items-center',
                  i > 0 && 'border-t border-slate-200'
                )}
              >
                <div className={cn(labelCls, 'border-0 border-r border-slate-200 h-full text-xs')}>
                  {label}
                </div>
                <div className="px-4 py-2.5">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => setValue(key, !!v)}
                    className="border-slate-400 data-[state=checked]:bg-[#004F9A] data-[state=checked]:border-[#004F9A]"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 오른쪽 30%: 오류 신고 결재란 */}
          <div className="flex flex-col">
            <div className="bg-[#004F9A] px-3 py-2 text-xs font-bold text-center text-white tracking-widest">
              프로그램 오류 신고
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-3 py-4 bg-[#EEF3FB] gap-1">
              <p className="text-sm font-bold text-[#1a3a6b] tracking-wide">박현서</p>
              <p className="text-sm text-[#004F9A] font-medium tracking-wider">010-4523-0464</p>
            </div>
          </div>
        </div>

        {/* ── 본문 필드 ── */}
        <div>

          {/* 프로그램명 + 담당PD */}
          <div className="grid grid-cols-[112px_1fr_72px_152px] border-b border-slate-200">
            <div className={labelCls}>프 로 그 램 명</div>
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
            <div className={cn(labelCls, 'text-xs border-t-0 border-b-0')}>담 당 P D</div>
            <div className={cn(valueCls, 'border-t-0 border-b-0 border-r-0')}>
              <input
                type="text"
                placeholder="담당 PD 이름"
                {...register('responsible_pd')}
                className={cn(inputCls, errors.responsible_pd && 'border-red-400 focus:border-red-400')}
              />
            </div>
          </div>

          {/* 제작일시 */}
          <div className="grid grid-cols-[112px_1fr] border-b border-slate-200">
            <div className={labelCls}>제 작 일 시</div>
            <div className={cn(valueCls, 'flex items-center gap-3 flex-wrap py-2.5 border-l-0')}>
              <Controller
                control={control}
                name="broadcast_start"
                render={({ field }) => (
                  <DateTimePicker value={field.value} onChange={field.onChange} error={!!errors.broadcast_start} />
                )}
              />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 whitespace-nowrap">제작시간</span>
                <select
                  value={watchDuration}
                  onChange={(e) => setValue('duration_hours', Number(e.target.value))}
                  className="border border-slate-200 rounded-md text-sm h-8 px-2 bg-white text-slate-700 focus:outline-none focus:border-[#004F9A] focus:ring-1 focus:ring-[#004F9A]/20 cursor-pointer transition-colors"
                >
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>{h}시간</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <Checkbox
                  checked={watchLive}
                  onCheckedChange={(v) => setValue('is_live', !!v)}
                  className="border-red-300 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                />
                <span className="text-sm font-semibold text-red-500 group-hover:text-red-600 transition-colors">생방송</span>
              </label>
              {errors.broadcast_start && (
                <p className="text-red-500 text-[11px] w-full">{errors.broadcast_start.message}</p>
              )}
            </div>
          </div>

          {/* 방송일시 (ON-AIR) — 생방송 시 숨김 */}
          {!watchLive && (
            <div className="grid grid-cols-[112px_1fr] border-b border-slate-200">
              <div className={labelCls}>방 송 일 시</div>
              <div className={cn(valueCls, 'flex items-center gap-2 py-2.5 border-l-0')}>
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
          <div className="grid grid-cols-[112px_1fr] border-b border-slate-200">
            <div className={labelCls}>녹 화 내 용</div>
            <div className={cn(valueCls, 'border-l-0')}>
              <Textarea
                placeholder="녹화 내용을 입력하세요..."
                {...register('record_content')}
                className="border-0 rounded-none focus:ring-0 bg-transparent text-sm resize-none min-h-[80px] text-slate-800 placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* 녹화장소 */}
          <div className="grid grid-cols-[112px_1fr] border-b border-slate-200">
            <div className={labelCls}>녹 화 장 소</div>
            <div className={cn(valueCls, 'flex items-center gap-2 border-l-0')}>
              <input
                type="text"
                placeholder="예: 지하 1층 청주 스튜디오"
                {...register('venue')}
                className={cn(inputCls, 'flex-1', errors.venue && 'border-red-400 focus:border-red-400')}
              />
              <span className="text-xs text-slate-300 whitespace-nowrap">자원ID</span>
              <input
                type="text"
                placeholder="내부 코드"
                {...register('location')}
                className={cn(inputCls, 'max-w-[120px]')}
              />
            </div>
          </div>

          {/* 특기사항 */}
          <div className="grid grid-cols-[112px_1fr]">
            <div className={cn(labelCls, 'border-b-0')}>특 기 사 항</div>
            <div className={cn(valueCls, 'border-l-0 border-b-0 border-r-0')}>
              <Textarea
                placeholder={`특기사항 및 비고를 자유롭게 입력하세요.\n예: 후보자 2명 출연 예정 / 사회자 이황주`}
                {...register('notes')}
                className="border-0 rounded-none focus:ring-0 bg-transparent text-sm resize-none min-h-[100px] text-slate-800 placeholder:text-slate-300"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단 액션 버튼 ── */}
      <div className="flex gap-3 mt-5 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          className="min-h-11 px-6 border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          취소
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="min-h-11 px-8 bg-[#004F9A] hover:bg-[#003A73] text-white gap-2 font-semibold shadow-md hover:shadow-lg transition-all"
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
    </form>
  )
}
