-- 사내 ERP 휴가 데이터 테이블
CREATE TABLE IF NOT EXISTS public.vacations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  approval_number TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  vacation_type   TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vacations ENABLE ROW LEVEL SECURITY;

-- ENG / ENG-M / Admin 만 조회 가능
CREATE POLICY "vacation_eng_admin_read" ON public.vacations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('Admin', 'ENG', 'ENG-M')
        AND is_approved = true
    )
  );

-- 업로드(INSERT/UPDATE/DELETE)는 API 레이어에서 service_role 키로 처리
