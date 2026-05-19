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
  { value: 'Staff_Office', label: '스태프 (기술국)' },
  { value: 'Staff_SubControl', label: '스태프 (영상국)' },
  { value: 'Admin', label: '관리자' },
]

const roleColors: Record<string, string> = {
  Admin: 'bg-red-100 text-red-700 border-red-200',
  Staff_Office: 'bg-blue-100 text-blue-700 border-blue-200',
  Staff_SubControl: 'bg-purple-100 text-purple-700 border-purple-200',
  Producer: 'bg-green-100 text-green-700 border-green-200',
}

const roleLabels: Record<string, string> = {
  Admin: '관리자',
  Staff_Office: '기술국',
  Staff_SubControl: '영상국',
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
            <h2 className="font-semibold text-gray-800">승인 대기</h2>
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 border">
              {pendingUsers.length}명
            </Badge>
          </div>
          <div className="space-y-2">
            {pendingUsers.map((user) => (
              <div key={user.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-900">{user.full_name || '이름 없음'}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
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
                      <SelectTrigger className="w-36 h-9 text-sm">
                        <SelectValue placeholder="역할 선택" />
                      </SelectTrigger>
                      <SelectContent>
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
                      className="bg-green-600 hover:bg-green-700 text-white gap-1.5 min-h-9"
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
            <h2 className="font-semibold text-gray-800">활성 사용자</h2>
            <Badge className="bg-green-100 text-green-700 border-green-200 border">
              {approvedUsers.length}명
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.refresh()} className="gap-1.5 text-gray-500">
            <RefreshCw className="w-4 h-4" />
            새로고침
          </Button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">이름</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">이메일</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">역할</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">가입일</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {approvedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {user.full_name || '이름 없음'}
                      {user.id === currentUserId && (
                        <span className="ml-1.5 text-[10px] text-[#004F9A] bg-blue-50 px-1 py-0.5 rounded">나</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3">
                      {user.id !== currentUserId ? (
                        <Select
                          value={user.role ?? ''}
                          onValueChange={(v) => updateUser(user.id, { role: v as UserRole })}
                          disabled={loadingId === user.id}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs border-gray-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={cn('text-xs border', roleColors[user.role ?? ''] ?? 'bg-gray-100 text-gray-500')}>
                          {roleLabels[user.role ?? ''] ?? user.role}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {format(parseISO(user.created_at), 'yy.M.d', { locale: ko })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {user.id !== currentUserId && (
                        <button
                          onClick={() => updateUser(user.id, { isApproved: false })}
                          disabled={loadingId === user.id}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors p-1"
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
