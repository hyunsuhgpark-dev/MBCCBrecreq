'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import DateTimePicker from '@/components/ui/DateTimePicker'
import type { OfficeEvent, Profile } from '@/lib/types'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = {
  Admin: '관리자',
  ENG: '기술국',
  'ENG-M': '기술(모니터)',
  Staff_Office: '기술국',
}

interface OfficeEventModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
  /** 등록 시 프리필 날짜 YYYY-MM-DD */
  defaultDate?: string
  /** 수정 모드 */
  event?: OfficeEvent | null
  onSaved?: () => void
  /** false면 읽기 전용 */
  canEdit?: boolean
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  // 2026-07-29T14:00:00+09:00 → 2026-07-29T14:00
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 16)
  }
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** UTC toISOString 날짜 밀림 방지 — Asia/Seoul 기준 YYYY-MM-DD */
function todayYmdSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function normalizeYmd(value?: string | null): string | null {
  if (!value) return null
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

export function OfficeEventModal({
  open,
  onOpenChange,
  profile,
  defaultDate,
  event,
  onSaved,
  canEdit = true,
}: OfficeEventModalProps) {
  const isEdit = Boolean(event?.id)
  const [title, setTitle] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [startLocal, setStartLocal] = useState('')
  const [endLocal, setEndLocal] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (event?.id) {
      setTitle(event.title)
      setAllDay(event.all_day)
      setLocation(event.location ?? '')
      setDescription(event.description ?? '')
      if (event.all_day) {
        const sd = normalizeYmd(event.start_date) ?? ''
        const ed = normalizeYmd(event.end_date) ?? sd
        setStartDate(sd)
        setEndDate(ed)
        setStartLocal('')
        setEndLocal('')
      } else {
        setStartLocal(toLocalInput(event.start_at))
        setEndLocal(toLocalInput(event.end_at))
        setStartDate('')
        setEndDate('')
      }
    } else {
      // 등록: 클릭한 셀 날짜를 시작/종료 기본값으로 (UTC slice 사용 금지)
      const d = normalizeYmd(defaultDate) ?? todayYmdSeoul()
      setTitle('')
      setAllDay(false)
      setLocation('')
      setDescription('')
      setStartLocal(`${d}T09:00`)
      setEndLocal(`${d}T10:00`)
      setStartDate(d)
      setEndDate(d)
    }
  }, [open, event, defaultDate])

  const authorLabel = isEdit
    ? `${event?.author_name ?? ''}${event?.author_role ? ` · ${ROLE_LABELS[event.author_role] ?? event.author_role}` : ''}`
    : `${profile.full_name ?? ''}${profile.role ? ` · ${ROLE_LABELS[profile.role] ?? profile.role}` : ''}`

  async function handleSave() {
    if (!canEdit) return
    if (!title.trim()) {
      toast.error('제목을 입력하세요')
      return
    }
    setSaving(true)
    try {
      const payload = allDay
        ? {
            title: title.trim(),
            all_day: true,
            start_date: startDate,
            end_date: endDate || startDate,
            location: location.trim() || null,
            description: description.trim() || null,
          }
        : {
            title: title.trim(),
            all_day: false,
            start_at: startLocal,
            end_at: endLocal,
            location: location.trim() || null,
            description: description.trim() || null,
          }

      const res = await fetch(
        isEdit ? `/api/office-events/${event!.id}` : '/api/office-events',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? '저장 실패')
        return
      }
      if (data.syncError) {
        toast.warning('저장됨 · Google 동기화는 다음에 재시도됩니다')
      } else {
        toast.success(isEdit ? '일정을 수정했습니다' : '일정을 등록했습니다')
      }
      onOpenChange(false)
      onSaved?.()
    } catch {
      toast.error('저장 중 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!canEdit || !event?.id) return
    if (!confirm('이 일정을 삭제할까요? Google 캘린더에서도 삭제됩니다.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/office-events/${event.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok && !data.ok) {
        toast.error(data.error ?? data.syncError ?? '삭제 실패')
        return
      }
      toast.success('일정을 삭제했습니다')
      onOpenChange(false)
      onSaved?.()
    } catch {
      toast.error('삭제 중 오류가 발생했습니다')
    } finally {
      setDeleting(false)
    }
  }

  const labelCls = 'block text-sm font-medium text-zinc-300'
  const inputCls = cn(
    'box-border w-full rounded-md border border-white/15 bg-zinc-900/80',
    'px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500',
    'focus:outline-none focus:border-white/30',
    'disabled:opacity-60 disabled:cursor-not-allowed'
  )
  const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: 5 }
  const stackStyle = { display: 'flex', flexDirection: 'column' as const, gap: 14 }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          '!p-0 flex w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-xl border border-white/15',
          'sm:!max-w-[560px]',
        )}
        style={{ backgroundColor: '#111111' }}
      >
        {/* 패딩·간격은 인라인으로 강제 (Tailwind 유틸이 안 먹는 경우 대비) */}
        <div className="box-border w-full" style={{ padding: '14px 20px 16px' }}>
          <DialogHeader className="pr-8 text-left" style={{ marginBottom: 14 }}>
            <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-50">
              {canEdit ? (isEdit ? '송출/행정 일정 수정' : '송출/행정 일정 등록') : '송출/행정 일정'}
            </DialogTitle>
          </DialogHeader>

          <div
            className="max-h-[min(65vh,560px)] overflow-y-auto overflow-x-hidden"
            style={stackStyle}
          >
            <div style={fieldStyle}>
              <label className={labelCls} htmlFor="office-title">제목 *</label>
              <input
                id="office-title"
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEdit}
                placeholder="일정 제목"
              />
            </div>

            <div
              className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03]"
              style={{ padding: '7px 8px' }}
            >
              <span className="text-sm font-medium text-zinc-300">하루 종일</span>
              <Switch checked={allDay} onCheckedChange={setAllDay} disabled={!canEdit} />
            </div>

            {allDay ? (
              <div style={stackStyle}>
                <div style={fieldStyle}>
                  <label className={labelCls} htmlFor="office-start-date">시작일</label>
                  <input
                    id="office-start-date"
                    type="date"
                    className={inputCls}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div style={fieldStyle}>
                  <label className={labelCls} htmlFor="office-end-date">종료일</label>
                  <input
                    id="office-end-date"
                    type="date"
                    className={inputCls}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            ) : (
              <div
                className={cn(!canEdit && 'pointer-events-none opacity-70')}
                style={stackStyle}
              >
                <div style={fieldStyle}>
                  <span className={labelCls}>시작</span>
                  <DateTimePicker value={startLocal} onChange={setStartLocal} comfortable />
                </div>
                <div style={fieldStyle}>
                  <span className={labelCls}>종료</span>
                  <DateTimePicker value={endLocal} onChange={setEndLocal} comfortable />
                </div>
              </div>
            )}

            <div style={fieldStyle}>
              <label className={labelCls} htmlFor="office-location">위치 / 장소</label>
              <input
                id="office-location"
                className={inputCls}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={!canEdit}
                placeholder="장소"
              />
            </div>

            <div style={fieldStyle}>
              <label className={labelCls} htmlFor="office-desc">설명 / 메모</label>
              <textarea
                id="office-desc"
                className={cn(inputCls, 'min-h-[88px] resize-y leading-relaxed')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                placeholder="메모"
              />
            </div>

            <div style={fieldStyle}>
              <span className={labelCls}>작성자</span>
              <p className="text-sm text-zinc-400">{authorLabel}</p>
            </div>
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center gap-2.5"
            style={{
              marginTop: 16,
              justifyContent: canEdit && isEdit ? 'space-between' : 'flex-end',
            }}
          >
            {canEdit && isEdit ? (
              <button
                type="button"
                disabled={deleting || saving}
                onClick={handleDelete}
                className="rounded-lg px-4 py-2 text-sm text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-rose-400 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : '삭제'}
              </button>
            ) : null}

            <div className="ml-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="min-h-[38px] min-w-[80px] rounded-lg border border-white/20 bg-transparent px-5 text-sm text-zinc-300 transition-colors hover:border-white/30 hover:bg-white/[0.04] hover:text-zinc-100"
              >
                {canEdit ? '취소' : '닫기'}
              </button>
              {canEdit && (
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={handleSave}
                  className="min-h-[38px] min-w-[80px] rounded-lg bg-zinc-100 px-5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : '저장'}
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
