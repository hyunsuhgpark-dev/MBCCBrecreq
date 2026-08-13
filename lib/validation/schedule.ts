import { z } from 'zod'

const nullableDateTime = z.string().datetime({ offset: true }).nullable().optional()

export const scheduleFieldsSchema = z.object({
  request_type: z.enum(['recording', 'dispatch']).default('recording'),
  program_name: z.string().trim().min(1, '프로그램명을 입력하세요').max(200),
  responsible_pd: z.string().trim().min(1, '담당 PD를 입력하세요').max(100),
  broadcast_at: nullableDateTime,
  rehearsal_staff_at: nullableDateTime,
  rehearsal_cast_at: nullableDateTime,
  broadcast_start: z.string().datetime({ offset: true }),
  broadcast_end: z.string().datetime({ offset: true }),
  location: z.string().trim().max(500).default(''),
  venue: z.string().trim().min(1, '장소 또는 목적지를 입력하세요').max(500),
  use_relay_car: z.boolean().default(false),
  use_studio: z.boolean().default(false),
  use_eng: z.boolean().default(false),
  use_audio: z.boolean().default(false),
  is_live: z.boolean().default(false),
  record_content: z.string().max(10_000).default(''),
  notes: z.string().max(10_000).default(''),
  passenger_count: z.number().int().min(1).max(100).nullable().optional(),
  has_luggage: z.boolean().default(false),
  notify_tech: z.boolean().default(false),
}).strict()

function validateScheduleRange(
  value: { broadcast_start?: string; broadcast_end?: string; request_type?: string; passenger_count?: number | null },
  ctx: z.RefinementCtx,
) {
  if (
    value.broadcast_start &&
    value.broadcast_end &&
    new Date(value.broadcast_end) <= new Date(value.broadcast_start)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['broadcast_end'],
      message: '종료 시간은 시작 시간보다 늦어야 합니다',
    })
  }

  if (value.request_type === 'dispatch' && !value.passenger_count) {
    ctx.addIssue({
      code: 'custom',
      path: ['passenger_count'],
      message: '배차 신청의 탑승 인원이 필요합니다',
    })
  }
}

export const createScheduleSchema = scheduleFieldsSchema.superRefine(validateScheduleRange)
export const updateScheduleSchema = scheduleFieldsSchema.partial().strict()

export const approvalRequestSchema = z.object({
  scheduleId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'force_approve']),
  rejectReason: z.string().trim().min(1).max(2000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'reject' && !value.rejectReason) {
    ctx.addIssue({
      code: 'custom',
      path: ['rejectReason'],
      message: '반려 사유가 필요합니다',
    })
  }
})

export const assignmentRequestSchema = z.object({
  assignment_vehicles: z.array(z.object({
    driver_name: z.string().trim().min(1, '기사명이 필요합니다').max(100),
    vehicle_info: z.string().trim().max(200).optional(),
    contact: z.string().trim().max(100).optional(),
  }).strict()).min(1).max(10),
  assignment_director_accompany: z.boolean().default(false),
  assignment_notes: z.string().trim().max(5000).nullable().optional(),
}).strict()

export const adminUserUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['Admin', 'ENG', 'ENG-M', 'CAM', 'CAM-M', 'Producer', 'Director']).optional(),
  isApproved: z.boolean().optional(),
}).strict().refine(
  (value) => value.role !== undefined || value.isApproved !== undefined,
  { message: '변경할 값이 필요합니다' },
)

export type SchedulePayload = z.infer<typeof scheduleFieldsSchema>
