import { ALL_STAFF_ROLE_VALUES } from '@/lib/roles'
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
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    schedule_id: scheduleId,
    type,
    message,
  })
  if (error) {
    console.error('알림 저장 실패:', { userId, scheduleId, type, error })
  }
}

export async function notifyStaffApprovalRequested(params: {
  supabase: SupabaseClient
  scheduleId: string
  programName: string
}) {
  const { supabase, scheduleId, programName } = params
  const message = notificationMessages.approval_requested(programName)

  const { data: staffProfiles, error } = await supabase
    .from('profiles')
    .select('id, fcm_token')
    .in('role', [...ALL_STAFF_ROLE_VALUES])
    .eq('is_approved', true)

  if (error) {
    console.error('스태프 프로필 조회 실패:', error)
    return
  }

  if (!staffProfiles?.length) {
    console.warn('승인 요청 알림 대상 스태프 없음 (ENG/CAM 역할·승인 계정 확인)')
    return
  }

  for (const sp of staffProfiles) {
    await saveNotification({
      supabase,
      userId: sp.id,
      scheduleId,
      type: 'approval_requested',
      message,
    })
  }

  const staffTokens = staffProfiles
    .filter((p) => p.fcm_token)
    .map((p) => p.fcm_token as string)

  if (staffTokens.length > 0) {
    await sendPushNotification({
      tokens: staffTokens,
      type: 'approval_requested',
      title: '승인 요청',
      body: message,
      scheduleId,
    })
  }
}

export const notificationMessages: Record<NotificationType, (name: string) => string> = {
  conflict_detected: (name) => `'${name}' 일정이 기존 일정과 충돌합니다. 협의가 필요합니다.`,
  negotiation_complete: (name) => `'${name}' 협의가 완료되어 스태프 승인 단계로 이동했습니다.`,
  approval_requested: (name) => `'${name}' 일정의 승인 요청이 들어왔습니다.`,
  approved: (name) => `'${name}' 일정이 승인되었습니다.`,
  rejected: (name) => `'${name}' 일정이 반려되었습니다. 의뢰서를 확인하세요.`,
  confirmed: (name) => `'${name}' 일정이 최종 확정되었습니다.`,
}
