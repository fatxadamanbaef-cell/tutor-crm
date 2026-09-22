import { Lesson } from '@/types';
import { format, addDays, getDay, parseISO } from 'date-fns';

export interface ScheduleGeneratorOptions {
  student_id: string;
  student_name?: string;
  student_color?: string;
  student_payment_type?: 'per_lesson' | 'package';
  selected_days: number[]; // 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб, 0=Вс
  start_time: string; // HH:mm
  duration_minutes: number;
  price: number;
  start_date: string; // YYYY-MM-DD
  total_lessons?: number; // e.g. 8 or 12
  notes?: string;
}

export function generateRecurringLessons(options: ScheduleGeneratorOptions): Lesson[] {
  const generated: Lesson[] = [];
  const targetCount = options.total_lessons || 8;
  const selectedDays = new Set(options.selected_days);

  if (selectedDays.size === 0) return [];

  let currentDate = parseISO(options.start_date);
  let count = 0;
  let safetyLoops = 0;

  // Calculate end time
  const [h, m] = options.start_time.split(':').map(Number);
  const tempDate = new Date();
  tempDate.setHours(h, m, 0, 0);
  tempDate.setMinutes(tempDate.getMinutes() + (options.duration_minutes || 60));
  const endTime = format(tempDate, 'HH:mm');

  while (count < targetCount && safetyLoops < 365) {
    safetyLoops++;
    const dayOfWeek = getDay(currentDate); // 0 (Вс) to 6 (Сб)

    if (selectedDays.has(dayOfWeek)) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      generated.push({
        id: `l_${Date.now()}_${count}_${Math.random().toString(36).substr(2, 4)}`,
        student_id: options.student_id,
        student_name: options.student_name || 'Ученик',
        student_color: options.student_color || '#3B82F6',
        student_payment_type: options.student_payment_type || 'package',
        lesson_date: dateStr,
        start_time: options.start_time,
        end_time: endTime,
        price: options.price,
        status: 'scheduled',
        is_paid: options.student_payment_type === 'package',
        notes: options.notes || '',
        created_at: new Date().toISOString(),
      });
      count++;
    }

    currentDate = addDays(currentDate, 1);
  }

  return generated;
}
