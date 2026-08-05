'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { startNavLoading } from '@/lib/nav-loading'

/** useRouter().push/replace/back 시 즉시 로딩 표시 */
export function useNavRouter() {
  const router = useRouter()

  return useMemo(
    () => ({
      push: (href: string) => {
        startNavLoading()
        return router.push(href)
      },
      replace: (href: string) => {
        startNavLoading()
        return router.replace(href)
      },
      back: () => {
        startNavLoading()
        return router.back()
      },
      refresh: () => router.refresh(),
      prefetch: (href: string) => router.prefetch(href),
    }),
    [router]
  )
}
