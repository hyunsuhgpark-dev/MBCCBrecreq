-- 동일 결재번호로 여러 일자/반차 행이 올 수 있음 → approval_number 단독 UNIQUE 제거
-- 업로드 sync용 복합 키(sync_key)로 행 단위 upsert

ALTER TABLE public.vacations
  DROP CONSTRAINT IF EXISTS vacations_approval_number_key;

ALTER TABLE public.vacations
  ADD COLUMN IF NOT EXISTS sync_key TEXT;

-- 기존 행 백필 (half_day NULL → 빈 문자열로 키 구성)
UPDATE public.vacations
SET sync_key =
  approval_number
  || '|' || start_date::text
  || '|' || end_date::text
  || '|' || COALESCE(half_day, '')
WHERE sync_key IS NULL;

-- 혹시 백필 후 중복이 있으면 하나만 남김 (최신 uploaded_at 우선)
DELETE FROM public.vacations v
USING public.vacations newer
WHERE v.sync_key = newer.sync_key
  AND v.id <> newer.id
  AND (
    v.uploaded_at < newer.uploaded_at
    OR (v.uploaded_at = newer.uploaded_at AND v.id::text < newer.id::text)
  );

ALTER TABLE public.vacations
  ALTER COLUMN sync_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vacations_sync_key_uidx
  ON public.vacations (sync_key);
