'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { startNavLoading, stopNavLoading, subscribeNavLoading } from '@/lib/nav-loading'

/**
 * 상단 진행 바 + "불러오는 중" 칩.
 * - <Link>/<a> 클릭 캡처
 * - startNavLoading() (router.push 전 호출)
 * - pathname 변경 시 종료
 */
export default function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)

  useEffect(() => subscribeNavLoading(setLoading), [])

  useEffect(() => {
    stopNavLoading()
  }, [pathname, searchParams])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const target = e.target
      if (!(target instanceof Element)) return
      const a = target.closest('a')
      if (!a) return
      if (a.hasAttribute('download')) return
      if (a.target && a.target !== '_self') return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return

      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return

      try {
        const url = new URL(href, window.location.href)
        if (url.origin !== window.location.origin) return
        const next = url.pathname + url.search
        const cur = window.location.pathname + window.location.search
        if (next === cur) return
        startNavLoading()
      } catch {
        // ignore invalid href
      }
    }

    document.addEventListener('click', onPointerDown, true)
    return () => document.removeEventListener('click', onPointerDown, true)
  }, [])

  if (!loading) return null

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-[100] pointer-events-none"
        role="progressbar"
        aria-busy="true"
        aria-label="페이지 불러오는 중"
      >
        <div className="nav-progress-bar-inner h-[2px] w-full" />
      </div>

      <div
        className="fixed top-14 left-1/2 z-[100] -translate-x-1/2 pointer-events-none flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold"
        style={{
          backgroundColor: 'rgba(32, 32, 38, 0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'var(--text-primary)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: 'var(--text-secondary)' }} />
        불러오는 중…
      </div>
    </>
  )
}
