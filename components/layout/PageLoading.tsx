import { Loader2 } from 'lucide-react'

/** 라우트 loading.tsx 공통 스켈레톤 */
export default function PageLoading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[calc(100dvh-3.5rem-5rem)] sm:min-h-[calc(100dvh-3.5rem)] w-full flex-col items-center justify-center gap-3 px-4"
      style={{ backgroundColor: 'var(--bg-body)' }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-secondary)' }} />
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </p>
      <div
        className="mt-4 w-full max-w-md space-y-2"
        style={{ opacity: 0.45 }}
        aria-hidden
      >
        <div className="h-10 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }} />
        <div className="h-24 rounded-lg" style={{ backgroundColor: 'var(--bg-surface)' }} />
        <div className="h-24 rounded-lg" style={{ backgroundColor: 'var(--bg-surface)' }} />
      </div>
    </div>
  )
}
