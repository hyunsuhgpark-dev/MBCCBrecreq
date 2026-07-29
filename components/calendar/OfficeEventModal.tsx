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

  const inputCls =
    'w-full h-9 rounded border border-white/[0.12] bg-transparent px-3 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-white/25'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[440px] border-white/[0.12] p-0 gap-0"
        style={{ backgroundColor: '#0F0F0F' }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/[0.08]">
          <DialogTitle className="text-[15px] font-semibold text-zinc-100">
            {canEdit ? (isEdit ? '송출/행정 일정 수정' : '송출/행정 일정 등록') : '송출/행정 일정'}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500">제목 *</span>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              placeholder="일정 제목"
            />
          </label>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-500">하루 종일</span>
            <Switch checked={allDay} onCheckedChange={setAllDay} disabled={!canEdit} />
          </div>

          {allDay ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-zinc-500">시작일</span>
                <input
                  type="date"
                  className={inputCls}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-zinc-500">종료일</span>
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
            <div className={cn('flex flex-col gap-3', !canEdit && 'pointer-events-none opacity-70')}>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-zinc-500">시작</span>
                <DateTimePicker value={startLocal} onChange={setStartLocal} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-zinc-500">종료</span>
                <DateTimePicker value={endLocal} onChange={setEndLocal} />
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500">위치 / 장소</span>
            <input
              className={inputCls}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={!canEdit}
              placeholder="장소"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500">설명 / 메모</span>
            <textarea
              className="w-full min-h-[72px] rounded border border-white/[0.12] bg-transparent px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-white/25 resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
              placeholder="메모"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-zinc-500">작성자</span>
            <span className="text-[13px] text-zinc-400">{authorLabel}</span>
          </div>
        </div>

        <DialogFooter className="px-5 py-4 border-t border-white/[0.08] flex-row gap-2 sm:justify-between">
          {canEdit && isEdit ? (
            <Button
              type="button"
              variant="ghost"
              className="text-rose-400 hover:text-rose-300"
              disabled={deleting || saving}
              onClick={handleDelete}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : '삭제'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {canEdit ? '취소' : '닫기'}
            </Button>
            {canEdit && (
              <Button type="button" disabled={saving || deleting} onClick={handleSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
