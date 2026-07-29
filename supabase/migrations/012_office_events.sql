-- 송출/행정 (Google Calendar MBC충북) 양방향 sync용 테이블
--
-- 운영 설정:
-- 1) GCP 서비스 계정 JSON 발급 → GOOGLE_CALENDAR_CLIENT_EMAIL / PRIVATE_KEY
-- 2) MBC충북 캘린더에 서비스 계정 이메일을「일정 변경」권한으로 공유
-- 3) GOOGLE_CALENDAR_ID 에 해당 캘린더 ID 설정
-- 4) 외부「전체 공개」는 불필요 (서비스 계정 공유로 충분)

CREATE TABLE IF NOT EXISTS public.office_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id   TEXT UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  start_at          TIMESTAMPTZ,
  end_at            TIMESTAMPTZ,
  all_day           BOOLEAN NOT NULL DEFAULT false,
  start_date        DATE,
  end_date          DATE,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name       TEXT NOT NULL,
  author_role       TEXT,
  etag              TEXT,
  google_updated_at TIMESTAMPTZ,
  local_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  dirty             BOOLEAN NOT NULL DEFAULT false,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_events_range_idx
  ON public.office_events (start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS office_events_start_at_idx
  ON public.office_events (start_at, end_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.office_events ENABLE ROW LEVEL SECURITY;

-- Admin / ENG / ENG-M / Staff_Office 조회만 허용 (쓰기·삭제는 service_role API)
CREATE POLICY "office_events_read" ON public.office_events
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('Admin', 'ENG', 'ENG-M', 'Staff_Office')
        AND is_approved = true
    )
  );
