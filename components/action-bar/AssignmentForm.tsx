'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, Car, Plus } from 'lucide-react'
import type { AssignmentVehicle } from '@/lib/types'

interface AssignmentFormProps {
  scheduleId: string
  onComplete?: () => void
}

const emptyVehicle = (): AssignmentVehicle => ({
  driver_name: '',
  vehicle_info: '',
  contact: '',
})

export default function AssignmentForm({ scheduleId, onComplete }: AssignmentFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [vehicleCount, setVehicleCount] = useState(1)
  const [vehicles, setVehicles] = useState<AssignmentVehicle[]>([emptyVehicle()])
  const [directorAccompany, setDirectorAccompany] = useState(false)
  const [notes, setNotes] = useState('')

  function updateCount(count: number) {
    const n = Math.max(1, Math.min(10, count))
    setVehicleCount(n)
    setVehicles((prev) => {
      if (prev.length === n) return prev
      if (prev.length < n) {
        return [...prev, ...Array.from({ length: n - prev.length }, emptyVehicle)]
      }
      return prev.slice(0, n)
    })
  }

  function updateVehicle(index: number, field: keyof AssignmentVehicle, value: string) {
    setVehicles((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  async function handleSubmit() {
    const invalid = vehicles.some((v) => !v.driver_name.trim())
    if (invalid) {
      toast.error('모든 차량의 기사명을 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_vehicles: vehicles.map((v) => ({
            driver_name: v.driver_name.trim(),
            vehicle_info: v.vehicle_info?.trim() || undefined,
            contact: v.contact?.trim() || undefined,
          })),
          assignment_director_accompany: directorAccompany,
          assignment_notes: notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? '배정 실패')
      toast.success('차량 배정이 완료되었습니다.')
      router.refresh()
      onComplete?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border rounded-xl p-4 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
      <div className="flex items-center gap-2">
        <Car className="w-5 h-5 text-purple-300 shrink-0" />
        <div>
          <p className="font-semibold text-[var(--text-primary)] text-sm">배정 회신</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>차량·기사 정보를 입력하면 PD에게 알림이 발송됩니다.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-[var(--text-secondary)]">배정 차량 수</label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => updateCount(vehicleCount - 1)} disabled={vehicleCount <= 1} className="h-11 w-11 p-0 text-lg touch-manipulation">−</Button>
          <span className="w-8 text-center font-bold">{vehicleCount}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => updateCount(vehicleCount + 1)} disabled={vehicleCount >= 10} className="h-11 w-11 p-0 text-lg touch-manipulation">+</Button>
        </div>
      </div>

      <div className="space-y-3">
        {vehicles.map((vehicle, i) => (
          <div key={i} className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-elevated)' }}>
            <p className="text-xs font-bold text-purple-300">차량 {i + 1}</p>
            <input
              type="text"
              placeholder="기사명 (필수)"
              value={vehicle.driver_name}
              onChange={(e) => updateVehicle(i, 'driver_name', e.target.value)}
              className="w-full h-11 px-3 rounded-lg text-sm bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="차량번호/종류 (선택)"
                value={vehicle.vehicle_info ?? ''}
                onChange={(e) => updateVehicle(i, 'vehicle_info', e.target.value)}
                autoComplete="off"
                className="h-11 px-3 rounded-lg text-base sm:text-sm bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <input
                type="tel"
                inputMode="tel"
                placeholder="연락처 (선택)"
                value={vehicle.contact ?? ''}
                onChange={(e) => updateVehicle(i, 'contact', e.target.value)}
                autoComplete="tel"
                className="h-11 px-3 rounded-lg text-base sm:text-sm bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={directorAccompany}
          onChange={(e) => setDirectorAccompany(e.target.checked)}
          className="rounded border-[var(--border-default)]"
        />
        <span className="text-sm text-[var(--text-secondary)]">영상감독 동행</span>
      </label>

      <Textarea
        placeholder="배정 메모 (선택)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="min-h-[72px] text-sm bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />

      <Button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full min-h-14 font-bold text-base gap-2 rounded-xl bg-white text-[#0A0A0A] hover:bg-zinc-200 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" />배정 완료</>}
      </Button>
    </div>
  )
}
