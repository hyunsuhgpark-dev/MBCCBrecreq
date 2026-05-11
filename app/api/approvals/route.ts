import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushNotification, saveNotification, notificationMessages } from '@/services/notification'
import { dispatchWebhook } from '@/services/webhook'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '?? ??' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) return NextResponse.json({ error: '???' }, { status: 403 })

  const allowedRoles = ['Staff_Office', 'Staff_SubControl', 'Admin']
  if (!allowedRoles.includes(profile.role ?? '')) {
    return NextResponse.json({ error: '?? ??' }, { status: 403 })
  }

  const { scheduleId, action, rejectReason } = await request.json()
  // action: 'approve' | 'reject' | 'force_approve'

  // Admin ?? ??
  if (action === 'force_approve' && profile.role === 'Admin') {
    await supabase
      .from('approvals')
      .update({ status: 'approved', approver_id: user.id, decided_at: new Date().toISOString() })
      .eq('schedule_id', scheduleId)

    await supabase.from('schedules').update({ status: 'confirmed' }).eq('id', scheduleId)

    const { data: schedule } = await supabase
      .from('schedules')
      .select('created_by, program_name, profiles!schedules_created_by_fkey(fcm_token)')
      .eq('id', scheduleId)
      .single()

    if (schedule) {
      await saveNotification({
        supabase: supabase as unknown as SupabaseClient,
        userId: schedule.created_by,
        scheduleId,
        type: 'confirmed',
        message: notificationMessages.confirmed(schedule.program_name),
      })

      const token = (schedule as { profiles?: { fcm_token?: string } }).profiles?.fcm_token
      if (token) {
        await sendPushNotification({
          tokens: [token],
          type: 'confirmed',
          title: '?? ??',
          body: notificationMessages.confirmed(schedule.program_name),
          scheduleId,
        })
      }

      // ?? ?? (?? ??)
      void dispatchWebhook('schedule.confirmed', {
        id: scheduleId,
        program_name: schedule.program_name,
        responsible_pd: (schedule as { responsible_pd?: string }).responsible_pd ?? '',
        status: 'confirmed',
        venue: (schedule as { venue?: string }).venue ?? '',
        broadcast_start: (schedule as { broadcast_start?: string }).broadcast_start ?? '',
        broadcast_end: (schedule as { broadcast_end?: string }).broadcast_end ?? '',
        rehearsal_staff_at: (schedule as { rehearsal_staff_at?: string }).rehearsal_staff_at ?? null,
        is_live: (schedule as { is_live?: boolean }).is_live ?? false,
        notes: (schedule as { notes?: string }).notes ?? '',
        created_by: schedule.created_by,
      })
    }

    return NextResponse.json({ message: '?? ?? ??' })
  }

  // ??? ?? ??
  const part = profile.role === 'Staff_Office' ? 'office' : 'sub_control'

  // ??/?? ??
  const updateData: Record<string, unknown> = {
    approver_id: user.id,
    decided_at: new Date().toISOString(),
    status: action === 'approve' ? 'approved' : 'rejected',
  }
  if (action === 'reject') updateData.reject_reason = rejectReason

  await supabase
    .from('approvals')
    .update(updateData)
    .eq('schedule_id', scheduleId)
    .eq('part', part)

  const { data: schedule } = await supabase
    .from('schedules')
    .select('created_by, program_name, responsible_pd, venue, broadcast_start, broadcast_end, rehearsal_staff_at, is_live, notes, profiles!schedules_created_by_fkey(fcm_token)')
    .eq('id', scheduleId)
    .single()

  if (!schedule) return NextResponse.json({ error: '?? ??' }, { status: 404 })

  if (action === 'reject') {
    await supabase.from('schedules').update({ status: 'rejected' }).eq('id', scheduleId)

    await saveNotification({
      supabase: supabase as unknown as SupabaseClient,
      userId: schedule.created_by,
      scheduleId,
      type: 'rejected',
      message: notificationMessages.rejected(schedule.program_name),
    })

    const token = (schedule as { profiles?: { fcm_token?: string } }).profiles?.fcm_token
    if (token) {
      await sendPushNotification({
        tokens: [token],
        type: 'rejected',
        title: '?? ??',
        body: notificationMessages.rejected(schedule.program_name),
        scheduleId,
      })
    }

    return NextResponse.json({ message: '?? ?? ??' })
  }

  // ?? ? ?? ?? ??
  const { data: allApprovals } = await supabase
    .from('approvals')
    .select('status')
    .eq('schedule_id', scheduleId)

  const allApproved = allApprovals?.every((a) => a.status === 'approved')

  if (allApproved) {
    await supabase.from('schedules').update({ status: 'confirmed' }).eq('id', scheduleId)

    await saveNotification({
      supabase: supabase as unknown as SupabaseClient,
      userId: schedule.created_by,
      scheduleId,
      type: 'confirmed',
      message: notificationMessages.confirmed(schedule.program_name),
    })

    const token = (schedule as { profiles?: { fcm_token?: string } }).profiles?.fcm_token
    if (token) {
      await sendPushNotification({
        tokens: [token],
        type: 'confirmed',
        title: '?? ?? ??',
        body: notificationMessages.confirmed(schedule.program_name),
        scheduleId,
      })
    }

    // ?? ?? (?? ??)
    void dispatchWebhook('schedule.confirmed', {
      id: scheduleId,
      program_name: schedule.program_name,
      responsible_pd: (schedule as { responsible_pd?: string }).responsible_pd ?? '',
      status: 'confirmed',
      venue: (schedule as { venue?: string }).venue ?? '',
      broadcast_start: (schedule as { broadcast_start?: string }).broadcast_start ?? '',
      broadcast_end: (schedule as { broadcast_end?: string }).broadcast_end ?? '',
      rehearsal_staff_at: (schedule as { rehearsal_staff_at?: string }).rehearsal_staff_at ?? null,
      is_live: (schedule as { is_live?: boolean }).is_live ?? false,
      notes: (schedule as { notes?: string }).notes ?? '',
      created_by: schedule.created_by,
    })
  } else {
    await saveNotification({
      supabase: supabase as unknown as SupabaseClient,
      userId: schedule.created_by,
      scheduleId,
      type: 'approved',
      message: notificationMessages.approved(schedule.program_name),
    })
  }

  return NextResponse.json({ message: '?? ?? ??', allConfirmed: allApproved })
}
