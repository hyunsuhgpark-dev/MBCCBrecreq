'use client'

import type { Notification } from '@/lib/types'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'
import { Bell, AlertTriangle, CheckCircle2, XCircle, MessageSquare, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NotificationListProps {
  notifications: Notification[]
}

const typeConfig = {
  conflict_detected: { icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-950/35 border-amber-800' },
  negotiation_complete: { icon: MessageSquare, color: 'text-sky-300', bg: 'bg-sky-950/25 border-sky-800' },
  approval_requested: { icon: Bell, color: 'text-slate-300', bg: 'bg-white/5 border-white/10' },
  approved: { icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-950/25 border-emerald-800' },
  rejected: { icon: XCircle, color: 'text-rose-300', bg: 'bg-rose-950/25 border-rose-800' },
  confirmed: { icon: Zap, color: 'text-[var(--accent)]', bg: 'bg-white/5 border-white/10' },
}

export default function NotificationList({ notifications }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div
        className="rounded-xl p-12 text-center border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
      >
        <Bell className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>알림이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {notifications.map((notif) => {
        const config = typeConfig[notif.type] ?? typeConfig.approval_requested
        const Icon = config.icon
        const scheduleId = notif.schedule_id

        const content = (
          <div className={cn(
            'border rounded-xl p-4 flex items-start gap-3 transition-all',
            notif.is_read && 'bg-[var(--bg-surface)] border-[var(--border-default)]',
            !notif.is_read && config.bg,
            scheduleId && 'hover:brightness-110 cursor-pointer'
          )}>
            <div
              className={cn('w-9 h-9 rounded-full border flex items-center justify-center shrink-0')}
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
            >
              <Icon className={cn('w-4.5 h-4.5', config.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm leading-relaxed', !notif.is_read && 'font-medium text-[var(--text-primary)]', notif.is_read && 'text-[var(--text-secondary)]')}>
                {notif.message}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {format(parseISO(notif.created_at), 'M월 d일(EEE) HH:mm', { locale: ko })}
              </p>
            </div>
            {!notif.is_read && (
              <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
            )}
          </div>
        )

        return scheduleId ? (
          <Link key={notif.id} href={`/schedules/${scheduleId}`}>
            {content}
          </Link>
        ) : (
          <div key={notif.id}>{content}</div>
        )
      })}
    </div>
  )
}
