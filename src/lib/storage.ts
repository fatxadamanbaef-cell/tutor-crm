import { Student, Lesson, Makeup, AttendanceSummary, LessonStatus, RecurringSlot } from '@/types';
import { supabase } from './supabase';
import { getTashkentTodayStr, getTashkentNow, getTashkentDateString } from './formatters';
import { generateUUID } from './uuid';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, addDays } from 'date-fns';

// -------------------------------------------------------------
// DATE / TIME HELPERS (Strict UTC+5 Tashkent strings)
// -------------------------------------------------------------
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00+05:00`);
  d.setDate(d.getDate() + n);
  return getTashkentDateString(d);
}

function dayOfWeekOf(dateStr: string): number {
  // Returns 1 (Mon) .. 7 (Sun)
  const d = new Date(`${dateStr}T12:00:00+05:00`).getDay();
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

  // Filter out system bot records directly at DB level
  const { data: studentsData, error: stError } = await supabase
    .from('tutor_students')
    .select('*')
    .not('name', 'like', '_BOT_%')
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

  return (studentsData || []).map((s) => {
    let recurring: RecurringSlot[] = [];
    if (Array.isArray(s.recurring_schedule)) {
      recurring = s.recurring_schedule;
    } else if (typeof s.recurring_schedule === 'string') {
      try { recurring = JSON.parse(s.recurring_schedule); } catch {}
    }

    const target = Number(s.monthly_target_lessons) || 12;

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
    console.error('Supabase saveStudent error:', error);
    throw error;
  }

  // If recurring_schedule provided, safely generate upcoming lessons
  if (student.recurring_schedule !== undefined && student.recurring_schedule.length > 0) {
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
  };
}

export async function deleteStudent(studentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');

  await supabase.from('tutor_lessons').delete().eq('student_id', studentId);
  await supabase.from('tutor_makeups').delete().eq('student_id', studentId);
  const { error } = await supabase.from('tutor_students').delete().eq('id', studentId);
  if (error) throw error;
}

// -------------------------------------------------------------
// LESSONS MAPPER & API
// -------------------------------------------------------------
function mapLessonRow(l: any): Lesson {
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
}

/**
 * Loads lessons within an active window (defaults to 1st of previous month to +35 days ahead).
 * Prevents loading entire database history into client memory.
 */
export async function getLessons(fromDate?: string, toDate?: string): Promise<Lesson[]> {
  if (!supabase) throw new Error('Supabase is not initialized');

  const now = getTashkentNow();
  const defaultFrom = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
  const defaultTo = format(addDays(now, 35), 'yyyy-MM-dd');

  const from = fromDate ? getTashkentDateString(fromDate) : defaultFrom;
  const to = toDate ? getTashkentDateString(toDate) : defaultTo;

  const { data, error } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(name, color)')
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Supabase getLessons error:', error);
    throw error;
  }

  return (data || []).map(mapLessonRow);
}

/**
 * Loads the complete archive of all lessons for a specific student (for ClientProfileScreen).
 */
export async function getStudentLessonsArchive(studentId: string): Promise<Lesson[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('tutor_lessons')
    .select('*, tutor_students(name, color)')
    .eq('student_id', studentId)
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('getStudentLessonsArchive error:', error);
    return [];
  }
  return (data || []).map(mapLessonRow);
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

  const lessonDate = getTashkentDateString(lessonData.date);
  const time = parseTimeRange(lessonData.time_str || '18:00 - 19:30');
  const lessonId = generateUUID();

  let dbStatus = 'scheduled';
  if (lessonData.status === 'completed') dbStatus = 'completed';
  else if (lessonData.status === 'missed') dbStatus = 'missed';

  const payload: any = {
    id: lessonId,
    student_id: lessonData.student_id,
    lesson_date: lessonDate,
    start_time: time.start,
    end_time: time.end,
    status: dbStatus,
    notes: lessonData.notes || '',
    miss_reason: lessonData.miss_reason || null,
    needs_makeup: Boolean(lessonData.needs_makeup),
    is_makeup: Boolean(lessonData.is_makeup),
    reminder_sent: false,
  };

  const { data, error } = await supabase
    .from('tutor_lessons')
    .insert([payload])
    .select('*, tutor_students(name, color)')
    .single();

  if (error) {
    console.error('Supabase saveLesson error:', error);
    throw error;
  }

  return mapLessonRow(data);
}

export async function saveBatchLessons(lessons: Array<{
  student_id: string;
  date: string;
  time_str?: string;
  notes?: string;
  status?: LessonStatus;
  miss_reason?: string;
  needs_makeup?: boolean;
  is_makeup?: boolean;
}>): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  if (lessons.length === 0) return;

  const dbPayload = lessons.map((l) => {
    const time = parseTimeRange(l.time_str || '18:00 - 19:30');
    let dbStatus = 'scheduled';
    if (l.status === 'completed') dbStatus = 'completed';
    else if (l.status === 'missed') dbStatus = 'missed';

    return {
      id: generateUUID(),
      student_id: l.student_id,
      lesson_date: getTashkentDateString(l.date),
      start_time: time.start,
      end_time: time.end,
      status: dbStatus,
      notes: l.notes || '',
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
  if (newDateStr) updatePayload.lesson_date = getTashkentDateString(newDateStr);

  const { error } = await supabase.from('tutor_lessons').update(updatePayload).eq('id', lessonId);
  if (error) throw error;
}

export async function updateLessonDetails(lessonId: string, updates: Partial<Lesson>): Promise<void> {
  if (!supabase) throw new Error('Supabase is not initialized');
  const payload: any = {};

  if (updates.date) payload.lesson_date = getTashkentDateString(updates.date);
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

  const targetSunday = getTashkentDateString(sundayDate);

  const newLesson = await saveLesson({
    student_id: makeup.student_id,
    date: targetSunday,
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
// SAFE RECURRING SCHEDULE GENERATOR (Strictly INSERT IF NOT EXISTS)
// Never deletes or overwrites existing lessons or manual reschedules!
// -------------------------------------------------------------
export async function planRecurringLessonsForStudent(
  studentId: string,
  schedule: RecurringSlot[],
  weeksAhead: number = 4
): Promise<{ createdCount: number }> {
  if (!supabase || !schedule || schedule.length === 0) return { createdCount: 0 };

  const todayStr = getTashkentTodayStr();
  const endDateStr = addDaysStr(todayStr, weeksAhead * 7);
  const now = getTashkentNow();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const normalizedSlots = schedule.map((s) => {
    const time = parseTimeRange(s.startTime + (s.endTime ? ` - ${s.endTime}` : ''), 60);
    return {
      dayOfWeek: Number(s.dayOfWeek),
      start: time.start.substring(0, 5),
      end: time.end.substring(0, 5),
    };
  });

  // Fetch ALL existing lessons in this period for this student
  const { data: existing, error } = await supabase
    .from('tutor_lessons')
    .select('id, lesson_date, start_time, status')
    .eq('student_id', studentId)
    .gte('lesson_date', todayStr)
    .lte('lesson_date', endDateStr);

  if (error) {
    console.error('Failed to fetch existing lessons for student:', error);
    throw error;
  }

  // Register all existing dates and slot keys to prevent overwriting
  const existingList = existing || [];
  const existingSlotKeys = new Set<string>();
  const existingDates = new Set<string>();

  existingList.forEach((l) => {
    const d = getTashkentDateString(l.lesson_date);
    const t = String(l.start_time || '').substring(0, 5);
    existingSlotKeys.add(`${d}_${t}`);
    existingDates.add(d);
  });

  const newLessons: any[] = [];
  let cursor = todayStr;

  while (cursor <= endDateStr) {
    const dow = dayOfWeekOf(cursor);
    const matchingSlots = normalizedSlots.filter((s) => s.dayOfWeek === dow);

    for (const slot of matchingSlots) {
      const slotKey = `${cursor}_${slot.start}`;

      // Today: don't plan slots in the past
      if (cursor === todayStr) {
        const slotMinutes = toMinutes(slot.start);
        if (currentMinutes >= slotMinutes) continue;
      }

      // If a lesson already exists on this exact slot, skip
      if (existingSlotKeys.has(slotKey)) {
        continue;
      }

      // If student only has 1 lesson on this day of week and already has a lesson on this date, skip
      if (matchingSlots.length === 1 && existingDates.has(cursor)) {
        continue;
      }

      // Safe add:
      existingSlotKeys.add(slotKey);
      existingDates.add(cursor);

      newLessons.push({
        id: generateUUID(),
        student_id: studentId,
        lesson_date: cursor,
        start_time: slot.start.length === 5 ? `${slot.start}:00` : slot.start,
        end_time: slot.end.length === 5 ? `${slot.end}:00` : slot.end,
        status: 'scheduled',
        notes: 'Периодическое расписание',
        needs_makeup: false,
        is_makeup: false,
        reminder_sent: false,
      });
    }
    cursor = addDaysStr(cursor, 1);
  }

  if (newLessons.length > 0) {
    const { error: insErr } = await supabase.from('tutor_lessons').insert(newLessons);
    if (insErr) {
      console.error('Failed to insert recurring lessons safely:', insErr);
      throw insErr;
    }
  }

  return { createdCount: newLessons.length };
}

export async function ensureRecurringLessonsForStudent(studentId: string, weeksAhead: number = 4): Promise<number> {
  if (!supabase) return 0;
  const { data: student, error } = await supabase
    .from('tutor_students')
    .select('id, is_active, recurring_schedule')
    .eq('id', studentId)
    .single();

  if (error || !student || !student.is_active || !student.recurring_schedule) return 0;
  const res = await planRecurringLessonsForStudent(student.id, student.recurring_schedule, weeksAhead);
  return res.createdCount;
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
    date: m.missed_date || getTashkentDateString(m.created_at),
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

export async function updateStudentSettings(
  studentId: string,
  updates: {
    monthly_target_lessons?: number;
    billing_day?: string;
    schedule_notes?: string;
    recurring_schedule?: RecurringSlot[];
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

  // Update only this student's upcoming schedule
  if (updates.recurring_schedule !== undefined && updates.recurring_schedule.length > 0) {
    await planRecurringLessonsForStudent(studentId, updates.recurring_schedule, 4);
  }
}
