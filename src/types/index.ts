export type LessonStatus = 'planned' | 'completed' | 'missed' | 'missed_excused' | 'missed_penalty';

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
  phone?: string;
  telegram?: string;
  schedule_notes?: string;
  color?: string;
  is_active?: boolean;
  created_at: string;
  
  // Расчетные поля посещаемости
  makeup_debt: number; // количество активных отработок (pending makeups)
  conducted_this_month?: number;
  missed_this_month?: number;
  
  // Поля обратной совместимости (всегда определены числом для предотвращения TS18048)
  price_per_lesson: number;
  prepaid_balance: number;
  package_total_lessons?: number;
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
  
  // Поле обратной совместимости
  price_per_lesson?: number;
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
  period: 'week' | 'month';
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

// Устаревший интерфейс для мягкой миграции
export interface FinanceSummary {
  earnedThisMonthUzs: number;
  completedLessonsCount: number;
}
