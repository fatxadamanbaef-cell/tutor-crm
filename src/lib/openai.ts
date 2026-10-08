import OpenAI, { toFile } from 'openai';
import { format } from 'date-fns';
import type { Student, Lesson, LessonStatus } from '@/types';
import {
  getStudents,
  getLessons,
  addPayment,
  setLessonStatusDirect,
  updateLessonTime,
  logPastCompletedLesson,
  planFutureLessons,
  setupNewStudent,
  deleteLesson,
  getFinanceSummary,
  getStudentHistory,
  updateStudentSettings,
  parseTimeRange,
} from './storage';
import { getTashkentTodayStr, getTashkentNow, formatUZS } from './formatters';
import { resolveStudent, findExistingByName } from './nameMatch';
import { getHistory, appendHistory } from './botState';
import { getLessonPlural } from './reports';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Конфиг
// ---------------------------------------------------------------------------
// gpt-4o-mini часто путал учеников и выдумывал уроки при многошаговых командах —
// по умолчанию берём более сильную модель. Можно переопределить через OPENAI_MODEL.
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const MAX_STEPS = 8; // максимум раундов "модель → инструменты → модель"
const TIME_BUDGET_MS = 48_000; // общий бюджет на запрос (maxDuration маршрута = 60с)

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
  return _client;
}

// ---------------------------------------------------------------------------
// Даты
// ---------------------------------------------------------------------------
const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}
function assertDate(s: unknown, field = 'date'): string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new Error(`Некорректная дата в поле ${field}: "${s}". Нужен формат YYYY-MM-DD.`);
  }
  return s;
}

const STATUS_RU: Record<LessonStatus, string> = {
  planned: 'запланирован',
  completed: 'проведён',
  missed_excused: 'пропуск по уважительной (ждёт отработки, не списан)',
  missed_penalty: 'пропуск без предупреждения (списан)',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Заметка расписания осмысленна, только если в ней есть буквы и это не просто «10 число» */
function meaningfulNotes(notes?: string): string {
  const n = (notes || '').trim();
  if (!n || !/[а-яa-z]/i.test(n) || /^\d+\s*(число|-?го)?$/i.test(n)) return '';
  return n;
}

/**
 * Шаблон недели, выведенный из реальных уроков ученика (последние 6 недель + будущие):
 * повторяющиеся пары «день недели + время начала».
 */
function deriveTemplate(lessons: Lesson[], studentId: string, today: string): string {
  const from = addDays(today, -42);
  const counts = new Map<string, number>();
  lessons
    .filter((l) => l.student_id === studentId && l.date.substring(0, 10) >= from)
    .forEach((l) => {
      const d = l.date.substring(0, 10);
      const key = `${dowOf(d)}|${(l.time_str || '').split('-')[0].trim()}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([k]) => k.split('|') as [string, string])
    .sort((a, b) => ((Number(a[0]) + 6) % 7) - ((Number(b[0]) + 6) % 7))
    .map(([dow, t]) => `${WD_SHORT[Number(dow)]} ${t}`)
    .join(', ');
}

/** Ответ модели (Markdown) → безопасный Telegram HTML */
function toTelegramHtml(md: string): string {
  let t = esc(md);
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/__(.+?)__/g, '<b>$1</b>');
  t = t.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  t = t.replace(/^\s*[-*]\s+/gm, '• ');
  return t.trim();
}

// ---------------------------------------------------------------------------
// Инструменты
// ---------------------------------------------------------------------------
const WRITE_TOOLS = new Set([
  'addPayment',
  'setLessonStatus',
  'rescheduleLesson',
  'logPastCompletedLessons',
  'planFutureLessons',
  'setupNewStudent',
  'updateStudent',
  'deleteLesson',
]);

const weekSlot = {
  type: 'object',
  properties: {
    dayOfWeek: { type: 'integer', description: 'День недели: 0=Вс, 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб' },
    timeStr: { type: 'string', description: "Время 'HH:MM' или 'HH:MM - HH:MM' (если конец не указан — урок 90 минут)" },
  },
  required: ['dayOfWeek', 'timeStr'],
};

const studentNameProp = {
  type: 'string',
  description: 'Имя ученика как в списке учеников (допустимы небольшие искажения из-за распознавания голоса)',
};

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

const TOOLS = [
  // ---- чтение ----
  fn(
    'getSchedule',
    'Возвращает реальные уроки из CRM (дата, время, ученик, статус). ВСЕГДА вызывай перед ответом на любой вопрос о расписании/уроках/что было и что будет. По умолчанию: ближайшие 30 дней.',
    {
      studentName: { ...studentNameProp, description: 'Фильтр по ученику (необязательно)' },
      date: { type: 'string', description: 'Один конкретный день YYYY-MM-DD' },
      dateFrom: { type: 'string', description: 'Начало периода YYYY-MM-DD' },
      dateTo: { type: 'string', description: 'Конец периода YYYY-MM-DD' },
      status: { type: 'string', enum: ['all', 'planned', 'completed', 'missed_excused', 'missed_penalty'], description: 'Фильтр по статусу (по умолчанию all)' },
    }
  ),
  fn(
    'getStudentInfo',
    'Полная сводка по ученику: баланс/долг, цена, шаблон расписания, день оплаты, последние оплаты, ближайшие и неотмеченные уроки. Вызывай для вопросов о балансе, оплате, долге.',
    { studentName: studentNameProp },
    ['studentName']
  ),
  fn('getDebtors', 'Список учеников с нулевым/отрицательным балансом (работа в долг) и долгами по отработкам.', {}),
  fn('getFinance', 'Заработок за текущий месяц и общий долг учеников.', {}),

  // ---- запись ----
  fn(
    'addPayment',
    'Вносит оплату: пополняет баланс уроков ученика. Если оплата была в прошлом — передай paymentDate.',
    {
      studentName: studentNameProp,
      lessonsCount: { type: 'integer', description: 'Сколько уроков оплачено' },
      amountUzs: { type: 'number', description: 'Сумма в сумах, если названа. Иначе не передавай — посчитается по цене урока.' },
      paymentDate: { type: 'string', description: 'Дата оплаты YYYY-MM-DD (если не сегодня)' },
    },
    ['studentName', 'lessonsCount']
  ),
  fn(
    'setLessonStatus',
    "Меняет статус урока ученика в указанный день. completed — проведён (списывает 1 урок). missed_excused — отмена по уважительной причине (не списывается, уходит в отработку). missed_penalty — не пришёл/отмена без предупреждения (урок списывается). planned — вернуть в запланированные. Если урока в этот день нет, а нужно отметить проведённым (дата не в будущем) — он будет создан.",
    {
      studentName: studentNameProp,
      date: { type: 'string', description: 'Дата урока YYYY-MM-DD' },
      time: { type: 'string', description: "Время начала 'HH:MM' — только если в этот день у ученика несколько уроков" },
      status: { type: 'string', enum: ['completed', 'missed_excused', 'missed_penalty', 'planned'] },
    },
    ['studentName', 'date', 'status']
  ),
  fn(
    'rescheduleLesson',
    'Переносит ЗАПЛАНИРОВАННЫЙ урок на другое время и/или день.',
    {
      studentName: studentNameProp,
      date: { type: 'string', description: 'Текущая дата урока YYYY-MM-DD' },
      time: { type: 'string', description: "Текущее время начала 'HH:MM' — если в этот день несколько уроков" },
      newTime: { type: 'string', description: "Новое время 'HH:MM' или 'HH:MM - HH:MM'. Если конец не указан — сохраняется прежняя длительность." },
      newDate: { type: 'string', description: 'Новая дата YYYY-MM-DD (если переносится на другой день)' },
    },
    ['studentName', 'date', 'newTime']
  ),
  fn(
    'logPastCompletedLessons',
    'Ретроспективно отмечает уроки в прошлом (или сегодня) проведёнными и списывает баланс. Не создаёт дублей: если урок на эту дату уже есть — отмечает его. Будущие даты игнорируются.',
    {
      studentName: studentNameProp,
      dates: { type: 'array', items: { type: 'string' }, description: 'Даты YYYY-MM-DD проведённых уроков' },
      timeStr: { type: 'string', description: "Время уроков 'HH:MM - HH:MM', если известно (по умолчанию 18:00 - 19:30)" },
    },
    ['studentName', 'dates']
  ),
  fn(
    'planFutureLessons',
    'Создаёт будущие уроки по шаблону недели (начиная с сегодня или со дня после последнего запланированного). Дубликаты на уже занятые даты пропускает.',
    {
      studentName: studentNameProp,
      count: { type: 'integer', description: 'Сколько уроков создать' },
      schedule: { type: 'array', items: weekSlot, description: 'Дни недели и время' },
      startDate: { type: 'string', description: 'С какой даты планировать YYYY-MM-DD (необязательно)' },
    },
    ['studentName', 'count', 'schedule']
  ),
  fn(
    'setupNewStudent',
    'Заводит НОВОГО ученика целиком: профиль, оплата, уже проведённые уроки, будущие уроки по расписанию. Вызывай только если ученика ещё нет в списке.',
    {
      name: { type: 'string', description: 'Имя нового ученика' },
      scheduleNotes: { type: 'string', description: "Расписание текстом, например 'ПН, СР, ПТ в 19:00'" },
      scheduleDays: { type: 'array', items: weekSlot, description: 'То же расписание в структурированном виде (для планирования будущих уроков)' },
      billingDay: { type: 'string', description: "День оплаты, например '1' или '10'" },
      lessonsPaid: { type: 'integer', description: 'Сколько уроков оплачено' },
      amountPaidUzs: { type: 'number', description: 'Сколько заплатили в сумах (если названо). Цена урока = сумма / уроки.' },
      pricePerLesson: { type: 'number', description: 'Цена одного урока, если названа явно' },
      paymentDate: { type: 'string', description: 'Дата оплаты YYYY-MM-DD' },
      pastCompletedDates: { type: 'array', items: { type: 'string' }, description: 'Даты YYYY-MM-DD УЖЕ проведённых уроков (пустой массив, если не было)' },
    },
    ['name', 'scheduleNotes', 'scheduleDays', 'billingDay', 'lessonsPaid', 'pastCompletedDates']
  ),
  fn(
    'updateStudent',
    'Меняет настройки существующего ученика: цену урока, шаблон расписания (текст), день оплаты.',
    {
      studentName: studentNameProp,
      pricePerLesson: { type: 'number' },
      scheduleNotes: { type: 'string', description: "Шаблон расписания текстом, например 'ВТ, ЧТ в 17:00'" },
      billingDay: { type: 'string' },
      prepaidBalance: { type: 'number', description: "Используй только если просят ПРЯМО установить или поменять остаток уроков, например 'осталось 5 уроков'" },
    },
    ['studentName']
  ),
  fn(
    'deleteLesson',
    'Удаляет ЗАПЛАНИРОВАННЫЙ урок (например, созданный по ошибке). Проведённые/списанные уроки удалить нельзя.',
    {
      studentName: studentNameProp,
      date: { type: 'string', description: 'Дата урока YYYY-MM-DD' },
      time: { type: 'string', description: "Время начала 'HH:MM' — если в этот день несколько уроков" },
    },
    ['studentName', 'date']
  ),
];

interface Toolbox {
  run: (name: string, rawArgs: string) => Promise<unknown>;
  writes: string[];
  affected: Set<string>;
}

function createToolbox(): Toolbox {
  const today = getTashkentTodayStr();
  const writes: string[] = [];
  const affected = new Set<string>();
  const seenWrites = new Set<string>();
  let cache: { students: Student[]; lessons: Lesson[] } | null = null;

  const load = async () => {
    if (!cache) {
      const [students, lessons] = await Promise.all([getStudents(), getLessons()]);
      cache = { students, lessons };
    }
    return cache;
  };
  const invalidate = () => {
    cache = null;
  };

  const pickStudent = async (name: string): Promise<Student> => {
    const { students } = await load();
    const r = resolveStudent(name, students);
    if (!r.ok) throw new Error(r.error);
    return r.student;
  };

  const balanceOf = async (id: string): Promise<number> => {
    const students = await getStudents();
    return students.find((s) => s.id === id)?.prepaid_balance ?? 0;
  };

  const timeOf = (l: Lesson) => (l.time_str || '').split('-')[0].trim();

  const findLesson = async (studentId: string, date: string, time?: string, prefer?: LessonStatus[]): Promise<Lesson | null> => {
    const { lessons } = await load();
    let c = lessons.filter((l) => l.student_id === studentId && l.date.substring(0, 10) === date);
    if (time) {
      const t = parseTimeRange(time).start;
      c = c.filter((l) => timeOf(l) === t);
    }
    if (c.length > 1 && prefer) {
      const p = c.filter((l) => prefer.includes(l.status));
      if (p.length >= 1) c = p;
    }
    if (c.length > 1) {
      throw new Error(`В этот день у ученика несколько уроков (${c.map(timeOf).join(', ')}). Укажите время.`);
    }
    return c[0] || null;
  };

  const lessonLine = (l: Lesson) =>
    `${l.date.substring(0, 10)} ${WD_SHORT[dowOf(l.date.substring(0, 10))]} ${l.time_str} | ${l.student_name} | ${STATUS_RU[l.status]}`;

  const handlers: Record<string, (a: any) => Promise<unknown>> = {
    // ------------------------------------------------------------ чтение
    async getSchedule(a) {
      const { lessons, students } = await load();
      let from = a.dateFrom ? assertDate(a.dateFrom, 'dateFrom') : today;
      let to = a.dateTo ? assertDate(a.dateTo, 'dateTo') : addDays(from, 30);
      if (a.date) {
        from = to = assertDate(a.date, 'date');
      }
      let list = lessons.filter((l) => {
        const d = l.date.substring(0, 10);
        return d >= from && d <= to;
      });
      let student: Student | null = null;
      if (a.studentName) {
        student = await pickStudent(a.studentName);
        list = list.filter((l) => l.student_id === student!.id);
      }
      if (a.status && a.status !== 'all') list = list.filter((l) => l.status === a.status);

      const LIMIT = 80;
      const counts: Record<string, number> = {};
      list.forEach((l) => (counts[l.status] = (counts[l.status] || 0) + 1));
      return {
        period: `${from} … ${to}`,
        student: student?.name ?? 'все ученики',
        total: list.length,
        byStatus: counts,
        truncated: list.length > LIMIT,
        lessons: list.slice(0, LIMIT).map(lessonLine),
        note: list.length === 0 ? 'Уроков за этот период нет. Так и скажи, ничего не придумывай.' : undefined,
        knownStudents: students.length,
      };
    },

    async getStudentInfo(a) {
      const s = await pickStudent(a.studentName);
      const { lessons } = await load();
      const mine = lessons.filter((l) => l.student_id === s.id);
      const planned = mine.filter((l) => l.status === 'planned');
      const upcoming = planned.filter((l) => l.date.substring(0, 10) >= today);
      const overdue = planned.filter((l) => l.date.substring(0, 10) < today);
      const month = today.substring(0, 7);
      const history = await getStudentHistory(s.id);
      const payments = history.filter((h) => h.type === 'payment').slice(0, 3);
      const debt = s.prepaid_balance < 0 ? Math.abs(s.prepaid_balance) : 0;
      return {
        name: s.name,
        balanceLessons: s.prepaid_balance,
        balanceMeaning:
          s.prepaid_balance > 0 ? 'оплачено вперёд' : s.prepaid_balance === 0 ? 'абонемент закончился' : 'РАБОТА В ДОЛГ — ученик не оплатил проведённые уроки',
        debtLessons: debt,
        debtUzs: debt * s.price_per_lesson,
        pricePerLesson: s.price_per_lesson,
        scheduleTemplate: meaningfulNotes(s.schedule_notes) || 'не задан',
        scheduleByActualLessons: deriveTemplate(lessons, s.id, today) || 'не определить (мало уроков)',
        billingDay: s.billing_day,
        makeupDebt: s.makeup_debt,
        completedThisMonth: mine.filter((l) => l.status === 'completed' && l.date.startsWith(month)).length,
        upcomingPlannedCount: upcoming.length,
        nextLessons: upcoming.slice(0, 6).map(lessonLine),
        overdueUnmarkedLessons: overdue.slice(-6).map(lessonLine),
        lastPayments: payments.map((p) => `${String(p.date).substring(0, 10)}: ${p.badge}, ${p.amountUzs ? formatUZS(p.amountUzs) : ''}`),
      };
    },

    async getDebtors() {
      const { students } = await load();
      const list = students
        .filter((s) => s.prepaid_balance <= 0 || s.makeup_debt > 0)
        .map((s) => ({
          name: s.name,
          balanceLessons: s.prepaid_balance,
          debtUzs: s.prepaid_balance < 0 ? Math.abs(s.prepaid_balance) * s.price_per_lesson : 0,
          makeupDebt: s.makeup_debt,
          state: s.prepaid_balance < 0 ? 'в долге' : s.prepaid_balance === 0 ? 'абонемент закончился' : 'есть отработки',
        }));
      return { count: list.length, students: list };
    },

    async getFinance() {
      const [fin, { students }] = await Promise.all([getFinanceSummary(), load()]);
      const totalDebt = students.filter((s) => s.prepaid_balance < 0).reduce((sum, s) => sum + Math.abs(s.prepaid_balance) * s.price_per_lesson, 0);
      return { month: today.substring(0, 7), earnedUzs: fin.earnedThisMonthUzs, completedLessons: fin.completedLessonsCount, totalStudentsDebtUzs: totalDebt };
    },

    // ------------------------------------------------------------ запись
    async addPayment(a) {
      const s = await pickStudent(a.studentName);
      const n = Math.floor(Number(a.lessonsCount));
      if (!(n >= 1 && n <= 100)) throw new Error(`Некорректное количество уроков: ${a.lessonsCount}`);
      if (a.paymentDate) {
        assertDate(a.paymentDate, 'paymentDate');
        if (a.paymentDate > today) throw new Error('Дата оплаты не может быть в будущем.');
      }

      // защита от дублей: такая же оплата за последние 10 минут
      if (supabase) {
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from('tutor_payments')
          .select('id')
          .eq('student_id', s.id)
          .eq('lessons_count', n)
          .gte('created_at', since)
          .limit(1);
        if (recent && recent.length > 0) {
          return { skipped: true, reason: `Такая же оплата (${n} ур.) для ${s.name} уже внесена менее 10 минут назад — повторно не добавляю.` };
        }
      }

      const amount = Number(a.amountUzs) > 0 ? Number(a.amountUzs) : s.price_per_lesson * n;
      await addPayment(s.id, amount, n, a.paymentDate);
      invalidate();
      affected.add(s.id);
      writes.push(`оплата ${s.name}: +${n} ур.`);
      const perLesson = Math.round(amount / n);
      return {
        ok: true,
        student: s.name,
        addedLessons: n,
        amountUzs: amount,
        newBalance: await balanceOf(s.id),
        note: perLesson !== s.price_per_lesson ? `Сумма/уроки = ${perLesson} за урок, а цена в CRM ${s.price_per_lesson}. Если цена изменилась — предложи обновить (updateStudent).` : undefined,
      };
    },

    async setLessonStatus(a) {
      const s = await pickStudent(a.studentName);
      const date = assertDate(a.date);
      const status = a.status as LessonStatus;
      if (!['completed', 'missed_excused', 'missed_penalty', 'planned'].includes(status)) throw new Error(`Неизвестный статус ${status}`);
      if (status === 'completed' && date > today) throw new Error(`Нельзя отметить проведённым урок в будущем (${date}).`);

      const lesson = await findLesson(s.id, date, a.time, status === 'completed' ? ['planned', 'missed_excused'] : ['planned']);
      if (!lesson) {
        if (status === 'completed') {
          const r = await logPastCompletedLesson(s.id, date, a.time);
          invalidate();
          affected.add(s.id);
          writes.push(`урок ${s.name} ${date} отмечен проведённым`);
          return { ok: true, student: s.name, date, result: r === 'created' ? 'урока не было — создан проведённый урок' : r, newBalance: await balanceOf(s.id) };
        }
        throw new Error(`У ${s.name} нет урока на ${date}.`);
      }
      if (lesson.status === status) {
        return { skipped: true, reason: `Урок ${s.name} ${date} уже имеет статус «${STATUS_RU[status]}».` };
      }
      await setLessonStatusDirect(lesson.id, status);
      invalidate();
      affected.add(s.id);
      writes.push(`${s.name} ${date}: ${STATUS_RU[status]}`);
      return { ok: true, student: s.name, lesson: `${date} ${lesson.time_str}`, newStatus: STATUS_RU[status], newBalance: await balanceOf(s.id) };
    },

    async rescheduleLesson(a) {
      const s = await pickStudent(a.studentName);
      const date = assertDate(a.date);
      const lesson = await findLesson(s.id, date, a.time, ['planned']);
      if (!lesson) throw new Error(`У ${s.name} нет урока на ${date}.`);
      if (lesson.status !== 'planned') throw new Error(`Перенести можно только запланированный урок, а этот: «${STATUS_RU[lesson.status]}».`);

      const old = parseTimeRange(lesson.time_str || '18:00 - 19:30');
      const oldDur = Math.max(30, (Number(old.end.split(':')[0]) * 60 + Number(old.end.split(':')[1])) - (Number(old.start.split(':')[0]) * 60 + Number(old.start.split(':')[1])));
      const range = parseTimeRange(a.newTime, oldDur);
      const targetDate = a.newDate ? assertDate(a.newDate, 'newDate') : date;
      if (targetDate < today) throw new Error('Нельзя переносить урок в прошлое.');

      // проверка пересечений с другими уроками
      const { lessons } = await load();
      const toMin = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
      const conflicts = lessons
        .filter((l) => l.id !== lesson.id && l.date.substring(0, 10) === targetDate && l.status !== 'missed_excused')
        .filter((l) => {
          const r = parseTimeRange(l.time_str || '18:00 - 19:30');
          return toMin(r.start) < toMin(range.end) && toMin(range.start) < toMin(r.end);
        })
        .map(lessonLine);

      await updateLessonTime(lesson.id, `${range.start} - ${range.end}`, a.newDate ? targetDate : undefined);
      invalidate();
      writes.push(`перенос ${s.name}: ${date} → ${targetDate} ${range.start}`);
      return {
        ok: true,
        student: s.name,
        from: `${date} ${lesson.time_str}`,
        to: `${targetDate} ${range.start} - ${range.end}`,
        warning: conflicts.length ? `Пересекается с другими уроками: ${conflicts.join('; ')}` : undefined,
      };
    },

    async logPastCompletedLessons(a) {
      const s = await pickStudent(a.studentName);
      const dates = [...new Set((Array.isArray(a.dates) ? a.dates : []).map((d: string) => assertDate(String(d).substring(0, 10), 'dates')))].sort() as string[];
      if (dates.length === 0) throw new Error('Не переданы даты.');
      if (dates.length > 40) throw new Error('Слишком много дат за один раз (максимум 40).');
      const out = { created: [] as string[], completedExisting: [] as string[], alreadyDone: [] as string[], skippedFuture: [] as string[] };
      for (const d of dates) {
        const r = await logPastCompletedLesson(s.id, d, a.timeStr);
        if (r === 'created') out.created.push(d);
        else if (r === 'completed_existing') out.completedExisting.push(d);
        else if (r === 'already_done') out.alreadyDone.push(d);
        else out.skippedFuture.push(d);
      }
      invalidate();
      affected.add(s.id);
      const changed = out.created.length + out.completedExisting.length;
      if (changed) writes.push(`${s.name}: списано проведённых уроков — ${changed}`);
      return { ok: true, student: s.name, ...out, newBalance: await balanceOf(s.id) };
    },

    async planFutureLessons(a) {
      const s = await pickStudent(a.studentName);
      const count = Math.floor(Number(a.count));
      if (!(count >= 1 && count <= 60)) throw new Error(`Некорректное количество уроков: ${a.count}`);
      if (!Array.isArray(a.schedule) || a.schedule.length === 0) throw new Error('Не передано расписание (дни недели и время).');
      const r = await planFutureLessons(s.id, count, a.schedule, a.startDate ? assertDate(a.startDate, 'startDate') : undefined);
      invalidate();
      affected.add(s.id);
      if (r.created.length) writes.push(`${s.name}: запланировано ${r.created.length} ур.`);
      return { ok: true, student: s.name, createdCount: r.created.length, created: r.created.map((c) => `${c.substring(0, 10)} ${WD_SHORT[dowOf(c.substring(0, 10))]} ${c.substring(11)}`), skipped: r.skipped };
    },

    async setupNewStudent(a) {
      const name = String(a.name || '').trim();
      if (!name) throw new Error('Не указано имя ученика.');
      const { students } = await load();
      const dup = findExistingByName(name, students);
      if (dup) throw new Error(`Ученик «${dup.name}» уже есть в CRM — новый не создаю. Используй addPayment / planFutureLessons / updateStudent.`);
      const lessonsPaid = Math.floor(Number(a.lessonsPaid));
      if (!(lessonsPaid >= 0 && lessonsPaid <= 100)) throw new Error(`Некорректное число оплаченных уроков: ${a.lessonsPaid}`);
      if (a.paymentDate) assertDate(a.paymentDate, 'paymentDate');
      const past = (Array.isArray(a.pastCompletedDates) ? a.pastCompletedDates : []).map((d: string) => assertDate(String(d).substring(0, 10), 'pastCompletedDates'));

      const r = await setupNewStudent({
        name,
        scheduleNotes: String(a.scheduleNotes || ''),
        billingDay: String(a.billingDay || '10'),
        lessonsPaid,
        pricePerLesson: a.pricePerLesson,
        amountPaidUzs: a.amountPaidUzs,
        paymentDate: a.paymentDate,
        pastCompletedDates: past,
        scheduleDays: Array.isArray(a.scheduleDays) ? a.scheduleDays : [],
      });
      invalidate();
      affected.add(r.studentId);
      writes.push(`новый ученик ${name}`);
      return {
        ok: true,
        student: name,
        pricePerLesson: r.pricePerLesson,
        paidLessons: lessonsPaid,
        pastLessonsLogged: r.pastLogged,
        balanceNow: r.balance,
        plannedLessons: r.plannedDates,
      };
    },

    async updateStudent(a) {
      const s = await pickStudent(a.studentName);
      const updates: { price_per_lesson?: number; schedule_notes?: string; billing_day?: string; prepaid_balance?: number } = {};
      if (a.pricePerLesson !== undefined) updates.price_per_lesson = Number(a.pricePerLesson);
      if (a.scheduleNotes !== undefined) updates.schedule_notes = String(a.scheduleNotes);
      if (a.billingDay !== undefined) updates.billing_day = String(a.billingDay);
      if (a.prepaidBalance !== undefined) updates.prepaid_balance = Number(a.prepaidBalance);
      if (Object.keys(updates).length === 0) throw new Error('Нечего менять.');
      await updateStudentSettings(s.id, updates);
      invalidate();
      writes.push(`настройки ${s.name} обновлены`);
      return { ok: true, student: s.name, updated: updates };
    },

    async deleteLesson(a) {
      const s = await pickStudent(a.studentName);
      const date = assertDate(a.date);
      const lesson = await findLesson(s.id, date, a.time, ['planned']);
      if (!lesson) throw new Error(`У ${s.name} нет урока на ${date}.`);
      if (lesson.status !== 'planned') {
        throw new Error(`Удалить можно только запланированный урок, а этот: «${STATUS_RU[lesson.status]}». Сначала верни статус planned.`);
      }
      await deleteLesson(lesson.id);
      invalidate();
      writes.push(`удалён урок ${s.name} ${date}`);
      return { ok: true, deleted: `${s.name} ${date} ${lesson.time_str}` };
    },
  };

  const stable = (v: unknown): string => JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort()) : val));

  return {
    writes,
    affected,
    async run(name, rawArgs) {
      const h = handlers[name];
      if (!h) return { error: `Неизвестный инструмент ${name}` };
      let args: any = {};
      try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
      } catch {
        return { error: 'Аргументы инструмента — некорректный JSON.' };
      }
      if (WRITE_TOOLS.has(name)) {
        const key = `${name}:${stable(args)}`;
        if (seenWrites.has(key)) return { skipped: true, reason: 'Точно такой же вызов уже выполнен в этом запросе — повторять не нужно.' };
        seenWrites.add(key);
      }
      try {
        console.log('TOOL CALL:', name, JSON.stringify(args));
        return await h(args);
      } catch (e: any) {
        console.error(`Tool ${name} failed:`, e);
        return { error: e?.message || String(e) };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Системный промпт
// ---------------------------------------------------------------------------
function buildSystemPrompt(students: Student[], lessons: Lesson[]): string {
  const now = getTashkentNow();
  const today = getTashkentTodayStr();

  const studentsContext = students
    .map((s) => {
      const bal = s.prepaid_balance;
      const balStr = bal < 0 ? `ДОЛГ ${Math.abs(bal)} ур.` : `${bal} ур.`;
      const notes = meaningfulNotes(s.schedule_notes);
      const derived = deriveTemplate(lessons, s.id, today);
      const sched = [notes && `заметка: ${notes}`, derived && `по факту уроков: ${derived}`].filter(Boolean).join('; ') || 'не задано';
      return `• ${s.name} — баланс: ${balStr}; цена: ${s.price_per_lesson}; расписание: ${sched}`;
    })
    .join('\n');

  const overdueByStudent = new Map<string, string[]>();
  lessons
    .filter((l) => l.status === 'planned' && l.date.substring(0, 10) < today)
    .forEach((l) => {
      const arr = overdueByStudent.get(l.student_name || '?') || [];
      arr.push(l.date.substring(0, 10));
      overdueByStudent.set(l.student_name || '?', arr);
    });
  const overdueContext = [...overdueByStudent.entries()]
    .slice(0, 10)
    .map(([n, d]) => `• ${n}: ${d.length} шт. (${d.slice(-4).join(', ')})`)
    .join('\n');

  const calendar = Array.from({ length: 23 }, (_, i) => addDays(today, i - 7))
    .map((d) => `${WD_SHORT[dowOf(d)]} ${d}${d === today ? ' (СЕГОДНЯ)' : ''}`)
    .join('; ');

  return `Ты — AI-ассистент частного репетитора (его зовут Фархад) внутри CRM. Ты говоришь только с ним. Он часто диктует голосом, поэтому текст может содержать ошибки распознавания. Отвечай по-русски, коротко и по делу.

ТЕКУЩИЙ МОМЕНТ (Ташкент): ${today}, ${WD_FULL[dowOf(today)]}, ${format(now, 'HH:mm')}.
Календарь (для "завтра", "в пятницу", "5 сентября" и т.п.): ${calendar}

УЧЕНИКИ В CRM:
${studentsContext || 'Пока нет учеников'}

ЗАПЛАНИРОВАННЫЕ УРОКИ В ПРОШЛОМ, ЕЩЁ НЕ ОТМЕЧЕННЫЕ (репетитор мог забыть отметить):
${overdueContext || 'нет'}

КАК РАБОТАТЬ
1. Факты — только из инструментов. Любой вопрос про расписание, уроки, баланс, оплаты, долги, заработок: СНАЧАЛА вызови getSchedule / getStudentInfo / getDebtors / getFinance и отвечай только по их результату. Ничего не выдумывай и не пересказывай по памяти. Если данных нет — так и скажи.
2. Ученика указывай по имени (studentName). Если имя звучит как искажённое (например, "Сахип" вместо "Сахиб") — подставь ближайшее из списка. Если не уверен или подходят несколько — задай один уточняющий вопрос.
3. Если для действия не хватает обязательных данных (какой ученик, сколько уроков, какая дата) — не угадывай, задай ОДИН короткий вопрос.
4. Даты считай только по календарю выше. Формат для инструментов — YYYY-MM-DD, время — HH:MM.
5. Один запрос репетитора = одно выполнение. Не вызывай одну и ту же запись дважды. Если инструмент вернул error — прямо скажи, что именно не получилось; не делай вид, что всё сделано.
6. После записи опирайся на newBalance / результат инструмента. Сообщи, что именно изменилось (ученик, даты, цифры).

ТИПОВЫЕ СИТУАЦИИ
• «Урок прошёл / была / занимались» → setLessonStatus(completed) на нужную дату (по умолчанию сегодня).
• «Пропустил(а), предупредил(а)» → missed_excused (не списывается). «Не пришёл(ла) / отменил без причины / сгорел» → missed_penalty (списывается). Если неясно, какой вариант — спроси.
• «Заплатил(а) за N уроков» → addPayment. Если названа только сумма: N = сумма / цена урока (если делится нацело), иначе спроси.
• Оплата с опозданием и уроки, проведённые «в долг» до оплаты → addPayment(paymentDate) + logPastCompletedLessons по датам занятий из шаблона расписания (только даты ≤ сегодня). Если не уверен в датах — спроси.
• КОРРЕКТИРОВКА БАЛАНСА: Если репетитор просит прямо изменить или установить остаток уроков (например, "осталось только 5 уроков, поменяй баланс на 5"), используй \`updateStudent\` с параметром \`prepaidBalance\`. ВНИМАНИЕ: это только меняет цифру, но НЕ создает уроки в календаре! Чтобы уроки появились, сначала вызови \`getStudentInfo\`, посмотри сколько будущих уроков уже запланировано (upcoming), посчитай разницу (новый баланс минус upcoming), и вызови \`planFutureLessons\` на это недостающее количество (взяв дни из scheduleNotes). Если расписание неизвестно — спроси его. Если репетитор просто забыл внести оплату, используй \`addPayment\`.
• Новый ученик → setupNewStudent, но только когда известны: имя, дни и время занятий, сколько уроков оплачено. Нет чего-то — спроси. Сумму/дату оплаты и даты уже проведённых уроков передавай, если названы.
• «Запланируй N уроков» → planFutureLessons по шаблону расписания ученика.
• «Что дальше / покажи по датам / а у Мадины?» → getSchedule с нужным фильтром.
• Если видишь неотмеченные прошлые уроки (список выше) и это уместно — коротко напомни про них.

ФОРМАТ ОТВЕТА
• Без таблиц и без длинных вступлений. Списки — через «•». Жирный (**так**) — только для имён и сумм.
• Даты пиши как «8 окт (чт) 19:00».
• Предупреждение о долге («ушёл в минус / работаете в долг») и напоминание об окончании абонемента система добавит САМА после твоего ответа — не повторяй его.`;
}

// ---------------------------------------------------------------------------
// Основная функция
// ---------------------------------------------------------------------------
export async function processWithAI(text: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return '❌ Ключ OPENAI_API_KEY не настроен (добавьте его в переменные окружения, чтобы ИИ заработал).';
  }

  const started = Date.now();
  const toolbox = createToolbox();

  try {
    const [students, lessons, history] = await Promise.all([getStudents(), getLessons(), getHistory()]);

    const messages: any[] = [
      { role: 'system', content: buildSystemPrompt(students, lessons) },
      ...history,
      { role: 'user', content: text },
    ];

    const useTemperature = !/^(o\d|gpt-5)/.test(MODEL);
    let finalText = '';

    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        finalText = '⏱ Запрос выполнялся слишком долго, я остановился.';
        break;
      }

      const response = await getClient().chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS as any,
        tool_choice: 'auto',
        ...(useTemperature ? { temperature: 0.2 } : {}),
      });

      const message = response.choices[0].message;
      messages.push(message);

      const calls = message.tool_calls || [];
      if (calls.length === 0) {
        finalText = message.content || '';
        break;
      }

      // Выполняем вызовы строго по порядку — порядок важен (оплата → списание → планирование)
      for (const call of calls) {
        const fnCall = (call as any).function;
        const result = await toolbox.run(fnCall.name, fnCall.arguments);
        let content = JSON.stringify(result);
        if (content.length > 7000) content = content.slice(0, 7000) + '…(обрезано)';
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }

      if (step === MAX_STEPS - 1) finalText = '⚠️ Не удалось завершить запрос за отведённое число шагов.';
    }

    const doneLine = toolbox.writes.length ? `[выполнено: ${toolbox.writes.join('; ')}]` : '';
    if (!finalText.trim()) {
      finalText = toolbox.writes.length ? `Выполнено: ${toolbox.writes.join('; ')}.` : 'Извини, я не понял. Переформулируй, пожалуйста.';
    }

    let html = toTelegramHtml(finalText);

    // Детерминированные предупреждения о долге — не зависят от «настроения» модели
    if (toolbox.affected.size > 0) {
      const fresh = await getStudents();
      const notes: string[] = [];
      for (const id of toolbox.affected) {
        const s = fresh.find((x) => x.id === id);
        if (!s) continue;
        if (s.prepaid_balance < 0) {
          const d = Math.abs(s.prepaid_balance);
          notes.push(`⚠️ <b>${esc(s.name)} ушёл в минус: ${d} ${getLessonPlural(d)} (${formatUZS(d * s.price_per_lesson)}). Вы работаете в долг!</b>`);
        } else if (s.prepaid_balance === 0) {
          notes.push(`🟠 У <b>${esc(s.name)}</b> абонемент закончился (0 ур.) — пора напомнить об оплате.`);
        }
      }
      if (notes.length) html += `\n\n${notes.join('\n')}`;
    }

    await appendHistory(text, `${finalText}${doneLine ? ' ' + doneLine : ''}`);
    return html;
  } catch (e: any) {
    console.error('OpenAI AI Error:', e);
    const done = toolbox.writes.length ? `\n\n⚠️ До сбоя успело выполниться: ${esc(toolbox.writes.join('; '))}. Проверьте в CRM, прежде чем повторять.` : '';
    return `❌ ИИ не смог обработать запрос: ${esc(String(e?.message || e).slice(0, 300))}${done}`;
  }
}

// ---------------------------------------------------------------------------
// Голос → текст
// ---------------------------------------------------------------------------
export async function transcribeVoice(fileId: string): Promise<string> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '8520814142:AAF1jZQZ9WQX6Hv4QRGOizoEwv2GRChtiPw';
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

    // Подсказка Whisper: имена реальных учеников и словарь предметной области —
    // резко снижает ошибки вроде «Сахип» вместо «Сахиб».
    let names = '';
    try {
      names = (await getStudents()).map((s) => s.name).join(', ');
    } catch {}
    const prompt = `Репетитор диктует команды для CRM. Ученики: ${names}. Слова: урок, уроки, оплатил, скинул, абонемент, перенести, отменить, пропуск, долг, понедельник, вторник, среда, четверг, пятница, суббота, воскресенье.`.slice(0, 700);

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
