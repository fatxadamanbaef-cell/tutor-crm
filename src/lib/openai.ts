import OpenAI, { toFile } from 'openai';
import type { Student, Lesson, LessonStatus, RecurringSlot } from '@/types';
import {
  getStudents,
  getLessons,
  setLessonStatusDirect,
  updateLessonTime,
  updateLessonDetails,
  saveStudent,
  deleteLesson,
  getAttendanceSummary,
  getPendingMakeups,
  scheduleSundayMakeup,
  parseTimeRange,
  saveLesson,
  planRecurringLessonsForStudent,
} from './storage';
import { getTashkentTodayStr, getTashkentNow } from './formatters';
import { resolveStudent } from './nameMatch';
import { getHistory, appendHistory } from './botState';
import { generateStudentReport } from './reports';
import { supabase } from './supabase';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const MAX_STEPS = 8;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
  return _client;
}

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

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

// ===========================================================================
// TOOLS FOR GPT-4.1 (Zero-Finance, Attendance, Recurring Schedule, Makeups)
// ===========================================================================
const TOOLS = [
  // 1. Отметка статуса урока
  fn(
    'markLessonStatus',
    'Отмечает статус урока ученика (completed — проведен, missed — пропущен). При пропуске ОБЯЗАТЕЛЬНО укажи причину missReason. Если нужно отправить на отработку в воскресенье — установи sendToSundayMakeup: true.',
    {
      studentName: studentNameProp,
      date: { type: 'string', description: 'Дата урока YYYY-MM-DD (по умолчанию сегодня)' },
      status: { type: 'string', enum: ['completed', 'missed'], description: 'Статус: проведен или пропущен' },
      missReason: { type: 'string', description: 'Причина пропуска (например: Болеет, Уехал на соревнования)' },
      sendToSundayMakeup: { type: 'boolean', description: 'Отправить ли урок на отработку в воскресенье' },
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
    'Создает нового ученика или обновляет существующего: норму уроков в месяц (monthlyTargetLessons), день оплаты (billingDay) и шаблон периодического расписания (recurringDaysAndTimes).',
    {
      name: { type: 'string', description: 'Имя ученика' },
      monthlyTargetLessons: { type: 'integer', description: 'Норма уроков в месяц (например 8, 12, 20)' },
      billingDay: { type: 'string', description: "День оплаты, например '10' или '10 число'" },
      recurringDaysAndTimes: { type: 'array', items: weekSlot, description: 'Дни недели и время занятий' },
    },
    ['name']
  ),

  // 4. Отчет по архиву ученика
  fn(
    'getStudentArchiveReport',
    'Формирует полную сводку по архиву посещаемости ученика: норма уроков, день оплаты, проведенные уроки, пропуски с причинами и статус отработок (без каких-либо цен и денег).',
    {
      studentName: studentNameProp,
      month: { type: 'string', description: 'Месяц (необязательно, по умолчанию текущий)' },
    },
    ['studentName']
  ),

  // 5. Сводка за день / неделю / месяц
  fn(
    'getWeeklyOrDailySummary',
    'Возвращает статистику посещаемости за период (today, week, month): сколько проведено уроков, сколько пропущено с причинами, отработки на воскресенье.',
    {
      period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Период: today (сегодня), week (неделя), month (месяц)' },
    },
    ['period']
  ),

  // 6. Получение расписания
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

  // 7. Удаление урока
  fn(
    'deleteLesson',
    'Удаляет запланированный урок.',
    {
      studentName: studentNameProp,
      date: { type: 'string', description: 'Дата урока YYYY-MM-DD' },
      time: { type: 'string', description: "Время начала 'HH:MM'" },
    },
    ['studentName', 'date']
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

  const handlers: Record<string, (a: any) => Promise<unknown>> = {
    // 1. markLessonStatus
    async markLessonStatus(a) {
      const student = await pickStudent(a.studentName);
      const date = a.date ? assertDate(a.date) : today;
      const { lessons } = await load();

      // Find existing lesson for this student on this date
      let lesson = lessons.find((l) => l.student_id === student.id && l.date.substring(0, 10) === date);

      if (!lesson) {
        // If not found and date is not in future, create it
        lesson = await saveLesson({
          student_id: student.id,
          date,
          status: a.status,
          miss_reason: a.missReason,
          needs_makeup: Boolean(a.sendToSundayMakeup),
          notes: a.lessonNotes,
        });
      } else {
        await setLessonStatusDirect(
          lesson.id,
          a.status,
          a.missReason,
          Boolean(a.sendToSundayMakeup)
        );
        if (a.lessonNotes) {
          await updateLessonDetails(lesson.id, { notes: a.lessonNotes });
        }
      }

      cache = null;

      const actStr = a.status === 'completed'
        ? `отмечен как проведённый ✅`
        : `отмечен как пропущенный ❌ (${a.missReason || 'без причины'})${a.sendToSundayMakeup ? ' [на отработке в ВС]' : ''}`;

      writes.push(`${student.name}: урок ${date} ${actStr}`);
      return { success: true, message: `Урок ученика ${student.name} за ${date} ${actStr}.` };
    },

    // 2. rescheduleLesson
    async rescheduleLesson(a) {
      const student = await pickStudent(a.studentName);
      const toDate = assertDate(a.toDate, 'toDate');
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
        // Find today's lesson
        lesson = studentLessons.find((l) => l.date.substring(0, 10) === today);
      }

      if (!lesson) {
        // Check if there is already a lesson on toDate
        lesson = studentLessons.find((l) => l.date.substring(0, 10) === toDate);
      }

      if (!lesson && studentLessons.length > 0) {
        // Pick the most recent lesson (past or planned)
        lesson = studentLessons[0];
      }

      const originalDate = lesson ? lesson.date.substring(0, 10) : null;

      if (lesson && originalDate !== toDate) {
        await updateLessonTime(lesson.id, a.toStartTime, toDate);
        await updateLessonDetails(lesson.id, {
          status: 'planned',
          miss_reason: undefined,
          needs_makeup: false,
          notes: a.reason ? `Перенос с ${originalDate}: ${a.reason}` : `Перенос с ${originalDate}`,
        });
        if (lesson.id && supabase) {
          await supabase.from('tutor_makeups').delete().eq('missed_lesson_id', lesson.id);
        }
      } else if (lesson && originalDate === toDate) {
        await updateLessonTime(lesson.id, a.toStartTime, toDate);
        await updateLessonDetails(lesson.id, {
          status: 'planned',
          notes: a.reason ? `Перенос: ${a.reason}` : (lesson.notes || 'Запланированный урок'),
        });
      } else {
        lesson = await saveLesson({
          student_id: student.id,
          date: toDate,
          time_str: a.toStartTime,
          status: 'planned',
          notes: a.reason ? `Перенос: ${a.reason}` : 'Запланированный урок',
        });
      }

      cache = null;
      writes.push(`${student.name}: перенос${originalDate ? ` с ${originalDate}` : ''} на ${toDate} в ${a.toStartTime}`);
      return { success: true, message: `Урок ученика ${student.name} успешно запланирован на ${toDate} в ${a.toStartTime} ✅. Статус: запланирован.` };
    },

    // 3. setupOrUpdateStudent
    async setupOrUpdateStudent(a) {
      const { students } = await load();
      const existing = students.find((s) => s.name.toLowerCase() === a.name.trim().toLowerCase());

      const slots: RecurringSlot[] = (a.recurringDaysAndTimes || []).map((s: any) => {
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
        name: a.name.trim(),
        monthly_target_lessons: a.monthlyTargetLessons || existing?.monthly_target_lessons || 12,
        billing_day: a.billingDay || existing?.billing_day || '10',
        recurring_schedule: slots.length > 0 ? slots : existing?.recurring_schedule || [],
      });

      if (slots.length > 0) {
        await planRecurringLessonsForStudent(saved.id, slots, 4);
      }

      cache = null;
      const act = existing ? 'обновлен' : 'создан';
      writes.push(`Ученик ${saved.name} ${act}`);
      return { success: true, student: saved.name, target: saved.monthly_target_lessons, billingDay: saved.billing_day };
    },

    // 4. getStudentArchiveReport
    async getStudentArchiveReport(a) {
      const student = await pickStudent(a.studentName);
      const report = await generateStudentReport(student.id);
      if (!report) return { message: `Не удалось сформировать отчет для ${student.name}` };
      return {
        student: student.name,
        monthlyTarget: report.targetLessons,
        billingDay: student.billing_day,
        completedCount: report.completedLessons.length,
        missedCount: report.missedLessons.length,
        missedDetails: report.missedLessons.map((m) => `${m.date.substring(0, 10)}: ${m.miss_reason || 'Пропуск'}`),
        pendingMakeups: report.pendingMakeups,
      };
    },

    // 5. getWeeklyOrDailySummary
    async getWeeklyOrDailySummary(a) {
      const summary = await getAttendanceSummary(a.period === 'week' ? 'week' : 'month');
      const makeups = await getPendingMakeups();

      return {
        period: a.period,
        completedCount: summary.completedCount,
        missedCount: summary.missedCount,
        missedList: summary.missedDetails,
        pendingMakeupsCount: makeups.length,
        pendingMakeupsList: makeups.map((m) => `${m.student_name} (${m.missed_date}): ${m.reason}`),
      };
    },

    // 6. getSchedule
    async getSchedule(a) {
      let from = a.dateFrom ? assertDate(a.dateFrom, 'dateFrom') : today;
      let to = a.dateTo ? assertDate(a.dateTo, 'dateTo') : addDays(from, 30);
      if (a.date) from = to = assertDate(a.date, 'date');

      const lessonsInRange = await getLessons(from, to);
      let list = lessonsInRange;

      let student: Student | null = null;
      if (a.studentName) {
        student = await pickStudent(a.studentName);
        list = list.filter((l) => l.student_id === student!.id);
      }
      if (a.status && a.status !== 'all') list = list.filter((l) => l.status === a.status);

      return {
        period: `${from} … ${to}`,
        student: student?.name ?? 'все ученики',
        total: list.length,
        lessons: list.slice(0, 60).map((l) => ({
          date: l.date.substring(0, 10),
          weekday: WD_SHORT[dowOf(l.date.substring(0, 10))],
          time: l.time_str,
          student: l.student_name,
          status: STATUS_RU[l.status] || l.status,
          missReason: l.miss_reason,
          needsMakeup: l.needs_makeup,
        })),
      };
    },

    // 7. deleteLesson
    async deleteLesson(a) {
      const student = await pickStudent(a.studentName);
      const date = assertDate(a.date);
      const { lessons } = await load();

      const lesson = lessons.find(
        (l) => l.student_id === student.id && l.date.substring(0, 10) === date && l.status === 'planned'
      );
      if (!lesson) {
        throw new Error(`Запланированный урок ученика ${student.name} на ${date} не найден.`);
      }

      await deleteLesson(lesson.id);
      cache = null;
      writes.push(`${student.name}: удален урок на ${date}`);
      return { success: true, message: `Урок на ${date} удален.` };
    },
  };

  return {
    writes,
    async run(name, rawArgs) {
      const fn = handlers[name];
      if (!fn) throw new Error(`Неизвестный инструмент: ${name}`);
      let parsed = {};
      try {
        parsed = rawArgs ? JSON.parse(rawArgs) : {};
      } catch (e) {
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
    const dayOfWeek = WD_FULL[dowOf(today)];

    const students = await getStudents();
    const studentsBrief = students
      .map((s) => `• ${s.name} (норма: ${s.monthly_target_lessons || 12} ур./мес., день оплаты: ${s.billing_day || '—'})`)
      .join('\n');

    const systemPrompt = `Ты — умный ИИ-ассистент преподавателя в CRM Tutor Tracker 2.0.
Текущее время (Ташкент, UTC+5): ${today} (${dayOfWeek}), ${timeNow}.

Список учеников преподавателя:
${studentsBrief}

ПРАВИЛА И КОНЦЕПЦИЯ:
1. В системе НЕТ цен, оплат, сумов (UZS) и банковских реквизитов. Полный Zero-Finance. Никогда не считай и не упоминай деньги.
2. Основная задача — ведение расписания, учет посещаемости (проведено / пропущен с указанием причины), отработки на воскресенье и архив учеников.
3. Если ученик был на уроке — вызывай markLessonStatus со статусом completed.
4. Если ученик пропустил занятие — вызывай markLessonStatus со статусом missed, обязательно передавай причину missReason (например: «Болеет», «Семейные обстоятельства») и sendToSundayMakeup: true, если просят отработать в воскресенье.
5. Если просят перенести урок — ВСЕГДА вызывай rescheduleLesson. Можно переносить ЛЮБОЙ урок: как запланированный, так и тот, который «был» (проведенный) или пропущенный. При переносе на новую дату урок автоматически становится активным и запланированным (planned). Если пользователь не назвал дату исходного урока (например: «перенеси урок Фазилат на завтра на 10:00»), не отказывай и не переспрашивай — rescheduleLesson сам найдет подходящий урок ученика и перенесет его.
6. Отвечай кратко, профессионально и по делу. Форматируй важные данные жирным текстом.`;

    const messages: any[] = [{ role: 'system', content: systemPrompt }];

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
        tools: TOOLS as any,
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
        const fnCall = (call as any).function;
        const result = await toolbox.run(fnCall.name, fnCall.arguments);
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
  } catch (e: any) {
    console.error('OpenAI Error:', e);
    return `❌ Ошибка ИИ: ${esc(String(e?.message || e).slice(0, 300))}`;
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

    const prompt = `Преподаватель диктует команды для расписания. Ученики: ${names}. Слова: провел, был, пропустил, заболел, перенеси на воскресенье, отработка, расписание.`.slice(0, 600);

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
