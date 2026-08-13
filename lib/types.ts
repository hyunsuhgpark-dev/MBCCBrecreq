export type UserRole = 'Admin' | 'ENG' | 'ENG-M' | 'CAM' | 'CAM-M' | 'Producer' | 'Director'

export type RequestType = 'recording' | 'dispatch'

export type ScheduleStatus = 'conflict' | 'pending' | 'assigned' | 'confirmed' | 'rejected'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type ApprovalPart = 'office' | 'sub_control'

export type ConflictType = 'venue' | 'resource' | 'both'

export type NotificationType =
  | 'schedule_submitted'
  | 'conflict_detected'
  | 'negotiation_complete'
  | 'approval_requested'
  | 'approved'
  | 'rejected'
  | 'confirmed'
  | 'assignment_requested'
  | 'assignment_completed'
  | 'user_signup_requested'

/** 영상국 배정 회신 — 차량 1대 단위 */
export interface AssignmentVehicle {
  driver_name: string
  vehicle_info?: string
  contact?: string
}

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole | null
  is_approved: boolean
  fcm_token: string | null
  created_at: string
}

export interface Schedule {
  id: string
  created_by: string
  request_type: RequestType
  status: ScheduleStatus
  program_name: string
  responsible_pd: string
  broadcast_at: string | null
  rehearsal_staff_at: string | null
  rehearsal_cast_at: string | null
  broadcast_start: string
  broadcast_end: string
  location: string
  venue: string
  use_relay_car: boolean
  use_studio: boolean
  use_eng: boolean
  use_audio: boolean
  is_live: boolean
  record_content: string
  notes: string
  passenger_count: number | null
  has_luggage: boolean
  assignment_vehicles: AssignmentVehicle[] | null
  assignment_director_accompany: boolean | null
  assignment_notes: string | null
  assigned_at: string | null
  assigned_by: string | null
  has_conflict?: boolean
  created_at: string
  updated_at: string
  // joined
  creator?: Profile
  approvals?: Approval[]
  conflicts?: ScheduleConflict[]
}

export interface ScheduleConflict {
  id: string
  schedule_id: string
  conflicting_schedule_id: string
  conflict_type: ConflictType
  resolved: boolean
  created_at: string
  conflicting_schedule?: Schedule
}

export interface Approval {
  id: string
  schedule_id: string
  approver_id: string
  part: ApprovalPart
  status: ApprovalStatus
  reject_reason: string | null
  decided_at: string | null
  approver?: Profile
}

export interface Notification {
  id: string
  user_id: string
  schedule_id: string | null
  type: NotificationType
  message: string
  is_read: boolean
  created_at: string
  schedule?: Schedule
}

export interface ConflictCheckInput {
  broadcastStart: string
  broadcastEnd: string
  venue: string
  useRelayCar: boolean
  useStudio: boolean
  useEng: boolean
  useAudio: boolean
  excludeScheduleId?: string
  requestType?: RequestType
}

export interface OverlapEvent {
  id: string
  program_name: string
  responsible_pd: string
  broadcast_start: string
  broadcast_end: string
  venue: string
  request_type: RequestType
  conflict_type: ConflictType
}

export interface ConflictResult {
  hasConflict: boolean
  conflictingScheduleIds: string[]
  conflictType: ConflictType | null
  overlaps: OverlapEvent[]
}

export interface ScheduleRecordEntry {
  date: string
  time?: string
  place?: string
  note?: string
}

export interface ScheduleRecord {
  id: string
  type: 'office-schedule'
  uploadedAt: string
  memo: string
  summary: string
  details: {
    title: string
    program: string
    period: string
    entries: ScheduleRecordEntry[]
  }
}

/** 송출/행정 — Google Calendar 양방향 sync 이벤트 */
export interface OfficeEvent {
  id: string
  google_event_id: string | null
  title: string
  description: string | null
  location: string | null
  start_at: string | null
  end_at: string | null
  all_day: boolean
  start_date: string | null
  end_date: string | null
  created_by: string | null
  author_name: string
  author_role: string | null
  etag: string | null
  google_updated_at: string | null
  local_updated_at: string
  dirty: boolean
  deleted_at: string | null
  created_at: string
}

/** 사내 ERP 휴가 데이터 */
export interface Vacation {
  id: string
  /** approval_number|start|end|half_day — 동일 결재번호의 일자별 행 구분 */
  sync_key?: string
  approval_number: string
  name: string
  vacation_type: string
  start_date: string   // YYYY-MM-DD
  end_date: string     // YYYY-MM-DD
  half_day: string | null  // K열: '오전' | '오후' | null (일반 휴가)
  uploaded_at: string
}
