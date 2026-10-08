import { Student, Lesson, Payment, FinanceSummary, LessonStatus } from '@/types';
import { supabase, isSupabaseConfigured } from './supabase';
import { getTashkentTodayStr, getTashkentNow, formatTimeSlot } from './formatters';
import { generateUUID } from './uuid';
import { format, startOfMonth, endOfMonth, parseISO, addDays } from 'date-fns';

// Direct Supabase storage layer

export async function getStudents(): Promise<Student[]> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const { data: studentsData, error: stError } = await supabase
    .from('tutor_students')
    .select('*')
    .order('name');

  if (stError) {
    console.error('Supabase getStudents error:', stError);
    throw stError;
  }



  // Get makeups count per student
  const { data: makeupsData } = await supabase
    .from('tutor_makeups')
    .select('student_id, status')
    .eq('status', 'pending');

  const makeupsCountMap: Record<string, number> = {};
  (makeupsData || []).forEach((m) => {
    makeupsCountMap[m.student_id] = (makeupsCountMap[m.student_id] || 0) + 1;
  });

  return (studentsData || []).filter((s) => !String(s.name).startsWith('_BOT_')).map((s) => ({
    id: s.id,
    name: s.name,
    price_per_lesson: Number(s.price_per_lesson) || 150000,
    prepaid_balance: Number(s.package_remaining_lessons) ?? 0,
    package_total_lessons: Number(s.package_total_lessons) || 8,
    billing_day: s.billing_day || '10 число',
    makeup_debt: makeupsCountMap[s.id] || 0,
    phone: s.phone || '',
    telegram: s.telegram || '',
    schedule_notes: s.notes || '',
    color: s.color || '#3B82F6',
    created_at: s.created_at,
  }));
}

export async function saveStudent(student: {
  id?: string;
  name: string;
  price_per_lesson: number;
  prepaid_balance: number;
  phone?: string;
  telegram?: string;
  schedule_notes?: string;
  billing_day?: string;
  color?: string;
}): Promise<Student> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const studentId = student.id || generateUUID();
  const dbPayload = {
    id: studentId,
    name: student.name.trim(),
    price_per_lesson: Number(student.price_per_lesson) || 150000,
    package_remaining_lessons: Number(student.prepaid_balance) || 0,
    package_total_lessons: Math.max(8, Number(student.prepaid_balance) || 8),
    phone: student.phone || '',
    telegram: student.telegram ? (student.telegram.startsWith('@') ? student.telegram : `@${student.telegram}`) : '',
    color: student.color || '#3B82F6',
    payment_type: 'package',
    billing_day: student.billing_day || '10',
    notes: student.schedule_notes || '',
    is_active: true,
  };

  const { data, error } = await supabase
    .from('tutor_students')
    .upsert([dbPayload])
    .select()
    .single();

  if (error) {
    console.error('Supabase saveStudent error:', error);
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    price_per_lesson: Number(data.price_per_lesson),
    prepaid_balance: Number(data.package_remaining_lessons),
    package_total_lessons: Number(data.package_total_lessons) || 8,
    billing_day: data.billing_day || '10 число',
    makeup_debt: 0,
    phone: data.phone || '',
    telegram: data.telegram || '',
    schedule_notes: data.notes || '',
    color: data.color || '#3B82F6',
    created_at: data.created_at,
  };
}

export async function deleteStudent(studentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');

  await supabase.from('tutor_lessons').delete().eq('student_id', studentId);
  await supabase.from('tutor_makeups').delete().eq('student_id', studentId);
  await supabase.from('tutor_payments').delete().eq('student_id', studentId);
  const { error } = await supabase.from('tutor_students').delete().eq('id', studentId);
  if (error) throw error;
}

// -------------------------------------------------------------
// LESSONS API (Direct Supabase)
// -------------------------------------------------------------
export async function getLessons(): Promise<Lesson[]> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const { data, error } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(name, price_per_lesson)')
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Supabase getLessons error:', error);
    throw error;
  }

  return (data || []).map((l) => {
    const status: LessonStatus =
      l.status === 'completed'
        ? 'completed'
        : l.status === 'missed_penalty' || l.status === 'missed_burned' || l.status === 'burned'
        ? 'missed_penalty'
        : l.status === 'missed_makeup' || l.status === 'missed_excused'
        ? 'missed_excused'
        : 'planned';

    const startTimeClean = (l.start_time || '18:00').substring(0, 5);
    const endTimeClean = (l.end_time || '19:30').substring(0, 5);
    const timeStr = `${startTimeClean} - ${endTimeClean}`;
    const isoDate = `${l.lesson_date}T${startTimeClean}:00+05:00`;

    return {
      id: l.id,
      student_id: l.student_id,
      student_name: l.tutor_students?.name || 'Ученик',
      price_per_lesson: Number(l.price || l.tutor_students?.price_per_lesson) || 150000,
      date: isoDate,
      time_str: timeStr,
      status,
      notes: l.notes || '',
      created_at: l.created_at,
    };
  });
}

export async function updateLessonTime(lessonId: string, timeStr: string, newDateStr?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const parts = timeStr.split('-').map(s => s.trim());
  const startTime = parts[0] || '18:00';
  const endTime = parts[1] || '19:30';

  const updatePayload: any = {
    start_time: startTime,
    end_time: endTime
  };
  if (newDateStr) updatePayload.lesson_date = newDateStr;

  const { error } = await supabase.from('tutor_lessons').update(updatePayload).eq('id', lessonId);
  if (error) throw error;
}

export async function updateLessonDetails(lessonId: string, updates: Partial<Lesson>): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const payload: any = {};
  
  if (updates.date) payload.lesson_date = updates.date.substring(0, 10);
  if (updates.time_str) {
    const parts = updates.time_str.split('-').map(s => s.trim());
    payload.start_time = parts[0] || '18:00';
    payload.end_time = parts[1] || '19:30';
  }
  if (updates.notes !== undefined) payload.notes = updates.notes;


  const { error } = await supabase.from('tutor_lessons').update(payload).eq('id', lessonId);
  if (error) throw error;
}

export async function saveLesson(lessonData: {
  student_id: string;
  date: string;
  time_str?: string;
  notes?: string;
  status?: LessonStatus;
}): Promise<Lesson> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const lessonDate = lessonData.date.substring(0, 10); // YYYY-MM-DD
  let startTime = '18:00';
  let endTime = '19:30';

  if (lessonData.time_str && lessonData.time_str.includes('-')) {
    const parts = lessonData.time_str.split('-').map((s) => s.trim());
    startTime = parts[0] || '18:00';
    endTime = parts[1] || '19:30';
  } else if (lessonData.date.includes('T')) {
    startTime = lessonData.date.substring(11, 16);
    const [h, m] = startTime.split(':').map(Number);
    const endMinutes = h * 60 + m + 90;
    const eh = Math.floor(endMinutes / 60) % 24;
    const em = endMinutes % 60;
    endTime = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
  }

  const dbStatus =
    lessonData.status === 'completed'
      ? 'completed'
      : lessonData.status === 'missed_excused'
      ? 'missed_makeup'
      : 'scheduled';

  // Get student info
  const { data: stData } = await supabase
    .from('tutor_students')
    .select('id, name, price_per_lesson, package_remaining_lessons')
    .eq('id', lessonData.student_id)
    .single();

  const studentPrice = Number(stData?.price_per_lesson) || 150000;
  const studentName = stData?.name || 'Ученик';
  const remainingLessons = Number(stData?.package_remaining_lessons) || 0;

  const newId = generateUUID();
  const dbPayload: any = {
    id: newId,
    student_id: lessonData.student_id,
    lesson_date: lessonDate,
    start_time: startTime,
    end_time: endTime,
    status: dbStatus,
    price: studentPrice,
    notes: lessonData.notes || '',
  };

  const { data, error } = await supabase
    .from('tutor_lessons')
    .insert([dbPayload])
    .select('*, tutor_students(name, price_per_lesson)')
    .single();

  if (error) {
    console.error('Supabase saveLesson insert error:', error);
    throw error;
  }

  if (lessonData.status === 'completed') {
    await supabase.rpc('update_student_balance', { p_student_id: lessonData.student_id, p_delta: -1 });
  }

  return {
    id: data.id,
    student_id: data.student_id,
    student_name: data.tutor_students?.name || studentName,
    price_per_lesson: Number(data.price || data.tutor_students?.price_per_lesson || studentPrice),
    date: `${data.lesson_date}T${startTime}:00+05:00`,
    time_str: `${startTime} - ${endTime}`,
    status: lessonData.status || 'planned',
    notes: data.notes || '',
    created_at: data.created_at,
  };
}

export async function saveBatchLessons(newLessons: Lesson[]): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  if (newLessons.length === 0) return;

  const dbPayload = newLessons.map((l) => {
    const lessonDate = l.date.substring(0, 10);
    let startTime = '18:00';
    let endTime = '19:30';

    if (l.time_str && l.time_str.includes('-')) {
      const parts = l.time_str.split('-').map((s) => s.trim());
      startTime = parts[0] || '18:00';
      endTime = parts[1] || '19:30';
    } else if (l.date.includes('T')) {
      startTime = l.date.substring(11, 16);
      const [h, m] = startTime.split(':').map(Number);
      const endMinutes = h * 60 + m + 90;
      const eh = Math.floor(endMinutes / 60) % 24;
      const em = endMinutes % 60;
      endTime = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
    }

    const dbStatus =
      l.status === 'completed'
        ? 'completed'
        : l.status === 'missed_excused'
        ? 'missed_makeup'
        : 'scheduled';

    return {
      id: l.id || generateUUID(),
      student_id: l.student_id,
      lesson_date: lessonDate,
      start_time: startTime,
      end_time: endTime,
      price: Number(l.price_per_lesson) || 150000,
      status: dbStatus,
      notes: l.notes || 'Плановый урок',
    };
  });

  const { error } = await supabase.from('tutor_lessons').upsert(dbPayload);
  if (error) {
    console.error('Supabase saveBatchLessons error:', error);
    throw error;
  }
}

export async function deleteLesson(lessonId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const { error } = await supabase.from('tutor_lessons').delete().eq('id', lessonId);
  if (error) throw error;
}

export async function updateLesson(
  lessonId: string,
  updates: {
    date?: string;
    time_str?: string;
    notes?: string;
    status?: LessonStatus;
  }
): Promise<Lesson> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const dbUpdate: any = {};
  if (updates.notes !== undefined) dbUpdate.notes = updates.notes;

  if (updates.date) {
    dbUpdate.lesson_date = updates.date.substring(0, 10);
  }

  if (updates.time_str && updates.time_str.includes('-')) {
    const parts = updates.time_str.split('-').map((s) => s.trim());
    dbUpdate.start_time = parts[0] || '18:00';
    dbUpdate.end_time = parts[1] || '19:30';
  }

  if (updates.status) {
    dbUpdate.status =
      updates.status === 'completed'
        ? 'completed'
        : updates.status === 'missed_penalty'
        ? 'missed_penalty'
        : updates.status === 'missed_excused'
        ? 'missed_makeup'
        : 'scheduled';
  }

  const { data, error } = await supabase
    .from('tutor_lessons')
    .update(dbUpdate)
    .eq('id', lessonId)
    .select('*, tutor_students(name, price_per_lesson)')
    .single();

  if (error) throw error;

  const startTimeClean = (data.start_time || '18:00').substring(0, 5);
  const endTimeClean = (data.end_time || '19:30').substring(0, 5);

  return {
    id: data.id,
    student_id: data.student_id,
    student_name: data.tutor_students?.name || 'Ученик',
    price_per_lesson: Number(data.price || data.tutor_students?.price_per_lesson) || 150000,
    date: `${data.lesson_date}T${startTimeClean}:00+05:00`,
    time_str: `${startTimeClean} - ${endTimeClean}`,
    status: updates.status || (data.status === 'completed' ? 'completed' : data.status === 'missed_makeup' ? 'missed_excused' : 'planned'),
    notes: data.notes || '',
    created_at: data.created_at,
  };
}

// TAP-TO-TOGGLE CYCLE ON LESSON CARD:
// planned -> completed (-1 prepaid_balance)
// completed -> missed_excused (+1 balance restored, +1 makeup_debt)
// missed_excused -> planned (-1 makeup_debt)
export async function toggleLessonStatus(lessonId: string): Promise<LessonStatus> {
  if (!supabase) throw new Error('Supabase is not initialized');

  // Fetch current lesson
  const { data: lesson, error: lError } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(id, package_remaining_lessons, name)')
    .eq('id', lessonId)
    .single();

  if (lError || !lesson) throw new Error('Lesson not found');

  const studentId = lesson.student_id;
  const currentRemaining = Number(lesson.tutor_students?.package_remaining_lessons) || 0;
  const currStatus = lesson.status;

  let nextDbStatus = 'scheduled';
  let nextAppStatus: LessonStatus = 'planned';

  if (currStatus === 'scheduled') {
    // 1st Tap: Mark COMPLETED -> deduct 1 balance
    nextDbStatus = 'completed';
    nextAppStatus = 'completed';

    await supabase.rpc('update_student_balance', { p_student_id: studentId, p_delta: -1 });
  } else {
    // 2nd Tap: Revert to PLANNED -> restore balance
    nextDbStatus = 'scheduled';
    nextAppStatus = 'planned';

    if (currStatus === 'completed') {
      await supabase.rpc('update_student_balance', { p_student_id: studentId, p_delta: 1 });
    }
  }

  // Update lesson status in db
  await supabase
    .from('tutor_lessons')
    .update({ status: nextDbStatus })
    .eq('id', lessonId);

  return nextAppStatus;
}

// Direct action helpers
export async function completeLesson(lessonId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const { data: lesson } = await supabase
    .from('tutor_lessons')
    .select('student_id, status, tutor_students(package_remaining_lessons)')
    .eq('id', lessonId)
    .single();

  if (lesson && lesson.status !== 'completed') {
    await supabase.rpc('update_student_balance', { p_student_id: lesson.student_id, p_delta: -1 });
    await supabase.from('tutor_lessons').update({ status: 'completed' }).eq('id', lessonId);
  }
}

export async function burnLesson(lessonId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const { data: lesson } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(id, package_remaining_lessons)')
    .eq('id', lessonId)
    .single();

  if (lesson) {
    if (lesson.status === 'missed_makeup' || lesson.status === 'missed_excused' || lesson.status === 'scheduled') {
      await supabase.rpc('update_student_balance', { p_student_id: lesson.student_id, p_delta: -1 });
    }

    await supabase.from('tutor_lessons').update({ status: 'missed_penalty' }).eq('id', lessonId);
    await supabase.from('tutor_makeups').delete().eq('missed_lesson_id', lessonId).eq('status', 'pending');
  }
}

// ---------------------------------------------------------------------------
// Date helpers (строковая арифметика — не зависит от часового пояса сервера)
// ---------------------------------------------------------------------------
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}

function dayOfWeekOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Вс … 6=Сб
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function addMinutesToTime(t: string, minutes: number): string {
  const total = (toMinutes(t) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Приводит '19', '19.00', '19:00', '19:00-20:30' к виду { start: '19:00', end: '20:30' }.
 * Если конец не указан — длительность 90 минут.
 */
export function parseTimeRange(input: string, defaultMinutes = 90): { start: string; end: string } {
  const matches = [...String(input || '').matchAll(/(\d{1,2})(?:[:.](\d{2}))?/g)];
  if (matches.length === 0) throw new Error(`Не удалось распознать время "${input}"`);
  const fmt = (m: RegExpMatchArray) => {
    const h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (h > 23 || min > 59) throw new Error(`Некорректное время "${input}"`);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };
  const start = fmt(matches[0]);
  const end = matches.length > 1 ? fmt(matches[1]) : addMinutesToTime(start, defaultMinutes);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Новый ученик "одним махом"
// ---------------------------------------------------------------------------
export interface SetupNewStudentParams {
  name: string;
  scheduleNotes: string;
  billingDay: string;
  lessonsPaid: number;
  pricePerLesson?: number;
  amountPaidUzs?: number;
  paymentDate?: string;
  pastCompletedDates: string[];
  scheduleDays: { dayOfWeek: number; timeStr: string }[];
}

export interface SetupNewStudentResult {
  studentId: string;
  pricePerLesson: number;
  balance: number;
  pastLogged: number;
  plannedDates: string[];
}

export async function setupNewStudent(p: SetupNewStudentParams): Promise<SetupNewStudentResult> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const lessonsPaid = Math.max(0, Math.floor(Number(p.lessonsPaid) || 0));
  const amount = Number(p.amountPaidUzs) || 0;
  const price =
    Number(p.pricePerLesson) > 0
      ? Number(p.pricePerLesson)
      : amount > 0 && lessonsPaid > 0
      ? Math.round(amount / lessonsPaid)
      : 150000;

  // 1. Создаём ученика с нулевым балансом (баланс пополнит оплата — так в истории будет запись)
  const student = await saveStudent({
    name: p.name,
    price_per_lesson: price,
    prepaid_balance: 0,
    schedule_notes: p.scheduleNotes,
    billing_day: p.billingDay,
  });

  // 2. Оплата (пополняет баланс и пишет историю платежей)
  if (lessonsPaid > 0) {
    await addPayment(student.id, amount > 0 ? amount : price * lessonsPaid, lessonsPaid, p.paymentDate);
    await supabase.from('tutor_students').update({ package_total_lessons: lessonsPaid }).eq('id', student.id);
  }

  // 3. Уже проведённые уроки (списывают баланс)
  const pastDates = [...new Set((p.pastCompletedDates || []).map((d) => d.substring(0, 10)))].sort();
  let pastLogged = 0;
  for (const dateStr of pastDates) {
    const r = await logPastCompletedLesson(student.id, dateStr);
    if (r === 'created' || r === 'completed_existing') pastLogged++;
  }

  // 4. Будущие уроки по остатку баланса
  const { data: stData } = await supabase
    .from('tutor_students')
    .select('package_remaining_lessons')
    .eq('id', student.id)
    .single();
  const balance = Number(stData?.package_remaining_lessons) || 0;

  let plannedDates: string[] = [];
  if (balance > 0 && (p.scheduleDays || []).length > 0) {
    plannedDates = (await planFutureLessons(student.id, balance, p.scheduleDays)).created;
  }

  return { studentId: student.id, pricePerLesson: price, balance, pastLogged, plannedDates };
}

// ---------------------------------------------------------------------------
// Автопланирование уроков по шаблону недели
// ---------------------------------------------------------------------------
export async function planFutureLessons(
  studentId: string,
  count: number,
  schedule: { dayOfWeek: number; timeStr: string }[], // 0=Sun, 1=Mon, ..., 6=Sat
  startDateStr?: string
): Promise<{ created: string[]; skipped: string[] }> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const result = { created: [] as string[], skipped: [] as string[] };
  if (count <= 0 || schedule.length === 0) return result;

  // Нормализуем шаблон: день недели + время
  const slots = schedule.map((s) => {
    const dow = Number(s.dayOfWeek);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) throw new Error(`Некорректный день недели: ${s.dayOfWeek}`);
    return { dow, ...parseTimeRange(s.timeStr) };
  });

  const { data: stData } = await supabase
    .from('tutor_students')
    .select('price_per_lesson')
    .eq('id', studentId)
    .single();
  const price = Number(stData?.price_per_lesson) || 150000;

  const today = getTashkentTodayStr();
  const nowMinutes = (() => {
    const n = getTashkentNow();
    return n.getHours() * 60 + n.getMinutes();
  })();

  // Все уроки ученика с сегодняшнего дня — чтобы не создавать дубликаты и продолжить после последнего
  const { data: existing } = await supabase
    .from('tutor_lessons')
    .select('lesson_date, start_time, status')
    .eq('student_id', studentId)
    .gte('lesson_date', today);

  const occupiedDates = new Set<string>((existing || []).map((l) => String(l.lesson_date).substring(0, 10)));

  let startDate = startDateStr ? startDateStr.substring(0, 10) : today;
  if (!startDateStr) {
    const lastPlanned = (existing || [])
      .filter((l) => l.status === 'scheduled')
      .map((l) => String(l.lesson_date).substring(0, 10))
      .sort()
      .pop();
    if (lastPlanned && lastPlanned >= startDate) startDate = addDaysStr(lastPlanned, 1);
  }
  if (startDate < today) startDate = today;

  const newLessons: any[] = [];
  let cursor = startDate;

  for (let i = 0; i < 400 && newLessons.length < count; i++, cursor = addDaysStr(cursor, 1)) {
    const slot = slots.find((s) => s.dow === dayOfWeekOf(cursor));
    if (!slot) continue;

    if (occupiedDates.has(cursor)) {
      result.skipped.push(`${cursor} (уже есть урок)`);
      continue;
    }
    // Сегодняшний урок, время которого уже прошло, не планируем (это "уже проведённый")
    if (cursor === today && toMinutes(slot.start) <= nowMinutes) {
      result.skipped.push(`${cursor} ${slot.start} (время уже прошло)`);
      continue;
    }

    newLessons.push({
      id: generateUUID(),
      student_id: studentId,
      lesson_date: cursor,
      start_time: slot.start,
      end_time: slot.end,
      status: 'scheduled',
      price,
      notes: 'Сгенерировано автоматически',
    });
    result.created.push(`${cursor} ${slot.start}`);
  }

  if (newLessons.length > 0) {
    const { error } = await supabase.from('tutor_lessons').insert(newLessons);
    if (error) {
      console.error('Error planning future lessons:', error);
      throw error;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ретроспективное списание
// ---------------------------------------------------------------------------
export type PastLessonResult = 'created' | 'completed_existing' | 'already_done' | 'skipped_future';

export async function logPastCompletedLesson(
  studentId: string,
  dateStr: string,
  timeStr?: string
): Promise<PastLessonResult> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const lessonDate = dateStr.substring(0, 10);
  const today = getTashkentTodayStr();

  // 1. Никогда не списываем будущие даты
  if (lessonDate > today) {
    console.warn(`Skipping future date ${lessonDate} for retroactive logging`);
    return 'skipped_future';
  }

  // 2. Если в этот день уже есть урок — работаем с ним, а не создаём дубль
  const { data: existingLessons } = await supabase
    .from('tutor_lessons')
    .select('id, status, start_time')
    .eq('student_id', studentId)
    .eq('lesson_date', lessonDate);

  if (existingLessons && existingLessons.length > 0) {
    const wanted = timeStr ? parseTimeRange(timeStr).start : null;
    const byTime = wanted
      ? existingLessons.filter((l) => String(l.start_time).substring(0, 5) === wanted)
      : existingLessons;
    const pool = byTime.length > 0 ? byTime : existingLessons;

    const open = pool.find((l) => l.status === 'scheduled') || pool.find((l) => l.status === 'missed_makeup' || l.status === 'missed_excused');
    if (!open) return 'already_done'; // completed / penalty — баланс уже учтён

    await supabase.from('tutor_lessons').update({ status: 'completed', notes: 'Ретроспективное списание' }).eq('id', open.id);
    await supabase.rpc('update_student_balance', { p_student_id: studentId, p_delta: -1 });
    await supabase.from('tutor_makeups').delete().eq('missed_lesson_id', open.id).eq('status', 'pending');
    return 'completed_existing';
  }

  // 3. Урока нет — создаём проведённый
  const { data: stData } = await supabase
    .from('tutor_students')
    .select('price_per_lesson')
    .eq('id', studentId)
    .single();
  const price = Number(stData?.price_per_lesson) || 150000;
  const range = timeStr ? parseTimeRange(timeStr) : { start: '18:00', end: '19:30' };

  const { error } = await supabase.from('tutor_lessons').insert([
    {
      id: generateUUID(),
      student_id: studentId,
      lesson_date: lessonDate,
      start_time: range.start,
      end_time: range.end,
      status: 'completed',
      price,
      notes: 'Ретроспективное списание',
    },
  ]);

  if (error) {
    console.error('Error logging past lesson:', error);
    throw error;
  }

  await supabase.rpc('update_student_balance', { p_student_id: studentId, p_delta: -1 });
  return 'created';
}

export async function setLessonStatusDirect(
  lessonId: string,
  targetStatus: LessonStatus
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const { data: lesson, error: lError } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(id, package_remaining_lessons, name)')
    .eq('id', lessonId)
    .single();

  if (lError || !lesson) throw new Error('Lesson not found');

  const studentId = lesson.student_id;
  const currentRemaining = Number(lesson.tutor_students?.package_remaining_lessons) || 0;
  const currStatus = lesson.status;

  const isCurrentlyDeducted = currStatus === 'completed' || currStatus === 'missed_penalty' || currStatus === 'missed_burned';
  const willBeDeducted = targetStatus === 'completed' || targetStatus === 'missed_penalty';

  let delta = 0;
  if (!isCurrentlyDeducted && willBeDeducted) {
    delta = -1;
  } else if (isCurrentlyDeducted && !willBeDeducted) {
    delta = 1;
  }

  if (delta !== 0) {
    await supabase.rpc('update_student_balance', { p_student_id: studentId, p_delta: delta });
  }

  let dbStatus = 'scheduled';
  if (targetStatus === 'completed') dbStatus = 'completed';
  else if (targetStatus === 'missed_excused') dbStatus = 'missed_makeup';
  else if (targetStatus === 'missed_penalty') dbStatus = 'missed_penalty';
  else dbStatus = 'scheduled';

  await supabase.from('tutor_lessons').update({ status: dbStatus }).eq('id', lessonId);

  if (targetStatus === 'missed_excused') {
    await supabase.from('tutor_makeups').upsert([
      {
        student_id: studentId,
        student_name: lesson.tutor_students?.name || 'Ученик',
        missed_lesson_id: lesson.id,
        reason: 'Пропуск урока',
        status: 'pending',
        missed_date: lesson.lesson_date,
      },
    ]);
  } else {
    await supabase
      .from('tutor_makeups')
      .delete()
      .eq('missed_lesson_id', lesson.id)
      .eq('status', 'pending');
  }
}

export async function toggleStudentCalendarDate(
  studentId: string,
  dateStr: string
): Promise<{ status: LessonStatus | null; lesson?: Lesson }> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const cleanDate = dateStr.substring(0, 10);
  const { data: existingLessons, error: findErr } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(id, package_remaining_lessons, price_per_lesson, name)')
    .eq('student_id', studentId)
    .eq('lesson_date', cleanDate);

  if (findErr) console.error('Supabase find lesson error:', findErr);

  const existing = existingLessons && existingLessons.length > 0 ? existingLessons[0] : null;

  const { data: stData } = await supabase
    .from('tutor_students')
    .select('id, package_remaining_lessons, price_per_lesson, name')
    .eq('id', studentId)
    .single();

  const currentRemaining = Number(stData?.package_remaining_lessons) || 0;
  const studentPrice = Number(stData?.price_per_lesson) || 150000;
  const studentName = stData?.name || 'Ученик';

  if (!existing) {
    // Empty -> COMPLETED (🟢)
    const newId = generateUUID();
    const newLessonObj = {
      id: newId,
      student_id: studentId,
      lesson_date: cleanDate,
      start_time: '18:00',
      end_time: '19:30',
      status: 'completed',
      price: studentPrice,
      notes: 'Проведенный урок',
    };

    await supabase.from('tutor_lessons').insert([newLessonObj]);
    await supabase.rpc('update_student_balance', { p_student_id: studentId, p_delta: -1 });

    const saved: Lesson = {
      id: newId,
      student_id: studentId,
      student_name: studentName,
      price_per_lesson: studentPrice,
      date: `${cleanDate}T18:00:00+05:00`,
      time_str: '18:00 - 19:30',
      status: 'completed',
      notes: 'Проведенный урок',
      created_at: new Date().toISOString(),
    };
    return { status: 'completed', lesson: saved };
  } else if (existing.status === 'planned' || existing.status === 'scheduled') {
    // Planned -> COMPLETED (🟢)
    await supabase.from('tutor_lessons').update({ status: 'completed', notes: 'Проведенный урок' }).eq('id', existing.id);
    await supabase.rpc('update_student_balance', { p_student_id: studentId, p_delta: -1 });

    const updated: Lesson = {
      id: existing.id,
      student_id: studentId,
      student_name: studentName,
      price_per_lesson: Number(existing.price) || studentPrice,
      date: `${cleanDate}T18:00:00+05:00`,
      time_str: '18:00 - 19:30',
      status: 'completed',
      notes: 'Проведенный урок',
      created_at: existing.created_at,
    };
    return { status: 'completed', lesson: updated };
  } else if (existing.status === 'completed') {
    // COMPLETED (🟢) -> MISSED_PENALTY (🔴) (Balance stays the same because penalty still consumes 1 lesson)
    await supabase.from('tutor_lessons').update({ status: 'missed_penalty', notes: 'Пропуск (сгорел)' }).eq('id', existing.id);

    const updated: Lesson = {
      ...existing,
      student_name: studentName,
      price_per_lesson: Number(existing.price) || studentPrice,
      date: `${cleanDate}T18:00:00+05:00`,
      time_str: '18:00 - 19:30',
      status: 'missed_penalty',
      notes: 'Пропуск (сгорел)',
    };
    return { status: 'missed_penalty', lesson: updated };
  } else {
    // MISSED_PENALTY (🔴) -> REMOVED (⚪)
    await supabase.from('tutor_lessons').delete().eq('id', existing.id);
    await supabase.rpc('update_student_balance', { p_student_id: studentId, p_delta: 1 });

    return { status: null };
  }
}

export async function missLesson(lessonId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const { data: lesson } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(package_remaining_lessons, name)')
    .eq('id', lessonId)
    .single();

  if (lesson && lesson.status !== 'missed_makeup') {
    const studentRel: any = lesson.tutor_students;
    const studentName = Array.isArray(studentRel) ? studentRel[0]?.name : studentRel?.name || 'Ученик';
    await supabase.from('tutor_lessons').update({ status: 'missed_makeup' }).eq('id', lessonId);
    await supabase.from('tutor_makeups').insert([{
      student_id: lesson.student_id,
      student_name: studentName,
      missed_lesson_id: lesson.id,
      reason: 'Пропуск урока',
      status: 'pending',
      missed_date: lesson.lesson_date,
    }]);
  }
}

export async function revertLesson(lessonId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const { data: lesson } = await supabase
    .from('tutor_lessons')
    .select('student_id, status, tutor_students(package_remaining_lessons)')
    .eq('id', lessonId)
    .single();

  if (lesson) {
    if (lesson.status === 'completed') {
      await supabase.rpc('update_student_balance', { p_student_id: lesson.student_id, p_delta: 1 });
    } else if (lesson.status === 'missed_makeup') {
      await supabase.from('tutor_makeups').delete().eq('missed_lesson_id', lessonId);
    }
    await supabase.from('tutor_lessons').update({ status: 'scheduled' }).eq('id', lessonId);
  }
}

// -------------------------------------------------------------
// PAYMENTS API (Direct Supabase)
// -------------------------------------------------------------
export async function addPayment(
  studentId: string,
  amountUzs: number,
  lessonsAdded: number,
  paymentDate?: string
): Promise<Payment> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const { data: student } = await supabase
    .from('tutor_students')
    .select('name, package_remaining_lessons, package_total_lessons')
    .eq('id', studentId)
    .single();

  // Update student prepaid balance and total
  await supabase.rpc('add_payment_to_student', { p_student_id: studentId, p_lessons_added: Number(lessonsAdded) });

  const effectiveDate = paymentDate ? paymentDate.substring(0, 10) : getTashkentTodayStr();

  // Insert into payments
  const newPaymentId = generateUUID();
  const { data, error } = await supabase
    .from('tutor_payments')
    .insert([
      {
        id: newPaymentId,
        student_id: studentId,
        amount: Number(amountUzs),
        lessons_count: Number(lessonsAdded),
        payment_date: effectiveDate,
        payment_method: 'Payme / Click',
      },
    ])
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    student_id: data.student_id,
    student_name: student?.name || 'Ученик',
    amount_uzs: Number(data.amount),
    lessons_added: Number(data.lessons_count),
    created_at: data.payment_date || data.created_at,
  };
}

export async function resolveMakeupDebt(studentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');

  // Find oldest pending makeup for student and mark as completed
  const { data: makeups } = await supabase
    .from('tutor_makeups')
    .select('id')
    .eq('student_id', studentId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (makeups && makeups.length > 0) {
    await supabase
      .from('tutor_makeups')
      .update({ status: 'completed' })
      .eq('id', makeups[0].id);
  }
}

// -------------------------------------------------------------
// FINANCE SUMMARY (Direct Supabase)
// -------------------------------------------------------------
export async function getFinanceSummary(): Promise<FinanceSummary> {
  if (!supabase) return { earnedThisMonthUzs: 0, completedLessonsCount: 0 };

  const now = getTashkentNow();
  const startStr = format(startOfMonth(now), 'yyyy-MM-dd');
  const endStr = format(endOfMonth(now), 'yyyy-MM-dd');

  const { data: lessons, error } = await supabase
    .from('tutor_lessons')
    .select('price, status, tutor_students(price_per_lesson)')
    .eq('status', 'completed')
    .gte('lesson_date', startStr)
    .lte('lesson_date', endStr);

  if (error || !lessons) {
    console.error('getFinanceSummary error:', error);
    return { earnedThisMonthUzs: 0, completedLessonsCount: 0 };
  }

  let earned = 0;
  lessons.forEach((l: any) => {
    const stRel = l.tutor_students;
    const stPrice = Array.isArray(stRel) ? stRel[0]?.price_per_lesson : stRel?.price_per_lesson;
    earned += Number(l.price || stPrice) || 150000;
  });

  return {
    earnedThisMonthUzs: earned,
    completedLessonsCount: lessons.length,
  };
}

export interface StudentHistoryRecord {
  id: string;
  type: 'payment' | 'lesson';
  date: string;
  title: string;
  subtitle?: string;
  badge: string;
  status?: string;
  amountUzs?: number;
}

export async function getStudentHistory(studentId: string): Promise<StudentHistoryRecord[]> {
  if (!supabase) return [];

  const [payRes, lesRes] = await Promise.all([
    supabase
      .from('tutor_payments')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tutor_lessons')
      .select('*')
      .eq('student_id', studentId)
      .order('lesson_date', { ascending: false })
      .order('start_time', { ascending: false }),
  ]);

  const history: StudentHistoryRecord[] = [];

  (payRes.data || []).forEach((p) => {
    history.push({
      id: p.id,
      type: 'payment',
      date: p.payment_date || p.created_at,
      title: `Внесена оплата: +${p.lessons_count} уроков`,
      subtitle: `${Number(p.amount).toLocaleString('ru-RU')} UZS (${p.payment_method || 'Payme/Click'})`,
      badge: `+${p.lessons_count} ур.`,
      status: 'payment',
      amountUzs: Number(p.amount),
    });
  });

  (lesRes.data || []).forEach((l) => {
    const isCompleted = l.status === 'completed';
    const isMissed = l.status === 'missed_makeup' || l.status === 'missed_excused';
    const timeStr = `${(l.start_time || '18:00').substring(0, 5)} - ${(l.end_time || '19:30').substring(0, 5)}`;
    history.push({
      id: l.id,
      type: 'lesson',
      date: `${l.lesson_date}T${(l.start_time || '18:00').substring(0, 5)}`,
      title: isCompleted
        ? 'Урок проведен'
        : isMissed
        ? 'Пропуск с переносом'
        : 'Запланирован',
      subtitle: `${timeStr}${l.notes ? ` • ${l.notes}` : ''}`,
      badge: isCompleted ? 'Проведен' : isMissed ? 'Пропуск' : 'План',
      status: l.status,
    });
  });

  // Sort descending by date
  history.sort((a, b) => (a.date < b.date ? 1 : -1));
  return history;
}

export async function updateStudentBillingDay(studentId: string, billingDay: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const { error } = await supabase
    .from('tutor_students')
    .update({ billing_day: billingDay })
    .eq('id', studentId);
  if (error) throw error;
}
export async function updateStudentColor(studentId: string, color: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const { error } = await supabase
    .from('tutor_students')
    .update({ color: color })
    .eq('id', studentId);
  if (error) throw error;
}

export async function updateStudentInfo(studentId: string, updates: { name?: string; phone?: string }): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const payload: Record<string, string> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.phone !== undefined) payload.phone = updates.phone.trim();
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase
    .from('tutor_students')
    .update(payload)
    .eq('id', studentId);
  if (error) throw error;
}

export async function updateStudentSettings(
  studentId: string,
  updates: { price_per_lesson?: number; schedule_notes?: string; billing_day?: string; prepaid_balance?: number }
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const payload: Record<string, string | number> = {};
  if (updates.price_per_lesson !== undefined) {
    const price = Number(updates.price_per_lesson);
    if (!(price > 0)) throw new Error('Цена за урок должна быть больше нуля');
    payload.price_per_lesson = price;
  }
  if (updates.schedule_notes !== undefined) payload.notes = updates.schedule_notes.trim();
  if (updates.billing_day !== undefined) payload.billing_day = updates.billing_day.trim();
  if (updates.prepaid_balance !== undefined) payload.package_remaining_lessons = Number(updates.prepaid_balance);
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from('tutor_students').update(payload).eq('id', studentId);
  if (error) throw error;
}

