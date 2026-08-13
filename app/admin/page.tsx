import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import AdminUserManager from '@/components/admin/AdminUserManager'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.is_approved || profile.role !== 'Admin') {
    redirect('/calendar')
  }

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <AppShell profile={profile}>
      <div className="flex min-h-[calc(100dvh-3.5rem-5rem)] sm:min-h-[calc(100dvh-3.5rem)] w-full justify-center px-4 py-8 pb-28 sm:pb-10">
        <div className="w-full max-w-5xl my-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">사용자 관리</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>가입 승인 및 역할 지정을 관리합니다.</p>
          </div>
          <AdminUserManager users={users ?? []} currentUserId={user.id} />
        </div>
      </div>
    </AppShell>
  )
}
