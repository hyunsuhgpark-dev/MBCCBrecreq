# MBC 방송 일정 관리 시스템

녹화의뢰서 기반의 방송 일정 관리 PWA입니다.

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **UI**: shadcn/ui + Lucide React
- **Database / Auth**: Supabase (PostgreSQL + RLS)
- **Push Notification**: Firebase Cloud Messaging (FCM)
- **배포**: Vercel

## 로컬 개발 환경 설정

### 1. 환경변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local`에 실제 Supabase 및 Firebase 값을 입력하세요.

### 2. Supabase 스키마 적용

Supabase 대시보드 > SQL Editor에서 `supabase/migrations/001_initial_schema.sql` 파일 내용을 실행하세요.

### 3. Firebase 설정

1. Firebase 콘솔에서 Cloud Messaging 활성화
2. VAPID 키 생성 후 `NEXT_PUBLIC_FIREBASE_VAPID_KEY` 환경변수에 설정
3. 서비스 계정 키를 `FIREBASE_*` 환경변수에 설정

### 4. 개발 서버 실행

```bash
npm install
npm run dev
```

## Vercel 배포

```bash
vercel deploy
```

환경변수를 Vercel 대시보드에서 설정하거나 `vercel env pull`로 가져오세요.

## 첫 Admin 계정 설정

1. 회원가입 후 Supabase 대시보드 > Table Editor > profiles 테이블에서
2. 첫 계정의 `role`을 `Admin`, `is_approved`를 `true`로 수동 설정
3. 이후부터는 Admin 계정으로 로그인하여 다른 계정을 승인

## 주요 기능

| 기능 | 설명 |
|------|------|
| 녹화의뢰서 디지털화 | 종이 양식과 동일한 레이아웃의 디지털 입력 폼 |
| 충돌 감지 | 장소/자원/시간 중복 자동 감지 (tsrange 기반) |
| 상태 관리 | 충돌(주황) → 대기(회색) → 확정(녹색) 상태 머신 |
| 스태프 승인 | 사무실/부조정실 2파트 순차 승인 |
| 푸시 알림 | FCM 기반 실시간 알림 (충돌/승인/반려/확정) |
| PDF 출력 | 종이 양식과 동일한 포맷으로 인쇄/PDF 저장 |
| PWA | 모바일 홈 화면 추가, 오프라인 지원 |

## 사용자 역할

| 역할 | 설명 |
|------|------|
| Producer | 녹화의뢰서 작성/수정, 충돌 협의 |
| Staff_Office | 사무실 파트 승인/반려 |
| Staff_SubControl | 부조정실 파트 승인/반려 |
| Admin | 전체 관리, 강제 승인, 사용자 관리 |
