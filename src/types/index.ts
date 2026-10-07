export type LessonStatus = 'planned' | 'completed' | 'missed_excused' | 'missed_penalty';

export interface Student {
  id: string;
  name: string;
  price_per_lesson: number;
  prepaid_balance: number; // сколько уроков оплачено вперед
  package_total_lessons?: number; // лимит слотов в абонементе (по умолчанию 8)
  billing_day?: string | number;     // день оплаты (строка или число)
  makeup_debt: number;     // долг по отработкам (пропущено по уваж. причине)
  phone?: string;
  telegram?: string;
  schedule_notes?: string;
  created_at: string;
  color?: string;
}

export interface Lesson {
  id: string;
  student_id: string;
  student_name?: string;
  price_per_lesson?: number;
  date: string; // ISO timestamptz
  time_str?: string; // e.g. "18:00 - 19:30"
  status: LessonStatus;
  notes?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  student_id: string;
  student_name?: string;
  amount_uzs: number;
  lessons_added: number;
  created_at: string;
}

export interface FinanceSummary {
  earnedThisMonthUzs: number;
  completedLessonsCount: number;
}
