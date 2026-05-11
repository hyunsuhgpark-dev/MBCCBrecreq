import type { NotificationType } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

interface SendNotificationParams {
  tokens: string[]
  type: NotificationType
  title: string
  body: string
  scheduleId?: string
}

export async function sendPushNotification(params: SendNotificationParams): Promise<void> {
  if (params.tokens.length === 0) return

  try {
    const { adminMessaging } = await import('@/lib/firebase/admin')

    await adminMessaging.sendEachForMulticast({
      tokens: params.tokens,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: {
        type: params.type,
        scheduleId: params.scheduleId ?? '',
        url: params.scheduleId ? `/schedules/${params.scheduleId}` : '/calendar',
      },
      webpush: {
        fcmOptions: {
          link: params.scheduleId ? `/schedules/${params.scheduleId}` : '/calendar',
        },
      },
    })
  } catch (error) {
    console.error('푸시 알림 발송 실패:', error)
  }
}

export async function saveNotification(params: {
  supabase: SupabaseClient
  userId: string
  scheduleId: string | null
  type: NotificationType
  message: string
}) {
  const { supabase, userId, scheduleId, type, message } = params
  await supabase.from('notifications').insert({
    user_id: userId,
    schedule_id: scheduleId,
    type,
    message,
  })
}

export const notificationMessages: Record<NotificationType, (name: string) => string> = {
  conflict_detected: (name) => `'${name}' 일정이 기존 일정과 충돌합니다. 협의가 필요합니다.`,
  negotiation_complete: (name) => `'${name}' 협의가 완료되어 스태프 승인 단계로 이동했습니다.`,
  approval_requested: (name) => `'${name}' 일정의 승인 요청이 들어왔습니다.`,
  approved: (name) => `'${name}' 일정이 승인되었습니다.`,
  rejected: (name) => `'${name}' 일정이 반려되었습니다. 의뢰서를 확인하세요.`,
  confirmed: (name) => `'${name}' 일정이 최종 확정되었습니다.`,
}
