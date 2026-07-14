'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

/** 이전 화면으로 이동. 히스토리가 없으면 fallback(기본 캘린더)으로 이동 */
export function useAppBack(fallback = '/calendar') {
  const router = useRouter()

  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(fallback)
  }, [router, fallback])
}
