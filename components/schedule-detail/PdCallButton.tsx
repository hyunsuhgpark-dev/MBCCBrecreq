'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { lookupPdContact, toTelHref } from '@/lib/pd-directory'
import { cn } from '@/lib/utils'

interface PdCallButtonProps {
  name: string
  className?: string
}

export default function PdCallButton({ name, className }: PdCallButtonProps) {
  const [open, setOpen] = useState(false)
  const contact = lookupPdContact(name)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'md:pointer-events-none md:cursor-text',
          'inline-flex items-center gap-1.5 text-left font-medium',
          'text-[var(--text-primary)] underline decoration-white/25 underline-offset-4',
          'active:opacity-70 md:no-underline md:font-normal',
          className,
        )}
      >
        {name}
        <Phone className="w-3.5 h-3.5 text-emerald-300 shrink-0 md:hidden" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] md:hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-300" />
              {name} PD
            </DialogTitle>
          </DialogHeader>
          {contact ? (
            <a
              href={toTelHref(contact.phone)}
              className="block rounded-xl border px-4 py-4 text-center active:scale-[0.98] transition-transform"
              style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-elevated)' }}
            >
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>전화 걸기</p>
              <p className="text-xl font-semibold tabular-nums tracking-wide text-emerald-200">
                {contact.phone}
              </p>
            </a>
          ) : (
            <p className="text-sm py-2" style={{ color: 'var(--text-muted)' }}>
              등록된 전화번호가 없습니다. 관리자에게 문의해 주세요.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="w-full min-h-12 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            >
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
