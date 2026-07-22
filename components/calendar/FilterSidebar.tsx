'use client'

import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/types'

export interface SidebarFilters {
  myScheduleOnly: boolean
  relayCar: boolean
  studio: boolean
  eng: boolean
  audio: boolean
  officeCalendar: boolean
  dispatch: boolean
}

export const DEFAULT_SIDEBAR_FILTERS: SidebarFilters = {
  myScheduleOnly: false,
  relayCar: true,
  studio: true,
  eng: true,
  audio: true,
  officeCalendar: false,
  dispatch: false,
}

export const LS_FILTER_KEY = 'cal-sidebar-filters'

/** 송출/행정(구글 캘린더) 탭을 볼 수 있는 역할 */
function canSeeOfficeCalendar(role: Profile['role']): boolean {
  return role === 'Admin' || role === 'ENG' || role === 'ENG-M'
}

interface FilterSidebarProps {
  filters: SidebarFilters
  onChange: (next: SidebarFilters) => void
  profile: Profile
  officeConfigured?: boolean
  className?: string
}

interface CheckboxItemProps {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  accentColor?: string
}

function CheckboxItem({ label, checked, onChange, accentColor }: CheckboxItemProps) {
  return (
    <label
      className="flex items-center gap-3 cursor-pointer group px-0.5 rounded hover:bg-white/[0.03] transition-colors select-none"
      style={{ paddingTop: '5px', paddingBottom: '5px' }}
    >
      <div
        onClick={() => onChange(!checked)}
        className={cn(
          'w-[15px] h-[15px] shrink-0 rounded-[3px] border flex items-center justify-center transition-colors',
          checked ? 'border-zinc-500 bg-zinc-600' : 'border-zinc-700 bg-transparent'
        )}
      >
        {checked && (
          <svg
            className="w-[9px] h-[9px] text-zinc-200"
            fill="none"
            viewBox="0 0 10 10"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        )}
      </div>
      {accentColor && (
        <span
          className="w-[3px] h-[13px] rounded-full shrink-0"
          style={{
            backgroundColor: checked ? accentColor : 'transparent',
            border: `1px solid ${accentColor}40`,
          }}
        />
      )}
      <span
        className={cn(
          'text-[13px] leading-none transition-colors',
          checked ? 'text-zinc-300' : 'text-zinc-600'
        )}
      >
        {label}
      </span>
    </label>
  )
}

export default function FilterSidebar({
  filters,
  onChange,
  profile,
  officeConfigured,
  className,
}: FilterSidebarProps) {
  const set = <K extends keyof SidebarFilters>(key: K, value: SidebarFilters[K]) => {
    onChange({ ...filters, [key]: value })
  }

  const showOffice = canSeeOfficeCalendar(profile.role)

  return (
    <aside
      className={cn(
        'flex flex-col gap-0 shrink-0 border-r border-white/[0.08]',
        'w-[168px] pb-5 px-3',
        className
      )}
      style={{ backgroundColor: 'transparent' }}
    >
      {/* 컨트롤바(py-5+h-8+mb-4=68) - 요일헤더(32) = 36px */}
      <div style={{ height: '37px', flexShrink: 0 }} />

      {/* 내 일정만 보기 */}
      <div className="mb-5">
        <div
          className="flex items-center justify-between gap-2"
          style={{ paddingTop: '5px', paddingBottom: '5px' }}
        >
          <span className="text-[13px] font-medium text-zinc-400 leading-none">내 일정만 보기</span>
          <Switch
            checked={filters.myScheduleOnly}
            onCheckedChange={(v) => set('myScheduleOnly', v)}
          />
        </div>
      </div>

      {/* 구분선 */}
      <div className="border-t border-white/[0.06] mb-4" />

      {/* 장비 / 구분 */}
      <div className="mb-1">
        <p className="text-[12px] font-semibold tracking-wide text-zinc-600 mb-3 px-0.5">
          장비 / 구분
        </p>
        <div className="flex flex-col gap-0">
          <CheckboxItem
            label="중계차"
            checked={filters.relayCar}
            onChange={(v) => set('relayCar', v)}
            accentColor="#A78BFA"
          />
          <CheckboxItem
            label="스튜디오"
            checked={filters.studio}
            onChange={(v) => set('studio', v)}
            accentColor="#34D399"
          />
          <CheckboxItem
            label="ENG"
            checked={filters.eng}
            onChange={(v) => set('eng', v)}
            accentColor="#60A5FA"
          />
          <CheckboxItem
            label="AUDIO"
            checked={filters.audio}
            onChange={(v) => set('audio', v)}
            accentColor="#FBBF24"
          />
        </div>
      </div>

      {/* 배차 정보 — 모든 역할에게 표시 */}
      <div className="border-t border-white/[0.06] my-4" />
      <div>
        <p className="text-[12px] font-semibold tracking-wide text-zinc-600 mb-3 px-0.5">
          배차
        </p>
        <div className="flex flex-col gap-0">
          <CheckboxItem
            label="배차 정보"
            checked={filters.dispatch}
            onChange={(v) => set('dispatch', v)}
            accentColor="#F472B6"
          />
        </div>
      </div>

      {/* 송출/행정 — ENG / ENG-M / Admin 에게만 표시 */}
      {showOffice && (
        <>
          <div className="border-t border-white/[0.06] my-4" />
          <div>
            <p className="text-[12px] font-semibold tracking-wide text-zinc-600 mb-3 px-0.5">
              외부 연동
            </p>
            <div className="flex flex-col gap-0">
              <CheckboxItem
                label="송출/행정"
                checked={filters.officeCalendar}
                onChange={(v) => set('officeCalendar', v)}
                accentColor="rgba(255,255,255,0.55)"
              />
              {filters.officeCalendar && officeConfigured === false && (
                <p className="text-[10px] leading-snug mt-1 px-0.5" style={{ color: '#6B7280' }}>
                  구글 캘린더 환경변수가 설정되지 않았습니다.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
