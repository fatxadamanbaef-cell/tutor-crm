export type LessonStatus = 'planned' | 'completed' | 'missed' | 'missed_excused' | 'missed_penalty' | 'scheduled';

export type BillingType = 'date_to_date' | 'package';

export type PaymentMethod = 'payme' | 'click' | 'card' | 'cash';

export interface Payment {
  id: string;
  student_id: string;
  student_name?: string;
  amount_uzs: number;
  lessons_added: number;
  payment_method: PaymentMethod;
  paid_at: string; // ISO timestamptz
  note?: string | null;
  created_at: string;
}

export interface RecurringSlot {
  dayOfWeek: number; // 1 (Пн) .. 7 (Вс)
  startTime: string; // '16:00'
  endTime?: string;  // '17:30'
}

export interface Student {
  id: string;
  name: string;
  monthly_target_lessons: number; // норма уроков в месяц (например 8, 12, 20)
  recurring_schedule?: RecurringSlot[];
  billing_day?: string | number; // день оплаты (строка или число, например "10" или "10 число")
  billing_type: BillingType; // 'date_to_date' | 'package'
  lesson_rate: number; // стоимость одного урока (например 300000)
  lessons_balance: number; // текущий баланс уроков (например 0, +4, -1)
  phone?: string;
  telegram?: string;
  schedule_notes?: string;
  color?: string;
  is_active?: boolean;
  created_at: string;
  
  // Расчетные поля посещаемости
  makeup_debt?: number; // legacy
  conducted_this_month?: number;
  missed_this_month?: number;
}

export interface Lesson {
  id: string;
  student_id: string;
  student_name?: string;
  date: string; // ISO timestamptz (например 2026-10-28T14:00:00+05:00)
  time_str?: string; // e.g. "14:00 - 15:30"
  status: LessonStatus;
  miss_reason?: string;
  needs_makeup?: boolean;
  is_makeup?: boolean;
  reminder_sent?: boolean;
  notes?: string;
  created_at: string;
}

export interface Makeup {
  id: string;
  student_id: string;
  student_name?: string;
  missed_lesson_id: string;
  scheduled_lesson_id?: string;
  reason?: string;
  status: 'pending' | 'scheduled' | 'completed' | 'archived';
  missed_date?: string;
  created_at: string;
}

export interface AttendanceSummary {
  period: 'today' | 'week' | 'month';
  completedCount: number;
  targetCount: number;
  missedCount: number;
  makeupsCount: number;
  missedDetails: Array<{
    studentName: string;
    date: string;
    reason: string;
  }>;
  makeupDetails: Array<{
    studentName: string;
    date: string;
    status: string;
  }>;
}

export interface BillingCalculation {
  studentId: string;
  studentName: string;
  billingType: BillingType;
  lessonRate: number;
  lessonsBalance: number;
  // date_to_date fields
  startDate?: string;
  endDate?: string;
  scheduledLessonsCount?: number;
  grossAmount?: number;
  lessonsToPay?: number;
  netAmount?: number;
  // package fields
  packageSize?: number;
  packageAmount?: number;
  // Summary in Russian
  summaryText: string;
}
