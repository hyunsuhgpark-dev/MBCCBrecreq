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
  conflict_detected: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100' },
  negotiation_complete: { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-100' },
  approval_requested: { icon: Bell, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-100' },
  approved: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 border-green-100' },
  rejected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-100' },
  confirmed: { icon: Zap, color: 'text-[#004F9A]', bg: 'bg-blue-50 border-blue-100' },
}

export default function NotificationList({ notifications }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
        <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">알림이 없습니다.</p>
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
            'bg-white border rounded-xl p-4 flex items-start gap-3 transition-all',
            !notif.is_read && config.bg,
            scheduleId && 'hover:shadow-md cursor-pointer'
          )}>
            <div className={cn('w-9 h-9 rounded-full bg-white border flex items-center justify-center shrink-0 shadow-sm')}>
              <Icon className={cn('w-4.5 h-4.5', config.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm leading-relaxed', !notif.is_read && 'font-medium text-gray-900', notif.is_read && 'text-gray-600')}>
                {notif.message}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {format(parseISO(notif.created_at), 'M월 d일(EEE) HH:mm', { locale: ko })}
              </p>
            </div>
            {!notif.is_read && (
              <div className="w-2 h-2 rounded-full bg-[#E1002D] mt-1.5 shrink-0" />
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
