'use client'

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface VacationUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

interface UploadResult {
  upserted: number
  deleted: number
}

export function VacationUploadModal({ open, onOpenChange, onComplete }: VacationUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setResult(null)
    setError(null)
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

  function handleClose(v: boolean) {
    if (!v) {
      setFile(null)
      setResult(null)
      setError(null)
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-neutral-200 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium text-neutral-100 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            사내 휴가 엑셀 업로드
          </DialogTitle>
        </DialogHeader>

        <div className="py-3 space-y-4">
          {/* 파일 선택 영역 */}
          <div
            className="border border-dashed border-zinc-700 rounded-md px-4 py-6 flex flex-col items-center gap-2 cursor-pointer hover:border-zinc-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-6 h-6 text-zinc-500" />
            {file ? (
              <span className="text-xs text-neutral-300 truncate max-w-full">{file.name}</span>
            ) : (
              <span className="text-xs text-zinc-500">클릭하여 .xls / .xlsx 파일 선택</span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* 칼럼 안내 */}
          <div className="text-[11px] text-zinc-500 space-y-0.5 border border-zinc-800 rounded-md p-3">
            <p className="text-zinc-400 font-medium mb-1">엑셀 컬럼 매핑</p>
            <p>E열: 성명 &nbsp; F열: 휴가구분 &nbsp; G열: 시작일 &nbsp; I열: 종료일</p>
            <p>O열: 결재번호(고유키) &nbsp; P열: 결재상태</p>
            <p className="text-amber-400/70 mt-1">※ P열 = &apos;결재완료&apos;인 행만 처리됩니다</p>
          </div>

          {/* 결과 */}
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
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-zinc-200 text-xs"
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
            업로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
