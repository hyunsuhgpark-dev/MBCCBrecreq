import { ALL_STAFF_ROLE_VALUES, getScheduleResourceType } from '@/lib/roles'
import type { NotificationType } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

interface SendNotificationParams {
  tokens: string[]
  type: NotificationType
  title: string
  body: string
  scheduleId?: string
  url?: string
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
        url: params.url ?? (params.scheduleId ? `/schedules/${params.scheduleId}` : '/calendar'),
      },
      webpush: {
        fcmOptions: {
          link: params.url ?? (params.scheduleId ? `/schedules/${params.scheduleId}` : '/calendar'),
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
  scheduleResources?: {
    request_type?: string
    use_relay_car: boolean
    use_studio: boolean
    use_eng: boolean
    use_audio: boolean
  }
}) {
  const { supabase, scheduleId, programName, scheduleResources } = params
  const isDispatch = scheduleResources?.request_type === 'dispatch'
  const message = isDispatch
    ? `'${programName}' 배차 신청의 승인 요청이 들어왔습니다.`
    : notificationMessages.approval_requested(programName)

  const { data: staffProfiles, error } = await supabase
    .from('profiles')
    .select('id, fcm_token, role')
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

  let targetProfiles = staffProfiles
  if (isDispatch) {
    targetProfiles = staffProfiles.filter((p) => p.role === 'CAM' || p.role === 'Staff_SubControl')
  } else if (scheduleResources) {
    const { isEngOnly, isAudioOnly } = getScheduleResourceType(scheduleResources)
    if (isEngOnly) {
      targetProfiles = staffProfiles.filter((p) => p.role === 'CAM' || p.role === 'Staff_SubControl')
    } else if (isAudioOnly) {
      targetProfiles = staffProfiles.filter((p) => p.role === 'ENG' || p.role === 'Staff_Office')
    }
  }

  for (const sp of targetProfiles) {
    await saveNotification({
      supabase,
      userId: sp.id,
      scheduleId,
      type: 'approval_requested',
      message,
    })
  }

  const staffTokens = targetProfiles
    .filter((p) => p.fcm_token)
    .map((p) => p.fcm_token as string)

  if (staffTokens.length > 0) {
    await sendPushNotification({
      tokens: staffTokens,
      type: 'approval_requested',
      title: isDispatch ? '배차 승인 요청' : '승인 요청',
      body: message,
      scheduleId,
    })
  }
}

export async function notifyProducer(params: {
  supabase: SupabaseClient
  userId: string
  scheduleId: string
  type: NotificationType
  programName: string
}) {
  const { supabase, userId, scheduleId, type, programName } = params
  const message = notificationMessages[type](programName)

  await saveNotification({ supabase, userId, scheduleId, type, message })

  const { data: profile } = await supabase
    .from('profiles')
    .select('fcm_token')
    .eq('id', userId)
    .single()

  if (profile?.fcm_token) {
    await sendPushNotification({
      tokens: [profile.fcm_token],
      type,
      title: '일정 알림',
      body: message,
      scheduleId,
    })
  }
}

export const notificationMessages: Record<NotificationType, (name: string) => string> = {
  schedule_submitted: (name) => name, // 호출자가 직접 메시지 구성
  conflict_detected: (name) => `'${name}' 일정이 기존 일정과 충돌합니다. 협의가 필요합니다.`,
  negotiation_complete: (name) => `'${name}' 협의가 완료되어 스태프 승인 단계로 이동했습니다.`,
  approval_requested: (name) => `'${name}' 일정의 승인 요청이 들어왔습니다.`,
  approved: (name) => `'${name}' 일정이 승인되었습니다.`,
  rejected: (name) => `'${name}' 일정이 반려되었습니다. 의뢰서를 확인하세요.`,
  confirmed: (name) => `'${name}' 일정이 최종 확정되었습니다.`,
  assignment_requested: (name) => `'${name}' 배차가 승인되었습니다. 차량 배정 후 알려드리겠습니다.`,
  assignment_completed: (name) => `'${name}' 배차 배정이 완료되었습니다. 의뢰서에서 기사·차량 정보를 확인하세요.`,
  user_signup_requested: (name) => `${name}님이 회원가입을 신청했습니다.`,
}

/** 회원가입 신청 시 Admin에게 FCM 푸시 (앱 내 알림은 DB 트리거가 생성) */
export async function notifyAdminsUserSignupPush(params: {
  supabase: SupabaseClient
  fullName: string
  email: string
}) {
  const { supabase, fullName, email } = params
  const displayName = fullName.trim() || '신규 사용자'
  const message = `${displayName}님이 회원가입을 신청했습니다. (${email})`

  const { data: admins, error } = await supabase
    .from('profiles')
    .select('fcm_token')
    .eq('role', 'Admin')
    .eq('is_approved', true)

  if (error) {
    console.error('Admin 프로필 조회 실패:', error)
    return
  }

  const tokens = (admins ?? [])
    .filter((a) => a.fcm_token)
    .map((a) => a.fcm_token as string)

  if (tokens.length === 0) return

  await sendPushNotification({
    tokens,
    type: 'user_signup_requested',
    title: '회원가입 신청',
    body: message,
    url: '/admin',
  })
}

/**
 * 의뢰 제출 시 전체 승인 사용자에게 알림 발송 (제출자 본인 제외)
 * 메시지 형식: "홍길동님이 2026-07-20 14:00에 '프로그램명' 녹화 의뢰 요청했습니다."
 */
export async function notifyAllUsersScheduleSubmitted(params: {
  supabase: SupabaseClient
  scheduleId: string
  submitterId: string
  submitterName: string
  programName: string
  broadcastStart: string
  requestType?: 'recording' | 'dispatch'
}) {
  const { supabase, scheduleId, submitterId, submitterName, programName, broadcastStart, requestType = 'recording' } = params

  const kstDateTime = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(broadcastStart)).replace(' ', ' ').replace(/-/g, '/').replace('T', ' ')

  const label = requestType === 'dispatch' ? '배차 신청' : '녹화 의뢰'
  const message = `${submitterName}님이 ${kstDateTime}에 '${programName}' ${label} 요청했습니다.`

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, fcm_token, role')
    .eq('is_approved', true)
    .neq('id', submitterId)

  if (!allProfiles?.length) return

  // 스태프 역할은 이미 approval_requested를 별도로 받으므로 제외 (중복 방지)
  const targetProfiles = allProfiles.filter(
    p => !(ALL_STAFF_ROLE_VALUES as readonly string[]).includes(p.role ?? '')
  )

  if (!targetProfiles.length) return

  for (const p of targetProfiles) {
    await saveNotification({
      supabase,
      userId: p.id,
      scheduleId,
      type: 'schedule_submitted',
      message,
    })
  }

  const tokens = targetProfiles
    .filter((p) => p.fcm_token)
    .map((p) => p.fcm_token as string)

  if (tokens.length > 0) {
    await sendPushNotification({
      tokens,
      type: 'schedule_submitted',
      title: requestType === 'dispatch' ? '새 배차 신청' : '새 녹화 의뢰',
      body: message,
      scheduleId,
    })
  }
}
