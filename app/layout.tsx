import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: 'MBC충북 제작 일정',
  description: '녹화의뢰서 기반 방송 일정 관리 및 스태프 승인 워크플로우 시스템',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MBC 일정',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,      // 더블탭 줌 원천 차단 → 300ms 딜레이 제거
  viewportFit: 'cover',     // Safe Area 노치 영역까지 앱 콘텐츠 확장
  themeColor: '#141416',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
