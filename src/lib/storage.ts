import { Student, Lesson, Payment, MakeupLesson, LessonStatus } from '@/types';
import { supabase, isSupabaseConfigured } from './supabase';
import { format, addDays } from 'date-fns';

const LOCAL_STORAGE_KEY_STUDENTS = 'tutor_students_v1';
const LOCAL_STORAGE_KEY_LESSONS = 'tutor_lessons_v1';
const LOCAL_STORAGE_KEY_PAYMENTS = 'tutor_payments_v1';
const LOCAL_STORAGE_KEY_MAKEUPS = 'tutor_makeups_v1';

// Seed initial data for local testing
const getTodayStr = () => format(new Date(), 'yyyy-MM-dd');
const getTomorrowStr = () => format(addDays(new Date(), 1), 'yyyy-MM-dd');

const INITIAL_STUDENTS: Student[] = [
  {
    id: 's1',
    name: 'Сахиб Рахимов',
    phone: '+998 90 123 45 67',
    telegram: '@sahib_math',
    price_per_lesson: 150000,
    payment_type: 'package',
    package_total_lessons: 12,
    package_remaining_lessons: 8,
    color: '#3B82F6', // Blue
    notes: 'Занятия 3 раза в неделю в 19:00',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 's2',
    name: 'Малика Каримова',
    phone: '+998 97 765 43 21',
    telegram: '@malika_k',
    price_per_lesson: 180000,
    payment_type: 'package',
    package_total_lessons: 8,
    package_remaining_lessons: 1, // 1 lesson left - reminder needed!
    color: '#EC4899', // Pink
    notes: 'Подготовка к Вестминстерскому лицею',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 's3',
    name: 'Алишер Усманов',
    phone: '+998 93 555 11 22',
    telegram: '@alisher_u',
    price_per_lesson: 120000,
    payment_type: 'per_lesson',
    package_total_lessons: 0,
    package_remaining_lessons: 0,
    color: '#10B981', // Green
    notes: 'Оплата после каждого урока',
    is_active: true,
    created_at: new Date().toISOString(),
  }
];

const INITIAL_LESSONS: Lesson[] = [
  {
    id: 'l1',
    student_id: 's1',
    student_name: 'Сахиб Рахимов',
    student_color: '#3B82F6',
    student_payment_type: 'package',
    lesson_date: getTodayStr(),
    start_time: '19:00',
    end_time: '20:00',
    price: 150000,
    status: 'scheduled',
    is_paid: true,
    notes: 'Алгебра: квадратные уравнения',
    created_at: new Date().toISOString(),
  },
  {
    id: 'l2',
    student_id: 's3',
    student_name: 'Алишер Усманов',
    student_color: '#10B981',
    student_payment_type: 'per_lesson',
    lesson_date: getTodayStr(),
    start_time: '17:00',
    end_time: '18:00',
    price: 120000,
    status: 'scheduled',
    is_paid: false,
    notes: 'Геометрия: площади фигур',
    created_at: new Date().toISOString(),
  },
  {
    id: 'l3',
    student_id: 's2',
    student_name: 'Малика Каримова',
    student_color: '#EC4899',
    student_payment_type: 'package',
    lesson_date: getTomorrowStr(),
    start_time: '18:00',
    end_time: '19:30',
    price: 180000,
    status: 'scheduled',
    is_paid: true,
    notes: 'Текстовые задачи на движение',
    created_at: new Date().toISOString(),
  }
];

const INITIAL_PAYMENTS: Payment[] = [
  {
    id: 'p1',
    student_id: 's1',
    student_name: 'Сахиб Рахимов',
    amount: 1800000,
    lessons_count: 12,
    payment_date: getTodayStr(),
    payment_method: 'Payme / Click',
    notes: 'Оплата пакета на 12 уроков',
    created_at: new Date().toISOString(),
  }
];

const INITIAL_MAKEUPS: MakeupLesson[] = [
  {
    id: 'm1',
    student_id: 's1',
    student_name: 'Сахиб Рахимов',
    status: 'pending',
    reason: 'Семейная поездка в прошлую субботу',
    missed_date: getTodayStr(),
    created_at: new Date().toISOString(),
  }
];

// Helper to check if client-side
const isClient = typeof window !== 'undefined';

function getLocal<T>(key: string, defaultData: T): T {
  if (!isClient) return defaultData;
  try {
    const item = localStorage.getItem(key);
    if (!item) {
      localStorage.setItem(key, JSON.stringify(defaultData));
      return defaultData;
    }
    return JSON.parse(item);
  } catch (e) {
    console.error(`Error loading ${key} from localStorage`, e);
    return defaultData;
  }
}

function setLocal<T>(key: string, data: T): void {
  if (!isClient) return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key} to localStorage`, e);
  }
}

// -------------------------------------------------------------
// STUDENTS API
// -------------------------------------------------------------
export async function getStudents(): Promise<Student[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tutor_students')
      .select('*')
      .order('name');
    if (!error && data) {
      return data as Student[];
    }
    console.warn('Supabase fetch failed, falling back to local', error);
  }
  return getLocal<Student[]>(LOCAL_STORAGE_KEY_STUDENTS, INITIAL_STUDENTS);
}

export async function saveStudent(student: Partial<Student> & { name: string }): Promise<Student> {
  const isNew = !student.id;
  const newStudent: Student = {
    id: student.id || `s_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: student.name,
    phone: student.phone || '',
    telegram: student.telegram || '',
    price_per_lesson: Number(student.price_per_lesson) || 150000,
    payment_type: student.payment_type || 'package',
    package_total_lessons: Number(student.package_total_lessons) || 8,
    package_remaining_lessons: Number(student.package_remaining_lessons) ?? 8,
    color: student.color || '#3B82F6',
    notes: student.notes || '',
    is_active: student.is_active !== undefined ? student.is_active : true,
    created_at: student.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    if (isNew) {
      const { data, error } = await supabase
        .from('tutor_students')
        .insert([newStudent])
        .select()
        .single();
      if (!error && data) return data as Student;
    } else {
      const { data, error } = await supabase
        .from('tutor_students')
        .update(newStudent)
        .eq('id', newStudent.id)
        .select()
        .single();
      if (!error && data) return data as Student;
    }
  }

  // Local storage fallback
  const list = getLocal<Student[]>(LOCAL_STORAGE_KEY_STUDENTS, INITIAL_STUDENTS);
  const index = list.findIndex(s => s.id === newStudent.id);
  if (index >= 0) {
    list[index] = newStudent;
  } else {
    list.push(newStudent);
  }
  setLocal(LOCAL_STORAGE_KEY_STUDENTS, list);
  return newStudent;
}

export async function deleteStudent(studentId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.from('tutor_students').delete().eq('id', studentId);
  }
  const list = getLocal<Student[]>(LOCAL_STORAGE_KEY_STUDENTS, INITIAL_STUDENTS);
  setLocal(LOCAL_STORAGE_KEY_STUDENTS, list.filter(s => s.id !== studentId));
}

// -------------------------------------------------------------
// LESSONS API
// -------------------------------------------------------------
export async function getLessons(): Promise<Lesson[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tutor_lessons')
      .select('*, tutor_students(name, color, payment_type)')
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (!error && data) {
      return data.map((item: any) => ({
        ...item,
        student_name: item.tutor_students?.name || 'Ученик',
        student_color: item.tutor_students?.color || '#3B82F6',
        student_payment_type: item.tutor_students?.payment_type || 'package',
      })) as Lesson[];
    }
  }
  const localList = getLocal<Lesson[]>(LOCAL_STORAGE_KEY_LESSONS, INITIAL_LESSONS);
  return localList.sort((a, b) => {
    if (a.lesson_date !== b.lesson_date) {
      return (a.lesson_date || '').localeCompare(b.lesson_date || '');
    }
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
}

export async function saveLesson(lesson: Partial<Lesson> & { student_id: string; lesson_date: string; start_time: string }): Promise<Lesson> {
  const students = await getStudents();
  const student = students.find(s => s.id === lesson.student_id);

  const newLesson: Lesson = {
    id: lesson.id || `l_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    student_id: lesson.student_id,
    student_name: student?.name || lesson.student_name || 'Ученик',
    student_color: student?.color || lesson.student_color || '#3B82F6',
    student_payment_type: student?.payment_type || lesson.student_payment_type || 'package',
    lesson_date: lesson.lesson_date,
    start_time: lesson.start_time,
    end_time: lesson.end_time || calculateEndTime(lesson.start_time, 60),
    price: Number(lesson.price) || student?.price_per_lesson || 150000,
    status: lesson.status || 'scheduled',
    is_paid: lesson.is_paid !== undefined ? lesson.is_paid : (student?.payment_type === 'package'),
    notes: lesson.notes || '',
    created_at: lesson.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    const dbPayload = {
      id: newLesson.id,
      student_id: newLesson.student_id,
      lesson_date: newLesson.lesson_date,
      start_time: newLesson.start_time,
      end_time: newLesson.end_time,
      price: newLesson.price,
      status: newLesson.status,
      is_paid: newLesson.is_paid,
      notes: newLesson.notes,
    };
    await supabase.from('tutor_lessons').upsert([dbPayload]);
  }

  const list = getLocal<Lesson[]>(LOCAL_STORAGE_KEY_LESSONS, INITIAL_LESSONS);
  const index = list.findIndex(l => l.id === newLesson.id);
  if (index >= 0) {
    list[index] = newLesson;
  } else {
    list.push(newLesson);
  }
  setLocal(LOCAL_STORAGE_KEY_LESSONS, list);
  return newLesson;
}

export async function saveBatchLessons(newLessons: Lesson[]): Promise<void> {
  if (newLessons.length === 0) return;

  if (isSupabaseConfigured && supabase) {
    const dbPayload = newLessons.map(l => ({
      id: l.id,
      student_id: l.student_id,
      lesson_date: l.lesson_date,
      start_time: l.start_time,
      end_time: l.end_time,
      price: l.price,
      status: l.status,
      is_paid: l.is_paid,
      notes: l.notes,
    }));
    await supabase.from('tutor_lessons').upsert(dbPayload);
  }

  const list = getLocal<Lesson[]>(LOCAL_STORAGE_KEY_LESSONS, INITIAL_LESSONS);
  const updated = [...list, ...newLessons];
  setLocal(LOCAL_STORAGE_KEY_LESSONS, updated);
}

export async function updateLessonStatus(
  lessonId: string,
  newStatus: LessonStatus,
  options?: { reason?: string }
): Promise<Lesson | null> {
  const lessons = await getLessons();
  const lesson = lessons.find(l => l.id === lessonId);
  if (!lesson) return null;

  const previousStatus = lesson.status;
  lesson.status = newStatus;
  lesson.updated_at = new Date().toISOString();

  // If status changes to completed and it wasn't completed before:
  // Decrement student package if student has package
  const students = await getStudents();
  const student = students.find(s => s.id === lesson.student_id);

  if (student && student.payment_type === 'package') {
    if (newStatus === 'completed' && previousStatus !== 'completed') {
      // Deduct 1 lesson from package
      student.package_remaining_lessons = Math.max(0, (student.package_remaining_lessons || 0) - 1);
      await saveStudent(student);
    } else if (previousStatus === 'completed' && newStatus !== 'completed') {
      // Return 1 lesson back if mistakenly marked
      student.package_remaining_lessons = (student.package_remaining_lessons || 0) + 1;
      await saveStudent(student);
    }
  }

  // If marked as missed needing makeup, create makeup queue entry
  if (newStatus === 'missed_makeup' && previousStatus !== 'missed_makeup') {
    await addMakeup({
      student_id: lesson.student_id,
      student_name: lesson.student_name,
      missed_lesson_id: lesson.id,
      reason: options?.reason || 'Пропуск урока',
      missed_date: lesson.lesson_date,
      status: 'pending'
    });
  }

  if (isSupabaseConfigured && supabase) {
    await supabase.from('tutor_lessons').update({ status: newStatus }).eq('id', lessonId);
  }

  setLocal(LOCAL_STORAGE_KEY_LESSONS, lessons);
  return lesson;
}

export async function deleteLesson(lessonId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.from('tutor_lessons').delete().eq('id', lessonId);
  }
  const list = getLocal<Lesson[]>(LOCAL_STORAGE_KEY_LESSONS, INITIAL_LESSONS);
  setLocal(LOCAL_STORAGE_KEY_LESSONS, list.filter(l => l.id !== lessonId));
}

// -------------------------------------------------------------
// PAYMENTS API
// -------------------------------------------------------------
export async function getPayments(): Promise<Payment[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tutor_payments')
      .select('*, tutor_students(name)')
      .order('payment_date', { ascending: false });
    if (!error && data) {
      return data.map((item: any) => ({
        ...item,
        student_name: item.tutor_students?.name || 'Ученик',
      })) as Payment[];
    }
  }
  return getLocal<Payment[]>(LOCAL_STORAGE_KEY_PAYMENTS, INITIAL_PAYMENTS);
}

export async function addPayment(payment: {
  student_id: string;
  amount: number;
  lessons_count: number;
  payment_date?: string;
  payment_method?: string;
  notes?: string;
}): Promise<Payment> {
  const students = await getStudents();
  const student = students.find(s => s.id === payment.student_id);

  const newPayment: Payment = {
    id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    student_id: payment.student_id,
    student_name: student?.name || 'Ученик',
    amount: Number(payment.amount),
    lessons_count: Number(payment.lessons_count) || 1,
    payment_date: payment.payment_date || getTodayStr(),
    payment_method: payment.payment_method || 'Payme / Click',
    notes: payment.notes || '',
    created_at: new Date().toISOString(),
  };

  // If student has package, increase package remaining balance!
  if (student && student.payment_type === 'package') {
    student.package_total_lessons = (student.package_total_lessons || 0) + newPayment.lessons_count;
    student.package_remaining_lessons = (student.package_remaining_lessons || 0) + newPayment.lessons_count;
    await saveStudent(student);
  }

  if (isSupabaseConfigured && supabase) {
    await supabase.from('tutor_payments').insert([{
      id: newPayment.id,
      student_id: newPayment.student_id,
      amount: newPayment.amount,
      lessons_count: newPayment.lessons_count,
      payment_date: newPayment.payment_date,
      payment_method: newPayment.payment_method,
      notes: newPayment.notes,
    }]);
  }

  const list = getLocal<Payment[]>(LOCAL_STORAGE_KEY_PAYMENTS, INITIAL_PAYMENTS);
  list.unshift(newPayment);
  setLocal(LOCAL_STORAGE_KEY_PAYMENTS, list);

  return newPayment;
}

// -------------------------------------------------------------
// MAKEUPS API
// -------------------------------------------------------------
export async function getMakeups(): Promise<MakeupLesson[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tutor_makeups')
      .select('*, tutor_students(name)')
      .order('created_at', { ascending: false });
    if (!error && data) {
      return data.map((item: any) => ({
        ...item,
        student_name: item.tutor_students?.name || 'Ученик',
      })) as MakeupLesson[];
    }
  }
  return getLocal<MakeupLesson[]>(LOCAL_STORAGE_KEY_MAKEUPS, INITIAL_MAKEUPS);
}

export async function addMakeup(makeup: Partial<MakeupLesson> & { student_id: string }): Promise<MakeupLesson> {
  const students = await getStudents();
  const student = students.find(s => s.id === makeup.student_id);

  const newMakeup: MakeupLesson = {
    id: makeup.id || `m_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    student_id: makeup.student_id,
    student_name: student?.name || makeup.student_name || 'Ученик',
    missed_lesson_id: makeup.missed_lesson_id,
    makeup_lesson_id: makeup.makeup_lesson_id,
    status: makeup.status || 'pending',
    reason: makeup.reason || 'Пропуск занятия',
    missed_date: makeup.missed_date || getTodayStr(),
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    await supabase.from('tutor_makeups').insert([{
      id: newMakeup.id,
      student_id: newMakeup.student_id,
      missed_lesson_id: newMakeup.missed_lesson_id,
      status: newMakeup.status,
      reason: newMakeup.reason,
    }]);
  }

  const list = getLocal<MakeupLesson[]>(LOCAL_STORAGE_KEY_MAKEUPS, INITIAL_MAKEUPS);
  list.unshift(newMakeup);
  setLocal(LOCAL_STORAGE_KEY_MAKEUPS, list);
  return newMakeup;
}

export async function resolveMakeup(makeupId: string): Promise<void> {
  const makeups = await getMakeups();
  const item = makeups.find(m => m.id === makeupId);
  if (item) {
    item.status = 'completed';
    item.updated_at = new Date().toISOString();
    setLocal(LOCAL_STORAGE_KEY_MAKEUPS, makeups);
  }
  if (isSupabaseConfigured && supabase) {
    await supabase.from('tutor_makeups').update({ status: 'completed' }).eq('id', makeupId);
  }
}

// Utility
function calculateEndTime(startTime: string, durationMinutes: number = 60): string {
  try {
    const [h, m] = startTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    date.setMinutes(date.getMinutes() + durationMinutes);
    return format(date, 'HH:mm');
  } catch {
    return '20:00';
  }
}
