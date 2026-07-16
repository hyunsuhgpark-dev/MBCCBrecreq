'use client'

import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react'

export function useMobileKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const largestViewportHeight = useRef(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    function updateKeyboardState() {
      const currentHeight = viewport?.height ?? window.innerHeight
      largestViewportHeight.current = Math.max(largestViewportHeight.current, currentHeight)
      const keyboardHeight = largestViewportHeight.current - currentHeight
      setIsKeyboardOpen(window.innerWidth < 768 && keyboardHeight > 120)
    }

    function resetViewportHeight() {
      largestViewportHeight.current = viewport?.height ?? window.innerHeight
      updateKeyboardState()
    }

    largestViewportHeight.current = viewport.height
    updateKeyboardState()
    viewport.addEventListener('resize', updateKeyboardState)
    viewport.addEventListener('scroll', updateKeyboardState)
    window.addEventListener('orientationchange', resetViewportHeight)

    return () => {
      viewport.removeEventListener('resize', updateKeyboardState)
      viewport.removeEventListener('scroll', updateKeyboardState)
      window.removeEventListener('orientationchange', resetViewportHeight)
    }
  }, [])

  const handleFocusCapture = useCallback((event: FocusEvent<HTMLElement>) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return
    }

    window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
  }, [])

  return { isKeyboardOpen, handleFocusCapture }
}
