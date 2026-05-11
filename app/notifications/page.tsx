import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import NotificationList from '@/components/notifications/NotificationList'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved) redirect('/pending-approval')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*, schedule:schedules(id, program_name, status)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // 읽음 처리
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  return (
    <AppShell profile={profile} unreadCount={0}>
        <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4">알림</h1>
        <NotificationList notifications={notifications ?? []} />
      </div>
    </AppShell>
  )
}
