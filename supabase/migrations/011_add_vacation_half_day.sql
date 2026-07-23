-- K열: 오전/오후 반차 구분 컬럼 추가 (일반 휴가는 NULL)
ALTER TABLE public.vacations
  ADD COLUMN IF NOT EXISTS half_day TEXT;
