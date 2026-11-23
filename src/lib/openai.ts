import OpenAI, { toFile } from 'openai';
import type { Student, Lesson, LessonStatus, RecurringSlot, BillingType, PaymentMethod } from '@/types';
import {
  getStudents,
  getLessons,
  setLessonStatusDirect,
  updateLessonTime,
  updateLessonDetails,
  saveStudent,
  deleteLesson,
  getAttendanceSummary,
  parseTimeRange,
  saveLesson,
  planRecurringLessonsForStudent,
  calculateStudentBilling,
  recordStudentPayment,
  PAYMENT_METHOD_LABELS,
} from './storage';
import { getTutorSettings, buildParentInvoiceMessage } from './settings';
import { getTashkentTodayStr, getTashkentNow, dayOfWeekOf, addDaysStr, WD_SHORT, WD_FULL } from './formatters';
import { resolveStudent, findExistingByName } from './nameMatch';
import { getHistory, appendHistory } from './botState';
import { generateStudentReport } from './reports';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const MAX_STEPS = 8;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
  return _client;
}

function assertDate(s: unknown, field = 'date'): string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new Error(`Некорректная дата в поле ${field}: "${s}". Нужен формат YYYY-MM-DD.`);
  }
  return s;
}

const STATUS_RU: Record<string, string> = {
  planned: 'запланирован',
  completed: 'проведён ✅',
  missed: 'пропущен ❌',
  missed_excused: 'пропуск (в отработку)',
  missed_penalty: 'пропуск (списан)',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toTelegramHtml(md: string): string {
  let t = esc(md);
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/__(.+?)__/g, '<b>$1</b>');
  t = t.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  t = t.replace(/^\s*[-*]\s+/gm, '• ');
  return t.trim();
}

const weekSlot = {
  type: 'object',
  properties: {
    dayOfWeek: { type: 'integer', description: 'День недели: 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб, 7=Вс' },
    timeStr: { type: 'string', description: "Время 'HH:MM' или 'HH:MM - HH:MM' (например '16:00 - 17:30')" },
  },
  required: ['dayOfWeek', 'timeStr'],
};

const studentNameProp = {
  type: 'string',
  description: 'Имя ученика как в списке учеников (допустимы небольшие искажения из-за распознавания голоса)',
};

function fn(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = []
): OpenAI.Chat.Completions.ChatCompletionTool {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

// ===========================================================================
// TOOLS FOR GPT-4.1 (Hybrid Billing, Balance Tracking, Attendance, Schedule)
// ===========================================================================
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  // 1. Отметка статуса урока
  fn(
    'markLessonStatus',
    'Отмечает статус урока ученика: completed (проведен, -1 с баланса), missed_penalty (сгорел/пропуск без предупреждения, -1 с баланса), missed_excused (уважительная отмена, урок сохраняется, баланс не меняется). При пропуске укажи причину missReason.',
    {
      studentName: studentNameProp,
      date: { type: 'string', description: 'Дата урока YYYY-MM-DD (по умолчанию сегодня)' },
      status: { type: 'string', enum: ['completed', 'missed_penalty', 'missed_excused', 'missed'], description: 'Статус посещаемости' },
      missReason: { type: 'string', description: 'Причина пропуска (например: Болеет, Предупредил заранее)' },
      lessonNotes: { type: 'string', description: 'Заметка к уроку или домашнее задание' },
    },
    ['studentName', 'status']
  ),

  // 2. Перенос урока
  fn(
    'rescheduleLesson',
    'Переносит урок ученика (запланированный, уже проведенный «был» или пропущенный) на новую дату и/или время. Если исходная дата (fromDate) не указана, система автоматически найдет подходящий/последний урок ученика. После переноса урок становится активным и запланированным (planned).',
    {
      studentName: studentNameProp,
      fromDate: { type: 'string', description: 'Исходная дата урока YYYY-MM-DD (необязательно, если не указана — найдет сегодняшний или последний урок)' },
      toDate: { type: 'string', description: 'Новая дата YYYY-MM-DD' },
      toStartTime: { type: 'string', description: "Новое время 'HH:MM' или 'HH:MM - HH:MM' (например '10:00' или '10:00 - 11:30')" },
      reason: { type: 'string', description: 'Причина переноса' },
    },
    ['studentName', 'toDate', 'toStartTime']
  ),

  // 3. Создание или обновление ученика и его шаблона расписания
  fn(
    'setupOrUpdateStudent',
    'Создает нового ученика или обновляет существующего: модель биллинга (billingType: date_to_date или package), ставку за урок (lessonRate), баланс уроков (lessonsBalance), норму уроков в месяц (monthlyTargetLessons), день оплаты (billingDay) и шаблон периодического расписания (recurringDaysAndTimes).',
    {
      name: { type: 'string', description: 'Имя ученика' },
      billingType: { type: 'string', enum: ['date_to_date', 'package'], description: 'Тип биллинга: date_to_date (по датам) или package (пакет уроков)' },
      lessonRate: { type: 'integer', description: 'Ставка за один урок в сумах (например 300000)' },
      lessonsBalance: { type: 'integer', description: 'Текущий баланс уроков (например 0, 8, 12, -2)' },
      monthlyTargetLessons: { type: 'integer', description: 'Норма уроков в месяц (например 8, 12, 20)' },
      billingDay: { type: 'string', description: "День оплаты, например '10' или '10 число'" },
      recurringDaysAndTimes: { type: 'array', items: weekSlot, description: 'Дни недели и время занятий' },
    },
    ['name']
  ),

  // 4. Расчет биллинга / счета за период
  fn(
    'calculateStudentBilling',
    'Рассчитывает стоимость обучения ученика за период и возвращает актуальные реквизиты карты преподавателя для готового счёта родителям. Для date_to_date считает точное количество уроков по расписанию с учетом баланса. Для package рассчитывает стоимость пакета уроков.',
    {
      studentName: studentNameProp,
      startDate: { type: 'string', description: 'Начальная дата периода YYYY-MM-DD (необязательно)' },
      endDate: { type: 'string', description: 'Конечная дата периода YYYY-MM-DD (необязательно)' },
    },
    ['studentName']
  ),

  // 5. Пополнение баланса и запись оплаты в кассу
  fn(
    'addStudentPayment',
    'Фиксирует фактическую оплату ученика в кассе (tutor_payments) и атомарно пополняет баланс уроков (например: «Аслан оплатил 8 уроков через Payme», «Сахиб перевел 2 400 000 на карту за 8 уроков»). Если сумма не указана — вычисляется автоматически как lessonsCount * lesson_rate.',
    {
      studentName: studentNameProp,
      lessonsCount: { type: 'integer', description: 'Количество оплаченных уроков (например 8, 10, 12)' },
      amount_uzs: { type: 'integer', description: 'Фактическая сумма оплаты в сумах (необязательно; если не названа — вычисляется как lessonsCount * ставка ученика)' },
      payment_method: { type: 'string', enum: ['payme', 'click', 'card', 'cash'], description: 'Способ оплаты: payme, click, card (карта) или cash (наличные). По умолчанию payme.' },
      note: { type: 'string', description: 'Необязательная заметка к оплате (например: за ноябрь, перевод от мамы)' },
    },
    ['studentName', 'lessonsCount']
  ),

  // 6. Отчет по архиву ученика
  fn(
    'getStudentArchiveReport',
    'Формирует полную сводку по архиву посещаемости ученика: модель биллинга, ставка, баланс уроков, день оплаты, проведенные уроки, пропуски с причинами.',
    {
      studentName: studentNameProp,
      month: { type: 'string', description: 'Месяц (необязательно, по умолчанию текущий)' },
    },
    ['studentName']
  ),

  // 7. Сводка за день / неделю / месяц
  fn(
    'getWeeklyOrDailySummary',
    'Возвращает статистику посещаемости за период (today, week, month): сколько проведено уроков, сколько сгорело/пропущено с причинами.',
    {
      period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Период: today (сегодня), week (неделя), month (месяц)' },
    },
    ['period']
  ),

  // 8. Получение расписания
  fn(
    'getSchedule',
    'Возвращает реальные уроки из CRM (дата, время, ученик, статус, причина пропуска). Всегда вызывай перед ответом на вопросы о расписании.',
    {
      studentName: { ...studentNameProp, description: 'Фильтр по ученику (необязательно)' },
      date: { type: 'string', description: 'Один конкретный день YYYY-MM-DD' },
      dateFrom: { type: 'string', description: 'Начало периода YYYY-MM-DD' },
      dateTo: { type: 'string', description: 'Конец периода YYYY-MM-DD' },
      status: { type: 'string', enum: ['all', 'planned', 'completed', 'missed'], description: 'Фильтр по статусу (по умолчанию all)' },
    }
  ),

  // 9. Удаление урока
  fn(
    'deleteLesson',
    'Удаляет урок ученика на указанную дату.',
    {
      studentName: studentNameProp,
      date: { type: 'string', description: 'Дата урока YYYY-MM-DD' },
      time: { type: 'string', description: "Время начала 'HH:MM' (необязательно)" },
    },
    ['studentName', 'date']
  ),

  // 10. Добавление разового/дополнительного урока
  fn(
    'addLesson',
    'Добавляет разовый или дополнительный урок ученика на указанную дату и время без переноса или изменения существующих уроков.',
    {
      studentName: studentNameProp,
      date: { type: 'string', description: 'Дата урока YYYY-MM-DD' },
      startTime: { type: 'string', description: "Время 'HH:MM' или 'HH:MM - HH:MM' (например '14:00' или '14:00 - 15:30')" },
      notes: { type: 'string', description: 'Заметка или тема урока (необязательно)' },
    },
    ['studentName', 'date', 'startTime']
  ),
];

interface Toolbox {
  run: (name: string, rawArgs: string) => Promise<unknown>;
  writes: string[];
}

function createToolbox(): Toolbox {
  const today = getTashkentTodayStr();
  const writes: string[] = [];
  let cache: { students: Student[]; lessons: Lesson[] } | null = null;

  const load = async () => {
    if (!cache) {
      const [students, lessons] = await Promise.all([getStudents(), getLessons()]);
      cache = { students, lessons };
    }
    return cache;
  };

  const pickStudent = async (name: string): Promise<Student> => {
    const { students } = await load();
    const r = resolveStudent(name, students);
    if (!r.ok) throw new Error(r.error);
    return r.student;
  };

  const timeOf = (l: Lesson) => (l.time_str || '').split('-')[0].trim();

interface ToolArgs {
  studentName?: string;
  date?: string;
  status?: string;
  missReason?: string;
  lessonNotes?: string;
  fromDate?: string;
  toDate?: string;
  toStartTime?: string;
  reason?: string;
  name?: string;
  billingType?: BillingType;
  lessonRate?: number;
  lessonsBalance?: number;
  monthlyTargetLessons?: number;
  billingDay?: string;
  recurringDaysAndTimes?: Array<{ dayOfWeek?: number; timeStr?: string }>;
  startDate?: string;
  endDate?: string;
  lessonsCount?: number;
  amount_uzs?: number;
  payment_method?: string;
  note?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  time?: string;
  startTime?: string;
  notes?: string;
}

  const handlers: Record<string, (a: ToolArgs) => Promise<unknown>> = {
    // 1. markLessonStatus
    async markLessonStatus(a) {
      const student = await pickStudent(String(a.studentName || ''));
      const date = a.date ? assertDate(a.date) : today;
      const { lessons } = await load();

      let targetStatus = (a.status || 'completed') as LessonStatus;
      if (targetStatus === 'missed') {
        targetStatus = 'missed_penalty';
      }

      // Find existing lesson for this student on this date
      let lesson = lessons.find((l) => l.student_id === student.id && l.date.substring(0, 10) === date);

      let newBalance = student.lessons_balance ?? 0;
      if (!lesson) {
        lesson = await saveLesson({
          student_id: student.id,
          date,
          status: 'planned',
          miss_reason: a.missReason,
          notes: a.lessonNotes,
        });
        const res = await setLessonStatusDirect(lesson.id, targetStatus, a.missReason);
        newBalance = res.newBalance;
      } else {
        const res = await setLessonStatusDirect(lesson.id, targetStatus, a.missReason);
        newBalance = res.newBalance;
        if (a.lessonNotes) {
          await updateLessonDetails(lesson.id, { notes: a.lessonNotes });
        }
      }

      cache = null;

      const actStr = targetStatus === 'completed'
        ? `проведён ✅ (-1 с баланса)`
        : targetStatus === 'missed_penalty'
        ? `сгорел 🔥 (-1 с баланса)`
        : `отменен 🛑 (баланс сохранен)`;

      writes.push(`${student.name}: урок ${date} ${actStr}, баланс: ${newBalance} ур.`);
      return { success: true, message: `Урок ученика ${student.name} за ${date} ${actStr}. Текущий остаток: ${newBalance} ур.` };
    },

    // 2. rescheduleLesson
    async rescheduleLesson(a) {
      const student = await pickStudent(String(a.studentName || ''));
      const toDate = assertDate(a.toDate, 'toDate');
      const toStartTime = String(a.toStartTime || '16:00');
      const { lessons } = await load();

      const studentLessons = lessons
        .filter((l) => l.student_id === student.id)
        .sort((x, y) => y.date.localeCompare(x.date));

      let lesson: Lesson | undefined;
      if (a.fromDate) {
        const fromDate = assertDate(a.fromDate, 'fromDate');
        lesson = studentLessons.find((l) => l.date.substring(0, 10) === fromDate);
      }

      if (!lesson) {
        lesson = studentLessons.find((l) => l.date.substring(0, 10) === today);
      }

      if (!lesson) {
        lesson = studentLessons.find((l) => l.date.substring(0, 10) === toDate);
      }

      if (!lesson) {
        // Fallback ONLY to upcoming planned/scheduled lessons, nearest first
        const upcomingPlanned = studentLessons
          .filter((l) => (l.status === 'planned' || l.status === 'scheduled') && l.date.substring(0, 10) >= today)
          .sort((x, y) => x.date.localeCompare(y.date));
        lesson = upcomingPlanned[0];
      }

      if (!lesson) {
        // If no upcoming planned, check any planned/scheduled lesson
        lesson = studentLessons.find((l) => l.status === 'planned' || l.status === 'scheduled');
      }

      const originalDate = lesson ? lesson.date.substring(0, 10) : null;

      if (lesson && originalDate !== toDate) {
        await updateLessonTime(lesson.id, toStartTime, toDate);
        await updateLessonDetails(lesson.id, {
          status: 'planned',
          miss_reason: undefined,
          needs_makeup: false,
          notes: a.reason ? `Перенос с ${originalDate}: ${a.reason}` : `Перенос с ${originalDate}`,
        });
      } else if (lesson && originalDate === toDate) {
        await updateLessonTime(lesson.id, toStartTime, toDate);
        await updateLessonDetails(lesson.id, {
          status: 'planned',
          miss_reason: undefined,
          needs_makeup: false,
          notes: a.reason ? `Перенос: ${a.reason}` : (lesson.notes || 'Запланированный урок'),
        });
      } else {
        lesson = await saveLesson({
          student_id: student.id,
          date: toDate,
          time_str: toStartTime,
          status: 'planned',
          notes: a.reason ? `Перенос: ${a.reason}` : 'Запланированный урок',
        });
      }

      cache = null;
      writes.push(`${student.name}: перенос${originalDate ? ` с ${originalDate}` : ''} на ${toDate} в ${toStartTime}`);
      return { success: true, message: `Урок ученика ${student.name} успешно запланирован на ${toDate} в ${toStartTime} ✅. Статус: запланирован.` };
    },

    // 3. setupOrUpdateStudent
    async setupOrUpdateStudent(a) {
      const studentNameInput = String(a.name || '').trim();
      const { students } = await load();
      const existing = findExistingByName(studentNameInput, students);

      const slots: RecurringSlot[] = (a.recurringDaysAndTimes || []).map((s) => {
        const timeStr = String(s.timeStr || '16:00');
        const parsed = parseTimeRange(timeStr, 60);
        return {
          dayOfWeek: Number(s.dayOfWeek),
          startTime: parsed.start,
          endTime: parsed.end,
        };
      });

      const saved = await saveStudent({
        id: existing?.id,
        name: existing?.name || studentNameInput,
        monthly_target_lessons: a.monthlyTargetLessons || existing?.monthly_target_lessons || 12,
        billing_day:
          a.billingDay ||
          (existing?.billing_day !== undefined ? String(existing.billing_day) : '10'),
        billing_type: a.billingType || existing?.billing_type || 'date_to_date',
        lesson_rate: typeof a.lessonRate === 'number' ? a.lessonRate : (existing?.lesson_rate ?? 300000),
        lessons_balance: typeof a.lessonsBalance === 'number' ? a.lessonsBalance : (existing?.lessons_balance ?? 0),
        recurring_schedule: slots.length > 0 ? slots : existing?.recurring_schedule || [],
      });

      if (slots.length > 0) {
        await planRecurringLessonsForStudent(saved.id, slots, 9, true);
      }

      cache = null;
      const act = existing ? 'обновлен' : 'создан';
      writes.push(`Ученик ${saved.name} ${act} (ставка: ${saved.lesson_rate} сум, баланс: ${saved.lessons_balance} ур.)`);
      return {
        success: true,
        student: saved.name,
        billingType: saved.billing_type,
        lessonRate: saved.lesson_rate,
        lessonsBalance: saved.lessons_balance,
        target: saved.monthly_target_lessons,
        billingDay: saved.billing_day,
      };
    },

    // 4. calculateStudentBilling
    async calculateStudentBilling(a) {
      const student = await pickStudent(String(a.studentName || ''));
      const [calc, settings] = await Promise.all([
        calculateStudentBilling(student.id, a.startDate, a.endDate),
        getTutorSettings(),
      ]);

      const paymentDetails = {
        tutorName: settings.tutorName,
        bankName: settings.bankName,
        cardNumber: settings.cardNumber,
        cardHolder: settings.cardHolder || settings.tutorName,
      };
      const parentInvoiceText = buildParentInvoiceMessage(student, calc, settings);

      return {
        success: true,
        calculation: calc,
        summary: calc.summaryText,
        paymentDetails,
        parentInvoiceText,
      };
    },

    // 5. addStudentPayment
    async addStudentPayment(a) {
      const student = await pickStudent(String(a.studentName || ''));
      const count = Math.round(Number(a.lessonsCount) || 0);
      if (count <= 0) throw new Error('Количество уроков должно быть больше 0.');

      const rate = student.lesson_rate || 300000;
      const hasCustomAmount =
        a.amount_uzs !== undefined &&
        a.amount_uzs !== null &&
        Number.isFinite(Number(a.amount_uzs)) &&
        Number(a.amount_uzs) >= 0;
      const amountUzs = hasCustomAmount ? Math.round(Number(a.amount_uzs)) : count * rate;

      const validMethods: PaymentMethod[] = ['payme', 'click', 'card', 'cash'];
      const rawMethod = typeof a.payment_method === 'string' ? a.payment_method.toLowerCase().trim() : 'payme';
      const paymentMethod: PaymentMethod = validMethods.includes(rawMethod as PaymentMethod)
        ? (rawMethod as PaymentMethod)
        : 'payme';

      const note = typeof a.note === 'string' && a.note.trim() ? a.note.trim() : null;

      const { payment, newBalance } = await recordStudentPayment({
        studentId: student.id,
        amountUzs,
        lessonsAdded: count,
        paymentMethod,
        note,
      });

      cache = null;
      const methodLabel = PAYMENT_METHOD_LABELS[paymentMethod];
      writes.push(
        `${student.name}: оплата ${amountUzs.toLocaleString('ru-RU')} сум (${methodLabel}, +${count} ур., баланс: ${newBalance} ур.)`
      );
      return {
        success: true,
        paymentId: payment.id,
        student: student.name,
        lessonsAdded: count,
        amountUzs,
        paymentMethod,
        paymentMethodLabel: methodLabel,
        note,
        newBalance,
        message: `Оплата от ${student.name} записана в кассу: ${amountUzs.toLocaleString('ru-RU')} сум (${methodLabel}), +${count} ур. Новый баланс: ${newBalance} ур.`,
      };
    },

    // 6. getStudentArchiveReport
    async getStudentArchiveReport(a) {
      const student = await pickStudent(String(a.studentName || ''));
      const report = await generateStudentReport(student.id);
      if (!report) return { message: `Не удалось сформировать отчет для ${student.name}` };
      return {
        student: student.name,
        billingType: student.billing_type,
        lessonRate: student.lesson_rate,
        lessonsBalance: student.lessons_balance,
        monthlyTarget: report.targetLessons,
        billingDay: student.billing_day,
        completedCount: report.completedLessons.length,
        missedCount: report.missedLessons.length,
        missedDetails: report.missedLessons.map((m) => `${m.date.substring(0, 10)}: ${m.miss_reason || 'Пропуск'}`),
      };
    },

    // 7. getWeeklyOrDailySummary
    async getWeeklyOrDailySummary(a) {
      const period = a.period === 'today' ? 'today' : a.period === 'week' ? 'week' : 'month';
      const summary = await getAttendanceSummary(period);

      return {
        period,
        completedCount: summary.completedCount,
        missedCount: summary.missedCount,
        missedList: summary.missedDetails,
      };
    },

    // 8. getSchedule
    async getSchedule(a) {
      let from = a.dateFrom ? assertDate(a.dateFrom, 'dateFrom') : today;
      let to = a.dateTo ? assertDate(a.dateTo, 'dateTo') : addDaysStr(from, 30);
      if (a.date) from = to = assertDate(a.date, 'date');

      const lessonsInRange = await getLessons(from, to);
      let list = lessonsInRange;

      let student: Student | null = null;
      if (a.studentName) {
        student = await pickStudent(a.studentName);
        list = list.filter((l) => l.student_id === student!.id);
      }
      if (a.status && a.status !== 'all') {
        if (a.status === 'missed') {
          list = list.filter((l) => l.status === 'missed' || l.status === 'missed_penalty' || l.status === 'missed_excused');
        } else if (a.status === 'planned') {
          list = list.filter((l) => l.status === 'planned' || (l.status as string) === 'scheduled');
        } else {
          list = list.filter((l) => l.status === a.status);
        }
      }

      return {
        period: `${from} … ${to}`,
        student: student?.name ?? 'все ученики',
        total: list.length,
        lessons: list.slice(0, 60).map((l) => ({
          date: l.date.substring(0, 10),
          weekday: WD_SHORT[dayOfWeekOf(l.date.substring(0, 10))],
          time: l.time_str,
          student: l.student_name,
          status: STATUS_RU[l.status] || l.status,
          missReason: l.miss_reason,
          needsMakeup: l.needs_makeup,
        })),
      };
    },

    // 9. deleteLesson
    async deleteLesson(a) {
      const student = await pickStudent(String(a.studentName || ''));
      const date = assertDate(a.date);
      const { lessons } = await load();

      let sameDay = lessons.filter(
        (l) => l.student_id === student.id && l.date.substring(0, 10) === date
      );
      if (sameDay.length === 0) {
        const rangeLessons = await getLessons(date, date);
        sameDay = rangeLessons.filter((l) => l.student_id === student.id);
      }

      let lesson = sameDay[0];
      if (a.time && sameDay.length > 0) {
        const cleanTime = String(a.time).trim().substring(0, 5);
        lesson = sameDay.find((l) => timeOf(l).startsWith(cleanTime)) || lesson;
      }
      if (!lesson) {
        throw new Error(`Урок ученика ${student.name} на ${date} не найден.`);
      }

      await deleteLesson(lesson.id);
      cache = null;
      writes.push(`${student.name}: удален урок на ${date} (${lesson.time_str || ''})`);
      return { success: true, message: `Урок на ${date} (${lesson.time_str || ''}) удален.` };
    },

    // 10. addLesson
    async addLesson(a) {
      const student = await pickStudent(String(a.studentName || ''));
      const date = assertDate(a.date, 'date');
      const parsed = parseTimeRange(a.startTime || '16:00', 90);
      const timeStr = `${parsed.start} - ${parsed.end}`;
      await saveLesson({
        student_id: student.id,
        date,
        time_str: timeStr,
        status: 'planned',
        notes: a.notes || 'Дополнительное занятие',
      });
      cache = null;
      writes.push(`${student.name}: добавлен урок на ${date} в ${timeStr}`);
      return {
        success: true,
        message: `Добавлен урок для ${student.name} на ${date} (${timeStr}) ✅.`,
      };
    },
  };

  return {
    writes,
    async run(name, rawArgs) {
      const fn = handlers[name];
      if (!fn) throw new Error(`Неизвестный инструмент: ${name}`);
      let parsed: ToolArgs = {};
      try {
        parsed = rawArgs ? (JSON.parse(rawArgs) as ToolArgs) : {};
      } catch {
        throw new Error(`Ошибка парсинга JSON аргументов для ${name}: ${rawArgs}`);
      }
      return fn(parsed);
    },
  };
}

// ===========================================================================
// MAIN AI PROCESSOR (Whisper + GPT-4.1)
// ===========================================================================
export async function processWithAI(text: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return '❌ OPENAI_API_KEY не настроен.';
  }

  const toolbox = createToolbox();

  try {
    const today = getTashkentTodayStr();
    const now = getTashkentNow();
    const timeNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dayOfWeek = WD_FULL[dayOfWeekOf(today)];

    const [students, tutorSettings] = await Promise.all([getStudents(), getTutorSettings()]);
    const studentsBrief = students
      .map((s) => `• ${s.name} [тип: ${s.billing_type || 'date_to_date'}, ставка: ${(s.lesson_rate || 300000).toLocaleString('ru-RU')} сум, баланс: ${s.lessons_balance ?? 0} ур., оплата: ${s.billing_day || '10'}]`)
      .join('\n');

    const cardLine = tutorSettings.cardNumber
      ? `Реквизиты преподавателя: ${tutorSettings.bankName || 'Карта'} — ${tutorSettings.cardNumber} (${tutorSettings.cardHolder || tutorSettings.tutorName}).`
      : 'Реквизиты карты преподавателя пока не заполнены в настройках.';

    const systemPrompt = `Ты — умный ИИ-ассистент преподавателя ${tutorSettings.tutorName} в CRM Tutor Tracker 2.0 (Модель Hybrid Billing & Balance Tracking).
Текущее время (Ташкент, UTC+5): ${today} (${dayOfWeek}), ${timeNow}.
${cardLine}

Список учеников преподавателя:
${studentsBrief}

ПРАВИЛА И СИСТЕМА УЧЕТА:
1. Посещаемость (3 статуса):
   - completed (✅ Проведен): списывает 1 урок с баланса ученика.
   - missed_penalty (🔥 Сгорел / Пропуск без предупреждения): списывает 1 урок с баланса ученика (платный пропуск).
   - missed_excused (🛑 Уважительная отмена): НЕ списывает урок (урок сохраняется на балансе).
2. Биллинг, оплаты и балансы:
   - Каждый ученик имеет ставку за урок (lesson_rate, по умолчанию 300 000 сум) и баланс уроков (lessons_balance).
   - Две модели: date_to_date (оплата по числу месяца billing_day, уроки считаются по календарному расписанию за период с учетом остатка) и package (оплата фиксированными пакетами уроков).
   - Если спрашивают стоимость обучения, расчет или счет для родителя — вызывай calculateStudentBilling. Инструмент возвращает актуальные реквизиты (paymentDetails) и готовый текст счёта (parentInvoiceText) с номером карты — включай готовый счёт с реквизитами в ответ, чтобы преподаватель мог сразу переслать его родителю.
   - Если сообщают об оплате уроков (например: «Аслан оплатил 8 уроков через Click», «Сахиб скинул 2 400 000 наличными за 8 уроков») — вызывай addStudentPayment с lessonsCount и опциональными amount_uzs, payment_method (payme | click | card | cash), note. Если сумма не названа, не придумывай — она автоматически посчитается по ставке ученика.
3. Перенос и добавление уроков:
   - При переносе урока — ВСЕГДА вызывай rescheduleLesson. Можно переносить любой урок на новую дату/время. Если дата не указана, функция сама найдет подходящий урок.
   - Для добавления разового или дополнительного урока (не меняя старые уроки) — вызывай addLesson.
4. Отвечай кратко, профессионально и по делу. Форматируй важные цифры и балансы жирным шрифтом.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add recent context
    const history = await getHistory();
    for (const h of history.slice(-4)) {
      messages.push({ role: h.role, content: h.content });
    }
    messages.push({ role: 'user', content: text });

    let finalText = '';

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await getClient().chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
      });

      const message = response.choices[0].message;
      messages.push(message);

      const calls = message.tool_calls || [];
      if (calls.length === 0) {
        finalText = message.content || '';
        break;
      }

      for (const call of calls) {
        if (call.type !== 'function') continue;
        const result = await toolbox.run(call.function.name, call.function.arguments);
        let content = JSON.stringify(result);
        if (content.length > 7000) content = content.slice(0, 7000) + '…(обрезано)';
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }

      if (step === MAX_STEPS - 1) finalText = '⚠️ Не удалось завершить запрос за отведенное число шагов.';
    }

    const doneLine = toolbox.writes.length ? `[выполнено: ${toolbox.writes.join('; ')}]` : '';
    if (!finalText.trim()) {
      finalText = toolbox.writes.length ? `Выполнено: ${toolbox.writes.join('; ')}.` : 'Готово!';
    }

    const html = toTelegramHtml(finalText);
    await appendHistory(text, `${finalText}${doneLine ? ' ' + doneLine : ''}`);
    return html;
  } catch (e: unknown) {
    console.error('OpenAI Error:', e);
    const errMsg = e instanceof Error ? e.message : String(e);
    return `❌ Ошибка ИИ: ${esc(errMsg.slice(0, 300))}`;
  }
}

// ===========================================================================
// WHISPER AUDIO TRANSCRIPTION
// ===========================================================================
export async function transcribeVoice(fileId: string): Promise<string> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !process.env.OPENAI_API_KEY) return '';

  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error('Telegram getFile failed');

    const audioUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    const audioRes = await fetch(audioUrl);
    const arrayBuffer = await audioRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const file = await toFile(buffer, 'voice.oga', { type: 'audio/ogg' });

    let names = '';
    try {
      names = (await getStudents()).map((s) => s.name).join(', ');
    } catch {}

    const prompt = `Преподаватель диктует команды для CRM. Ученики: ${names}. Слова: провел, был, пропустил, заболел, перенеси, оплатил, Payme, Click, карта, наличные, счёт, баланс, расписание.`.slice(0, 600);

    const transcription = await getClient().audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ru',
      prompt,
    });

    return transcription.text;
  } catch (e) {
    console.error('Whisper transcription error:', e);
    return '';
  }
}
