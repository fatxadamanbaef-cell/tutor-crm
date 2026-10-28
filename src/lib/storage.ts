import { Student, Lesson, Makeup, AttendanceSummary, LessonStatus, RecurringSlot, FinanceSummary } from '@/types';
import { supabase } from './supabase';
import { getTashkentTodayStr, getTashkentNow } from './formatters';
import { generateUUID } from './uuid';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, parseISO, addDays } from 'date-fns';

// -------------------------------------------------------------
// DATE / TIME HELPERS (Strict UTC+5 Tashkent strings)
// -------------------------------------------------------------
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}

function dayOfWeekOf(dateStr: string): number {
  // Returns 1 (Mon) .. 7 (Sun)
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function addMinutesToTime(t: string, minutes: number): string {
  const total = (toMinutes(t) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

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

// -------------------------------------------------------------
// STUDENTS API (Zero-Finance, Monthly Target & Recurring)
// -------------------------------------------------------------
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

  // Active makeups count
  const { data: makeupsData } = await supabase
    .from('tutor_makeups')
    .select('student_id, status')
    .eq('status', 'pending');

  const makeupsCountMap: Record<string, number> = {};
  (makeupsData || []).forEach((m) => {
    makeupsCountMap[m.student_id] = (makeupsCountMap[m.student_id] || 0) + 1;
  });

  // Calculate current month attendance
  const now = getTashkentNow();
  const mStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const mEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  const { data: currentMonthLessons } = await supabase
    .from('tutor_lessons')
    .select('student_id, status')
    .gte('lesson_date', mStart)
    .lte('lesson_date', mEnd);

  const conductedCountMap: Record<string, number> = {};
  const missedCountMap: Record<string, number> = {};

  (currentMonthLessons || []).forEach((l) => {
    const isCompleted = l.status === 'completed';
    const isMissed = l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty';
    if (isCompleted) conductedCountMap[l.student_id] = (conductedCountMap[l.student_id] || 0) + 1;
    if (isMissed) missedCountMap[l.student_id] = (missedCountMap[l.student_id] || 0) + 1;
  });

  return (studentsData || [])
    .filter((s) => !String(s.name).startsWith('_BOT_'))
    .map((s) => {
      let recurring: RecurringSlot[] = [];
      if (Array.isArray(s.recurring_schedule)) {
        recurring = s.recurring_schedule;
      } else if (typeof s.recurring_schedule === 'string') {
        try { recurring = JSON.parse(s.recurring_schedule); } catch {}
      }

      const target = Number(s.monthly_target_lessons) || Number(s.package_total_lessons) || 12;

      return {
        id: s.id,
        name: s.name,
        monthly_target_lessons: target,
        recurring_schedule: recurring,
        billing_day: s.billing_day || '10 число',
        phone: s.phone || '',
        telegram: s.telegram || '',
        schedule_notes: s.notes || '',
        color: s.color || '#3B82F6',
        is_active: s.is_active !== false,
        created_at: s.created_at,
        makeup_debt: makeupsCountMap[s.id] || 0,
        conducted_this_month: conductedCountMap[s.id] || 0,
        missed_this_month: missedCountMap[s.id] || 0,
        // Legacy fallback fields for safety
        package_total_lessons: target,
        prepaid_balance: conductedCountMap[s.id] || 0,
        price_per_lesson: 0,
      };
    });
}

export async function saveStudent(student: {
  id?: string;
  name: string;
  monthly_target_lessons?: number;
  recurring_schedule?: RecurringSlot[];
  billing_day?: string;
  phone?: string;
  telegram?: string;
  schedule_notes?: string;
  color?: string;
  is_active?: boolean;
  // legacy
  price_per_lesson?: number;
  prepaid_balance?: number;
}): Promise<Student> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const studentId = student.id || generateUUID();
  const target = Number(student.monthly_target_lessons) || 12;

  const dbPayload: any = {
    id: studentId,
    name: student.name.trim(),
    monthly_target_lessons: target,
    recurring_schedule: student.recurring_schedule || [],
    phone: student.phone || '',
    telegram: student.telegram ? (student.telegram.startsWith('@') ? student.telegram : `@${student.telegram}`) : '',
    color: student.color || '#3B82F6',
    billing_day: student.billing_day || '10',
    notes: student.schedule_notes || '',
    is_active: student.is_active !== false,
  };

  const { data, error } = await supabase
    .from('tutor_students')
    .upsert([dbPayload])
    .select()
    .single();

  if (error) {
    // If column monthly_target_lessons is missing before migration, fallback safely
    if (error.message?.includes('monthly_target_lessons')) {
      delete dbPayload.monthly_target_lessons;
      delete dbPayload.recurring_schedule;
      dbPayload.package_total_lessons = target;
      const { data: fallbackData, error: fbErr } = await supabase
        .from('tutor_students')
        .upsert([dbPayload])
        .select()
        .single();
      if (fbErr) throw fbErr;
      return {
        id: fallbackData.id,
        name: fallbackData.name,
        monthly_target_lessons: target,
        recurring_schedule: student.recurring_schedule || [],
        billing_day: fallbackData.billing_day || '10',
        phone: fallbackData.phone || '',
        telegram: fallbackData.telegram || '',
        schedule_notes: fallbackData.notes || '',
        color: fallbackData.color || '#3B82F6',
        created_at: fallbackData.created_at,
        makeup_debt: 0,
        conducted_this_month: 0,
        missed_this_month: 0,
        price_per_lesson: 0,
        prepaid_balance: 0,
      };
    }
    console.error('Supabase saveStudent error:', error);
    throw error;
  }

  // If recurring_schedule provided, generate lessons for next 4 weeks
  if (student.recurring_schedule && student.recurring_schedule.length > 0) {
    await planRecurringLessonsForStudent(studentId, student.recurring_schedule, 4);
  }

  return {
    id: data.id,
    name: data.name,
    monthly_target_lessons: Number(data.monthly_target_lessons) || target,
    recurring_schedule: data.recurring_schedule || student.recurring_schedule || [],
    billing_day: data.billing_day || '10',
    phone: data.phone || '',
    telegram: data.telegram || '',
    schedule_notes: data.notes || '',
    color: data.color || '#3B82F6',
    created_at: data.created_at,
    makeup_debt: 0,
    conducted_this_month: 0,
    missed_this_month: 0,
    price_per_lesson: 0,
    prepaid_balance: 0,
  };
}

export async function deleteStudent(studentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');

  await supabase.from('tutor_lessons').delete().eq('student_id', studentId);
  await supabase.from('tutor_makeups').delete().eq('student_id', studentId);
  try {
    await supabase.from('tutor_payments').delete().eq('student_id', studentId);
  } catch {}
  const { error } = await supabase.from('tutor_students').delete().eq('id', studentId);
  if (error) throw error;
}

// -------------------------------------------------------------
// LESSONS API
// -------------------------------------------------------------
export async function getLessons(): Promise<Lesson[]> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const { data, error } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(name, color)')
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Supabase getLessons error:', error);
    throw error;
  }

  return (data || []).map((l) => {
    let status: LessonStatus = 'planned';
    if (l.status === 'completed') {
      status = 'completed';
    } else if (
      l.status === 'missed' ||
      l.status === 'missed_excused' ||
      l.status === 'missed_penalty' ||
      l.status === 'missed_makeup'
    ) {
      status = 'missed';
    } else {
      status = 'planned';
    }

    const startTimeClean = (l.start_time || '18:00').substring(0, 5);
    const endTimeClean = (l.end_time || '19:30').substring(0, 5);
    const timeStr = `${startTimeClean} - ${endTimeClean}`;
    const isoDate = `${l.lesson_date}T${startTimeClean}:00+05:00`;

    return {
      id: l.id,
      student_id: l.student_id,
      student_name: l.tutor_students?.name || 'Ученик',
      date: isoDate,
      time_str: timeStr,
      status,
      miss_reason: l.miss_reason || (l.status === 'missed_excused' ? 'Уважительная причина' : l.status === 'missed_penalty' ? 'Пропуск' : undefined),
      needs_makeup: Boolean(l.needs_makeup || l.status === 'missed_excused'),
      is_makeup: Boolean(l.is_makeup),
      reminder_sent: Boolean(l.reminder_sent),
      notes: l.notes || '',
      created_at: l.created_at,
    };
  });
}

export async function saveLesson(lessonData: {
  student_id: string;
  date: string;
  time_str?: string;
  notes?: string;
  status?: LessonStatus;
  miss_reason?: string;
  needs_makeup?: boolean;
  is_makeup?: boolean;
}): Promise<Lesson> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const lessonDate = lessonData.date.substring(0, 10);
  const time = lessonData.time_str ? parseTimeRange(lessonData.time_str) : { start: '18:00', end: '19:30' };

  let dbStatus = 'scheduled';
  if (lessonData.status === 'completed') {
    dbStatus = 'completed';
  } else if (lessonData.status === 'missed' || lessonData.status === 'missed_excused' || lessonData.status === 'missed_penalty') {
    dbStatus = 'missed';
  }

  const newId = generateUUID();
  const dbPayload: any = {
    id: newId,
    student_id: lessonData.student_id,
    lesson_date: lessonDate,
    start_time: time.start.length === 5 ? `${time.start}:00` : time.start,
    end_time: time.end.length === 5 ? `${time.end}:00` : time.end,
    status: dbStatus,
    notes: lessonData.notes || '',
    miss_reason: lessonData.miss_reason || null,
    needs_makeup: Boolean(lessonData.needs_makeup),
    is_makeup: Boolean(lessonData.is_makeup),
    reminder_sent: false,
  };

  let insertedRes = await supabase
    .from('tutor_lessons')
    .insert([dbPayload])
    .select('*, tutor_students(name)')
    .single();

  if (insertedRes.error && dbStatus === 'missed') {
    // Retry with missed_makeup if check constraint rejects 'missed'
    dbPayload.status = 'missed_makeup';
    insertedRes = await supabase
      .from('tutor_lessons')
      .insert([dbPayload])
      .select('*, tutor_students(name)')
      .single();
  }

  if (insertedRes.error) {
    console.error('Supabase saveLesson insert error:', insertedRes.error);
    throw insertedRes.error;
  }
  const data = insertedRes.data;

  // If marked missed with makeup, add to tutor_makeups
  if (dbStatus === 'missed' && lessonData.needs_makeup) {
    await supabase.from('tutor_makeups').insert([
      {
        id: generateUUID(),
        student_id: lessonData.student_id,
        student_name: data.tutor_students?.name || 'Ученик',
        missed_lesson_id: newId,
        reason: lessonData.miss_reason || 'Пропуск урока',
        status: 'pending',
        missed_date: lessonDate,
      },
    ]);
  }

  return {
    id: data.id,
    student_id: data.student_id,
    student_name: data.tutor_students?.name || 'Ученик',
    date: `${data.lesson_date}T${time.start}:00+05:00`,
    time_str: `${time.start} - ${time.end}`,
    status: lessonData.status || 'planned',
    miss_reason: data.miss_reason || lessonData.miss_reason,
    needs_makeup: data.needs_makeup,
    is_makeup: data.is_makeup,
    notes: data.notes || '',
    created_at: data.created_at,
  };
}

export async function saveBatchLessons(newLessons: Lesson[]): Promise<void> {
  if (!supabase || newLessons.length === 0) return;

  const dbPayload = newLessons.map((l) => {
    const lessonDate = l.date.substring(0, 10);
    const time = l.time_str ? parseTimeRange(l.time_str) : { start: '18:00', end: '19:30' };
    return {
      id: l.id || generateUUID(),
      student_id: l.student_id,
      lesson_date: lessonDate,
      start_time: time.start,
      end_time: time.end,
      status: l.status === 'completed' ? 'completed' : l.status === 'missed' ? 'missed' : 'planned',
      notes: l.notes || 'Плановый урок',
      miss_reason: l.miss_reason || null,
      needs_makeup: Boolean(l.needs_makeup),
      is_makeup: Boolean(l.is_makeup),
    };
  });

  const { error } = await supabase.from('tutor_lessons').upsert(dbPayload);
  if (error) {
    console.error('Supabase saveBatchLessons error:', error);
    throw error;
  }
}

export async function updateLessonTime(lessonId: string, timeStr: string, newDateStr?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const time = parseTimeRange(timeStr);
  const updatePayload: any = {
    start_time: time.start,
    end_time: time.end,
  };
  if (newDateStr) updatePayload.lesson_date = newDateStr.substring(0, 10);

  const { error } = await supabase.from('tutor_lessons').update(updatePayload).eq('id', lessonId);
  if (error) throw error;
}

export async function updateLessonDetails(lessonId: string, updates: Partial<Lesson>): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const payload: any = {};

  if (updates.date) payload.lesson_date = updates.date.substring(0, 10);
  if (updates.time_str) {
    const time = parseTimeRange(updates.time_str);
    payload.start_time = time.start;
    payload.end_time = time.end;
  }
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.miss_reason !== undefined) payload.miss_reason = updates.miss_reason;
  if (updates.needs_makeup !== undefined) payload.needs_makeup = updates.needs_makeup;
  if (updates.is_makeup !== undefined) payload.is_makeup = updates.is_makeup;

  if (updates.status) {
    payload.status = updates.status === 'completed' ? 'completed' : updates.status === 'missed' ? 'missed' : 'planned';
  }

  const { error } = await supabase.from('tutor_lessons').update(payload).eq('id', lessonId);
  if (error) throw error;
}

export async function deleteLesson(lessonId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  await supabase.from('tutor_makeups').delete().eq('missed_lesson_id', lessonId);
  const { error } = await supabase.from('tutor_lessons').delete().eq('id', lessonId);
  if (error) throw error;
}

// -------------------------------------------------------------
// ATTENDANCE & STATUS SWITCHING (Completed vs Missed with Reason)
// -------------------------------------------------------------
export async function setLessonStatusDirect(
  lessonId: string,
  targetStatus: LessonStatus,
  missReason?: string,
  needsMakeup: boolean = false
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const { data: lesson, error: lError } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(id, name)')
    .eq('id', lessonId)
    .single();

  if (lError || !lesson) throw new Error('Lesson not found');

  const studentId = lesson.student_id;
  const studentName = lesson.tutor_students?.name || 'Ученик';

  if (targetStatus === 'completed') {
    await supabase.from('tutor_lessons').update({
      status: 'completed',
      needs_makeup: false,
    }).eq('id', lessonId);

    // If it was a scheduled makeup, mark makeup as completed
    await supabase.from('tutor_makeups')
      .update({ status: 'completed' })
      .eq('scheduled_lesson_id', lessonId);
  } else if (targetStatus === 'missed' || targetStatus === 'missed_excused' || targetStatus === 'missed_penalty') {
    const reason = missReason || (targetStatus === 'missed_penalty' ? 'Пропуск без отработки' : 'Пропуск занятия');
    const wantsMakeup = needsMakeup || targetStatus === 'missed_excused';

    const { error: updateErr } = await supabase.from('tutor_lessons').update({
      status: 'missed',
      miss_reason: reason,
      needs_makeup: wantsMakeup,
    }).eq('id', lessonId);

    if (updateErr) {
      // Fallback if check constraint only allows missed_makeup
      await supabase.from('tutor_lessons').update({
        status: 'missed_makeup',
        miss_reason: reason,
        needs_makeup: wantsMakeup,
      }).eq('id', lessonId);
    }

    if (wantsMakeup) {
      await supabase.from('tutor_makeups').upsert([
        {
          student_id: studentId,
          student_name: studentName,
          missed_lesson_id: lesson.id,
          reason,
          status: 'pending',
          missed_date: lesson.lesson_date,
        },
      ]);
    } else {
      await supabase.from('tutor_makeups')
        .update({ status: 'archived' })
        .eq('missed_lesson_id', lesson.id)
        .eq('status', 'pending');
    }
  } else {
    // Planned / revert
    await supabase.from('tutor_lessons').update({
      status: 'planned',
      miss_reason: null,
      needs_makeup: false,
    }).eq('id', lessonId);

    await supabase.from('tutor_makeups').delete().eq('missed_lesson_id', lesson.id);
  }
}

// -------------------------------------------------------------
// SUNDAY MAKEUPS API
// -------------------------------------------------------------
export async function getPendingMakeups(): Promise<Makeup[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('tutor_makeups')
    .select('*, tutor_students(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  return (data || []).map((m) => ({
    id: m.id,
    student_id: m.student_id,
    student_name: m.tutor_students?.name || m.student_name || 'Ученик',
    missed_lesson_id: m.missed_lesson_id,
    scheduled_lesson_id: m.scheduled_lesson_id,
    reason: m.reason || 'Пропуск',
    status: m.status,
    missed_date: m.missed_date,
    created_at: m.created_at,
  }));
}

export async function scheduleSundayMakeup(
  makeupId: string,
  sundayDate: string,
  timeStr: string = '12:00 - 13:30'
): Promise<Lesson> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const { data: makeup, error: mErr } = await supabase
    .from('tutor_makeups')
    .select('*, tutor_students(name)')
    .eq('id', makeupId)
    .single();

  if (mErr || !makeup) throw new Error('Makeup record not found');

  const newLesson = await saveLesson({
    student_id: makeup.student_id,
    date: sundayDate,
    time_str: timeStr,
    status: 'planned',
    is_makeup: true,
    notes: `Отработка за ${makeup.missed_date || 'пропуск'}: ${makeup.reason || ''}`,
  });

  await supabase
    .from('tutor_makeups')
    .update({ status: 'scheduled', scheduled_lesson_id: newLesson.id })
    .eq('id', makeupId);

  return newLesson;
}

export async function archiveMakeup(makeupId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  await supabase
    .from('tutor_makeups')
    .update({ status: 'archived' })
    .eq('id', makeupId);
}

// -------------------------------------------------------------
// RECURRING SCHEDULE GENERATOR (4 weeks ahead, safe duplicate prevention)
// -------------------------------------------------------------
export async function planRecurringLessonsForStudent(
  studentId: string,
  schedule: RecurringSlot[],
  weeksAhead: number = 4
): Promise<{ createdCount: number }> {
  if (!supabase || schedule.length === 0) return { createdCount: 0 };

  const todayStr = getTashkentTodayStr();
  const endDateStr = addDaysStr(todayStr, weeksAhead * 7);

  // Fetch existing lessons in this period for this student
  const { data: existing } = await supabase
    .from('tutor_lessons')
    .select('lesson_date, start_time')
    .eq('student_id', studentId)
    .gte('lesson_date', todayStr)
    .lte('lesson_date', endDateStr);

  const existingMap = new Set<string>();
  (existing || []).forEach((l) => {
    const d = String(l.lesson_date).substring(0, 10);
    const t = String(l.start_time).substring(0, 5);
    existingMap.add(`${d}_${t}`);
  });

  const newLessons: any[] = [];
  let cursor = todayStr;

  while (cursor <= endDateStr) {
    const dow = dayOfWeekOf(cursor); // 1=Mon .. 7=Sun
    const matchingSlots = schedule.filter((s) => Number(s.dayOfWeek) === dow);

    for (const slot of matchingSlots) {
      const time = parseTimeRange(slot.startTime + (slot.endTime ? ` - ${slot.endTime}` : ''));
      const key = `${cursor}_${time.start}`;

      if (!existingMap.has(key)) {
        existingMap.add(key);
        newLessons.push({
          id: generateUUID(),
          student_id: studentId,
          lesson_date: cursor,
          start_time: time.start.length === 5 ? `${time.start}:00` : time.start,
          end_time: time.end.length === 5 ? `${time.end}:00` : time.end,
          status: 'scheduled',
          notes: 'Периодическое расписание',
          needs_makeup: false,
          is_makeup: false,
          reminder_sent: false,
        });
      }
    }
    cursor = addDaysStr(cursor, 1);
  }

  if (newLessons.length > 0) {
    const { error } = await supabase.from('tutor_lessons').insert(newLessons);
    if (error) {
      console.error('Failed to insert recurring lessons:', error);
      throw error;
    }
  }

  return { createdCount: newLessons.length };
}

export async function ensureRecurringLessonsForAllActiveStudents(weeksAhead: number = 4): Promise<number> {
  const students = await getStudents();
  let totalCreated = 0;
  for (const s of students) {
    if (s.is_active && s.recurring_schedule && s.recurring_schedule.length > 0) {
      try {
        const res = await planRecurringLessonsForStudent(s.id, s.recurring_schedule, weeksAhead);
        totalCreated += res.createdCount;
      } catch (e) {
        console.error(`Failed to generate schedule for ${s.name}:`, e);
      }
    }
  }
  return totalCreated;
}

// -------------------------------------------------------------
// ATTENDANCE SUMMARY & ARCHIVE
// -------------------------------------------------------------
export async function getAttendanceSummary(period: 'week' | 'month' = 'month'): Promise<AttendanceSummary> {
  if (!supabase) {
    return {
      period,
      completedCount: 0,
      targetCount: 0,
      missedCount: 0,
      makeupsCount: 0,
      missedDetails: [],
      makeupDetails: [],
    };
  }

  const now = getTashkentNow();
  const startStr = format(period === 'week' ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now), 'yyyy-MM-dd');
  const endStr = format(period === 'week' ? endOfWeek(now, { weekStartsOn: 1 }) : endOfMonth(now), 'yyyy-MM-dd');

  const [lessonsRes, studentsRes, makeupsRes] = await Promise.all([
    supabase
      .from('tutor_lessons')
      .select('*, tutor_students(name)')
      .gte('lesson_date', startStr)
      .lte('lesson_date', endStr),
    getStudents(),
    supabase
      .from('tutor_makeups')
      .select('*, tutor_students(name)')
      .gte('created_at', `${startStr}T00:00:00Z`),
  ]);

  const lessons = lessonsRes.data || [];
  const makeups = makeupsRes.data || [];

  let completedCount = 0;
  let missedCount = 0;
  const missedDetails: Array<{ studentName: string; date: string; reason: string }> = [];

  lessons.forEach((l: any) => {
    const sName = l.tutor_students?.name || 'Ученик';
    if (l.status === 'completed') {
      completedCount++;
    } else if (l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty') {
      missedCount++;
      missedDetails.push({
        studentName: sName,
        date: l.lesson_date,
        reason: l.miss_reason || 'Без причины',
      });
    }
  });

  const targetCount = studentsRes.reduce((acc, s) => acc + (s.monthly_target_lessons || 12), 0);

  const makeupDetails = makeups.map((m: any) => ({
    studentName: m.tutor_students?.name || m.student_name || 'Ученик',
    date: m.missed_date || m.created_at.substring(0, 10),
    status: m.status === 'completed' ? 'Отработано' : m.status === 'scheduled' ? 'Назначено в ВС' : 'Ожидает отработки',
  }));

  return {
    period,
    completedCount,
    targetCount,
    missedCount,
    makeupsCount: makeups.length,
    missedDetails,
    makeupDetails,
  };
}

// -------------------------------------------------------------
// STUDENT ARCHIVE HISTORY (By Month)
// -------------------------------------------------------------
export async function getStudentArchive(studentId: string, monthDate: Date = getTashkentNow()) {
  if (!supabase) return { completed: [], missed: [], planned: [], target: 12 };

  const mStart = format(startOfMonth(monthDate), 'yyyy-MM-dd');
  const mEnd = format(endOfMonth(monthDate), 'yyyy-MM-dd');

  const [studentRes, lessonsRes] = await Promise.all([
    supabase.from('tutor_students').select('*').eq('id', studentId).single(),
    supabase
      .from('tutor_lessons')
      .select('*')
      .eq('student_id', studentId)
      .gte('lesson_date', mStart)
      .lte('lesson_date', mEnd)
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true }),
  ]);

  const target = Number(studentRes.data?.monthly_target_lessons) || 12;
  const lessons = lessonsRes.data || [];

  const completed = lessons.filter((l) => l.status === 'completed');
  const missed = lessons.filter((l) => l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty');
  const planned = lessons.filter((l) => l.status === 'planned' || l.status === 'scheduled');

  return {
    target,
    completed,
    missed,
    planned,
    all: lessons,
  };
}

// -------------------------------------------------------------
// COMPATIBILITY & HELPER EXPORTS (For gentle migration)
// -------------------------------------------------------------
export async function updateStudentBillingDay(studentId: string, billingDay: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  await supabase.from('tutor_students').update({ billing_day: billingDay }).eq('id', studentId);
}

export async function updateStudentColor(studentId: string, color: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  await supabase.from('tutor_students').update({ color }).eq('id', studentId);
}

export async function updateStudentInfo(studentId: string, updates: { name?: string; phone?: string }): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const payload: Record<string, string> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.phone !== undefined) payload.phone = updates.phone.trim();
  if (Object.keys(payload).length === 0) return;
  await supabase.from('tutor_students').update(payload).eq('id', studentId);
}

export async function updateStudentSettings(
  studentId: string,
  updates: {
    monthly_target_lessons?: number;
    billing_day?: string;
    schedule_notes?: string;
    recurring_schedule?: RecurringSlot[];
    // legacy
    price_per_lesson?: number;
    prepaid_balance?: number;
    package_total_lessons?: number;
  }
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const payload: any = {};
  if (updates.monthly_target_lessons !== undefined) payload.monthly_target_lessons = updates.monthly_target_lessons;
  if (updates.billing_day !== undefined) payload.billing_day = updates.billing_day.trim();
  if (updates.schedule_notes !== undefined) payload.notes = updates.schedule_notes.trim();
  if (updates.recurring_schedule !== undefined) payload.recurring_schedule = updates.recurring_schedule;

  if (Object.keys(payload).length > 0) {
    await supabase.from('tutor_students').update(payload).eq('id', studentId);
  }

  if (updates.recurring_schedule && updates.recurring_schedule.length > 0) {
    await planRecurringLessonsForStudent(studentId, updates.recurring_schedule, 4);
  }
}

// Deprecated finance stubs for compatibility
export async function getFinanceSummary(): Promise<FinanceSummary> {
  const summary = await getAttendanceSummary('month');
  return {
    earnedThisMonthUzs: 0,
    completedLessonsCount: summary.completedCount,
  };
}

export async function addPayment(studentId: string, amount: number, lessonsCount: number, date?: string): Promise<any> {
  // Safe zero-finance stub: no-op
  return { id: generateUUID(), student_id: studentId, amount_uzs: 0, lessons_added: lessonsCount, created_at: date || getTashkentTodayStr() };
}

export async function burnLesson(lessonId: string): Promise<void> {
  await setLessonStatusDirect(lessonId, 'missed', 'Пропуск без отработки', false);
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
  const lessons = await getLessons();
  return lessons
    .filter((l) => l.student_id === studentId)
    .map((l) => ({
      id: l.id,
      type: 'lesson',
      date: l.date,
      title: l.status === 'completed' ? 'Урок проведен' : l.status === 'missed' ? 'Пропуск' : 'Запланирован',
      subtitle: `${l.time_str}${l.miss_reason ? ` • ${l.miss_reason}` : ''}`,
      badge: l.status === 'completed' ? 'Проведен' : l.status === 'missed' ? 'Пропуск' : 'План',
      status: l.status,
    }));
}

export async function toggleStudentCalendarDate(studentId: string, dateStr: string): Promise<any> {
  return { status: null };
}
