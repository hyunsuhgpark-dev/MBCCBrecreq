'use client'

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VacationUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

interface UploadResult {
  upserted: number
  deleted: number
}

const ALLOWED_EXTS = ['xls', 'xlsx']

function isExcelFile(f: File) {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_EXTS.includes(ext)
}

export function VacationUploadModal({ open, onOpenChange, onComplete }: VacationUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // 수기 입력 상태
  const [manualName, setManualName] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualHalfDay, setManualHalfDay] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualResult, setManualResult] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)

  function pickFile(f: File | null) {
    if (!f) return
    if (!isExcelFile(f)) {
      setError('.xls 또는 .xlsx 파일만 올릴 수 있습니다')
      return
    }
    setFile(f)
    setResult(null)
    setError(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0] ?? null)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    pickFile(dropped ?? null)
  }

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/vacations/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '업로드에 실패했습니다')
      } else {
        setResult({ upserted: json.upserted ?? 0, deleted: json.deleted ?? 0 })
        onComplete?.()
      }
    } catch (err) {
      setError('네트워크 오류가 발생했습니다')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleManualSave() {
    if (!manualName.trim() || !manualStart || !manualEnd) {
      setManualError('이름, 시작일, 종료일은 필수입니다')
      return
    }
    setManualLoading(true)
    setManualError(null)
    setManualResult(null)
    try {
      const res = await fetch('/api/vacations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manualName.trim(),
          start_date: manualStart,
          end_date: manualEnd,
          half_day: manualHalfDay || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setManualError(json.error ?? '저장에 실패했습니다')
      } else {
        setManualResult('저장 완료')
        setManualName('')
        setManualStart('')
        setManualEnd('')
        setManualHalfDay('')
        onComplete?.()
      }
    } catch (err) {
      setManualError('네트워크 오류가 발생했습니다')
      console.error(err)
    } finally {
      setManualLoading(false)
    }
  }

  function handleClose(v: boolean) {
    if (!v) {
      setFile(null)
      setResult(null)
      setError(null)
      setDragging(false)
      setManualName('')
      setManualStart('')
      setManualEnd('')
      setManualHalfDay('')
      setManualResult(null)
      setManualError(null)
    }
    onOpenChange(v)
  }

  const inputCls =
    'w-full rounded px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none border border-[var(--border-default)] bg-[var(--bg-surface)] focus:border-white/20'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-sm text-[var(--text-primary)] shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-default)',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            휴가 정보 업로드
          </DialogTitle>
        </DialogHeader>

        <div className="py-3 space-y-4">
          {/* 드래그 앤 드롭 / 파일 선택 영역 */}
          <div
            className={cn(
              'border border-dashed rounded-md px-4 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors',
              dragging
                ? 'border-amber-500 bg-amber-500/[0.06]'
                : 'border-[var(--border-default)] hover:border-white/20'
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className={cn('w-6 h-6 transition-colors', dragging ? 'text-amber-400' : 'text-[var(--text-muted)]')} />
            {file ? (
              <span className="text-xs text-[var(--text-primary)] truncate max-w-full">{file.name}</span>
            ) : dragging ? (
              <span className="text-xs text-amber-400">여기에 놓으세요</span>
            ) : (
              <>
                <span className="text-xs text-[var(--text-secondary)]">파일을 여기에 끌어다 놓거나</span>
                <span className="text-xs text-[var(--text-muted)]">클릭하여 선택 (.xls / .xlsx)</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* 엑셀 업로드 결과 */}
          {result && (
            <div className="flex items-start gap-2 text-xs text-green-400 border border-green-800/50 bg-green-900/20 rounded-md px-3 py-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>업로드 완료 — 추가/갱신 {result.upserted}건, 삭제 {result.deleted}건</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 border border-red-800/50 bg-red-900/20 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 수기 입력 섹션 */}
          <div className="border-t border-[var(--border)] pt-4 space-y-2.5">
            <p className="text-[11px] text-[var(--text-secondary)] font-medium flex items-center gap-1.5">
              <PenLine className="w-3 h-3" />
              휴가 정보 직접 입력
            </p>
            <input
              className={inputCls}
              placeholder="이름"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                type="date"
                className={inputCls}
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
              />
              <input
                type="date"
                className={inputCls}
                value={manualEnd}
                onChange={(e) => setManualEnd(e.target.value)}
              />
            </div>
            <select
              className={inputCls}
              value={manualHalfDay}
              onChange={(e) => setManualHalfDay(e.target.value)}
            >
              <option value="">종일</option>
              <option value="오전">오전 반차</option>
              <option value="오후">오후 반차</option>
            </select>
            {manualResult && (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <CheckCircle className="w-3.5 h-3.5" />
                {manualResult}
              </div>
            )}
            {manualError && (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {manualError}
              </div>
            )}
            <Button
              size="sm"
              className="w-full bg-[var(--surface-2)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-xs"
              disabled={manualLoading}
              onClick={handleManualSave}
            >
              {manualLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              저장
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs"
            onClick={() => handleClose(false)}
          >
            닫기
          </Button>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs disabled:opacity-50"
            disabled={!file || loading}
            onClick={handleUpload}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            엑셀 업로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
