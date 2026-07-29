'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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

  const labelCls = 'text-sm font-medium text-zinc-300'
  const inputCls = cn(
    'w-full rounded-lg border border-white/[0.14] bg-white/[0.03]',
    'px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600',
    'focus:outline-none focus:border-white/30 focus:bg-white/[0.04]',
    'disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full sm:max-w-[540px] border-white/[0.12] p-0 gap-0 overflow-hidden rounded-xl"
        style={{ backgroundColor: '#111111' }}
      >
        <DialogHeader className="px-7 pt-7 pb-5 border-b border-white/[0.08]">
          <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-50 pr-8">
            {canEdit ? (isEdit ? '송출/행정 일정 수정' : '송출/행정 일정 등록') : '송출/행정 일정'}
          </DialogTitle>
        </DialogHeader>

        <div className="px-7 py-6 flex flex-col gap-5 max-h-[min(70vh,640px)] overflow-y-auto">
          <label className="flex flex-col gap-2">
            <span className={labelCls}>제목 *</span>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              placeholder="일정 제목"
            />
          </label>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
            <span className={labelCls}>하루 종일</span>
            <Switch checked={allDay} onCheckedChange={setAllDay} disabled={!canEdit} />
          </div>

          {allDay ? (
            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className={labelCls}>시작일</span>
                <input
                  type="date"
                  className={inputCls}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className={labelCls}>종료일</span>
                <input
                  type="date"
                  className={inputCls}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={!canEdit}
                />
              </label>
            </div>
          ) : (
            <div className={cn('flex flex-col gap-5', !canEdit && 'pointer-events-none opacity-70')}>
              <div className="flex flex-col gap-2">
                <span className={labelCls}>시작</span>
                <DateTimePicker value={startLocal} onChange={setStartLocal} comfortable />
              </div>
              <div className="flex flex-col gap-2">
                <span className={labelCls}>종료</span>
                <DateTimePicker value={endLocal} onChange={setEndLocal} comfortable />
              </div>
            </div>
          )}

          <label className="flex flex-col gap-2">
            <span className={labelCls}>위치 / 장소</span>
            <input
              className={inputCls}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={!canEdit}
              placeholder="장소"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={labelCls}>설명 / 메모</span>
            <textarea
              className={cn(inputCls, 'min-h-[96px] resize-y leading-relaxed')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
              placeholder="메모"
            />
          </label>

          <div className="flex flex-col gap-2 pt-1">
            <span className={labelCls}>작성자</span>
            <span className="text-sm text-zinc-400">{authorLabel}</span>
          </div>
        </div>

        <DialogFooter className="px-7 py-5 border-t border-white/[0.08] flex-row items-center gap-3 sm:justify-between bg-white/[0.015]">
          {canEdit && isEdit ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-4 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
              disabled={deleting || saving}
              onClick={handleDelete}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : '삭제'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3 ml-auto">
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              onClick={() => onOpenChange(false)}
            >
              {canEdit ? '취소' : '닫기'}
            </Button>
            {canEdit && (
              <Button
                type="button"
                disabled={saving || deleting}
                onClick={handleSave}
                className="h-10 px-5 rounded-lg bg-zinc-100 text-zinc-900 hover:bg-white font-medium"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
