export type PaymentType = 'per_lesson' | 'package';

export type LessonStatus = 'scheduled' | 'completed' | 'missed_makeup' | 'made_up' | 'cancelled';

export type MakeupStatus = 'pending' | 'scheduled' | 'completed';

export type Currency = 'сум' | '₽' | '$' | '₸' | '€';

export interface ScheduleDaySlot {
  dayOfWeek: number; // 1 = Пн, 2 = Вт, 3 = Ср, 4 = Чт, 5 = Пт, 6 = Сб, 0 = Вс
  startTime: string; // HH:mm
}

export interface Student {
  id: string;
  name: string;
  phone?: string;
  telegram?: string;
  price_per_lesson: number;
  payment_type: PaymentType;
  package_total_lessons: number;
  package_remaining_lessons: number;
  color: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Lesson {
  id: string;
  student_id: string;
  student_name?: string;
  student_color?: string;
  student_payment_type?: PaymentType;
  lesson_date: string; // YYYY-MM-DD
  start_time: string;  // HH:MM
  end_time: string;    // HH:MM
  price: number;
  status: LessonStatus;
  is_paid: boolean;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface Payment {
  id: string;
  student_id: string;
  student_name?: string;
  amount: number;
  lessons_count: number;
  payment_date: string; // YYYY-MM-DD
  payment_method: string;
  notes?: string;
  created_at: string;
}

export interface MakeupLesson {
  id: string;
  student_id: string;
  student_name?: string;
  missed_lesson_id?: string;
  makeup_lesson_id?: string;
  status: MakeupStatus;
  reason?: string;
  created_at: string;
  updated_at?: string;
  missed_date?: string;
}
