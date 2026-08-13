/** 캘린더 사이드바·일정 왼쪽 칩 색 (글자색과 무관) */
export const CALENDAR_ACCENT = {
  relayCar: '#FBBF24',
  studio: '#34D399',
  eng: '#60A5FA',
  audio: '#F9A8D4',
  dispatch: '#2563EB',
  office: 'rgb(218, 188, 135)',
  vacation: '#9B91BC',
} as const

export const RESOURCE_COLORS = {
  relayCar: { bright: CALENDAR_ACCENT.relayCar, dark: '#78350F' },
  studio: { bright: CALENDAR_ACCENT.studio, dark: '#064E3B' },
  eng: { bright: CALENDAR_ACCENT.eng, dark: '#1E3A8A' },
  audio: { bright: CALENDAR_ACCENT.audio, dark: '#9D174D' },
  dispatch: { bright: CALENDAR_ACCENT.dispatch, dark: '#1E3A8A' },
  default: { bright: '#9CA3AF', dark: '#374151' },
} as const
