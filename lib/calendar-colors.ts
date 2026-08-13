/** 캘린더 사이드바 칩 · 일정 바/글자 공통 색 */
export const CALENDAR_ACCENT = {
  relayCar: '#4A6FA8',
  studio: '#34D399',
  eng: '#60A5FA',
  audio: '#F87171',
  dispatch: '#F472B6',
  office: 'rgb(218, 188, 135)',
  vacation: '#9B91BC',
} as const

export const RESOURCE_COLORS = {
  relayCar: { bright: CALENDAR_ACCENT.relayCar, dark: '#1E3348' },
  studio: { bright: CALENDAR_ACCENT.studio, dark: '#064E3B' },
  eng: { bright: CALENDAR_ACCENT.eng, dark: '#1E3A8A' },
  audio: { bright: CALENDAR_ACCENT.audio, dark: '#7F1D1D' },
  dispatch: { bright: CALENDAR_ACCENT.dispatch, dark: '#831843' },
  default: { bright: '#9CA3AF', dark: '#374151' },
} as const
