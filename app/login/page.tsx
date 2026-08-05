'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useNavRouter } from '@/lib/use-nav-router'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useNavRouter()
  const supabase = createClient()
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', fullName: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        if (error) throw error
        router.push('/calendar')
        router.refresh()
      } else {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { full_name: form.fullName } },
        })
        if (error) throw error
        void fetch('/api/auth/signup-notify', { method: 'POST' }).catch(() => {})
        toast.success('가입 완료! 관리자 승인 후 이용 가능합니다.')
        setIsLogin(true)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: 'var(--bg-body)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-[360px] mx-4">
        <div className="text-center mb-8">
          <h1
            className="text-[22px] font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            MBC충북 제작 일정
          </h1>
        </div>

        <div
          className="rounded-2xl border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            padding: '31px 28px',
          }}
        >
          <div
            className="flex rounded-xl p-1 mb-6"
            style={{ backgroundColor: 'var(--bg-body)' }}
          >
            {['로그인', '회원가입'].map((label, i) => {
              const active = i === 0 ? isLogin : !isLogin
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setIsLogin(i === 0)}
                  className="flex-1 text-sm font-semibold rounded-lg transition-all hover:brightness-110"
                  style={{
                    paddingTop: '11px',
                    paddingBottom: '11px',
                    backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  이름
                </label>
                <input
                  type="text"
                  placeholder="홍길동"
                  value={form.fullName}
                  onChange={(e) => setForm(f => ({ ...f, fullName: e.target.value }))}
                  required={!isLogin}
                  className="w-full h-11 px-3.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                이메일
              </label>
              <input
                type="email"
                placeholder="name@mbccb.co.kr"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                required
                className="w-full h-11 px-3.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={6}
                  className="w-full h-11 px-3.5 pr-11 rounded-xl text-sm outline-none transition-all"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors hover:bg-white/[0.06]"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-sm font-bold rounded-xl transition-all bg-white text-[#0A0A0A] hover:bg-zinc-200 disabled:opacity-50"
              style={{ marginTop: '2rem' }}
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                : isLogin ? '로그인' : '가입 신청'
              }
            </button>
          </form>

          {!isLogin && (
            <p className="text-[11px] text-center mt-4" style={{ color: 'var(--text-muted)' }}>
              가입 후 관리자 승인이 완료되어야 서비스 이용 가능합니다.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
