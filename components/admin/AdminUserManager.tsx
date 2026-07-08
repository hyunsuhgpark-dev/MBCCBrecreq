'use client'

import { useState } from 'react'
import type { Profile, UserRole } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { UserCheck, UserX, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useRouter } from 'next/navigation'

interface AdminUserManagerProps {
  users: Profile[]
  currentUserId: string
}

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'Producer', label: 'PD / 제작진' },
  { value: 'ENG', label: '스태프 (기술국)' },
  { value: 'CAM', label: '스태프 (영상국)' },
  { value: 'Admin', label: '관리자' },
]

const roleColors: Record<string, string> = {
  Admin: 'bg-rose-950/35 text-rose-200 border-rose-800',
  ENG: 'bg-sky-950/35 text-sky-200 border-sky-800',
  CAM: 'bg-purple-950/35 text-purple-200 border-purple-800',
  Producer: 'bg-emerald-950/35 text-emerald-200 border-emerald-800',
}

const roleLabels: Record<string, string> = {
  Admin: '관리자',
  ENG: '기술국',
  CAM: '영상국',
  Producer: 'PD',
}

export default function AdminUserManager({ users: initialUsers, currentUserId }: AdminUserManagerProps) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function updateUser(userId: string, updates: { role?: UserRole; isApproved?: boolean }) {
    setLoadingId(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...updates }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                ...(updates.role !== undefined && { role: updates.role }),
                ...(updates.isApproved !== undefined && { is_approved: updates.isApproved }),
              }
            : u
        )
      )
      toast.success('업데이트 완료')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setLoadingId(null)
    }
  }

  const pendingUsers = users.filter((u) => !u.is_approved)
  const approvedUsers = users.filter((u) => u.is_approved)

  return (
    <div className="space-y-6">
      {/* 승인 대기 */}
      {pendingUsers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-[var(--text-primary)]">승인 대기</h2>
            <Badge className="bg-amber-950/35 text-amber-200 border-amber-800 border">
              {pendingUsers.length}명
            </Badge>
          </div>
          <div className="space-y-2">
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                className="border rounded-xl p-4"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{user.full_name || '이름 없음'}</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      가입: {format(parseISO(user.created_at), 'M/d HH:mm', { locale: ko })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      defaultValue={user.role ?? ''}
                      onValueChange={(v) =>
                        setUsers((prev) =>
                          prev.map((u) => (u.id === user.id ? { ...u, role: v as UserRole } : u))
                        )
                      }
                    >
                      <SelectTrigger className="w-36 h-9 text-sm border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                        <SelectValue placeholder="역할 선택" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-50">
                        {roleOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={loadingId === user.id || !user.role}
                      onClick={() =>
                        updateUser(user.id, {
                          role: user.role ?? undefined,
                          isApproved: true,
                        })
                      }
                      className="text-white gap-1.5 min-h-9"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      {loadingId === user.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                      승인
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 승인된 사용자 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-[var(--text-primary)]">활성 사용자</h2>
            <Badge className="bg-emerald-950/35 text-emerald-200 border-emerald-800 border">
              {approvedUsers.length}명
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.refresh()}
            className="gap-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </Button>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}>
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">이름</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">이메일</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">역할</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">가입일</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y" style={{ '--tw-divide-color': 'var(--border-subtle)' } as React.CSSProperties}>
                {approvedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {user.full_name || '이름 없음'}
                      {user.id === currentUserId && (
                        <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-white/5 border border-white/10 text-[var(--accent)]">나</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{user.email}</td>
                    <td className="px-4 py-3">
                      {user.id !== currentUserId ? (
                        <Select
                          value={user.role ?? ''}
                          onValueChange={(v) => updateUser(user.id, { role: v as UserRole })}
                          disabled={loadingId === user.id}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper" className="z-50">
                            {roleOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={cn('text-xs border', roleColors[user.role ?? ''] ?? 'bg-white/5 text-[var(--text-secondary)] border-[var(--border-default)]')}>
                          {roleLabels[user.role ?? ''] ?? user.role}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-xs">
                      {format(parseISO(user.created_at), 'yy.M.d', { locale: ko })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {user.id !== currentUserId && (
                        <button
                          onClick={() => updateUser(user.id, { isApproved: false })}
                          disabled={loadingId === user.id}
                          className="text-xs text-rose-300 hover:text-rose-200 transition-colors p-1"
                          title="승인 취소"
                        >
                          {loadingId === user.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserX className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
