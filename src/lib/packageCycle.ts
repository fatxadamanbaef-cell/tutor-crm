import { Lesson, Payment, Student } from '@/types';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  addDaysStr,
  dayOfWeekOf,
  extractBillingDayNumber,
  formatShortRuDate,
  getStudentBillingPeriod,
  getTashkentDateString,
  getTashkentTodayStr,
  isIsoDateString,
} from './formatters';

export interface PlannedSlotLabel {
  index: number;
  total: number;
  isFinal: boolean;
}

export interface StudentCycleSummary {
  mode: 'package' | 'date_to_date';
  startDate: string;
  endDate: string | null;
  isStartDateExplicit: boolean;
  totalLessons: number;
  usedLessons: number;
  completedLessons: number;
  penaltyLessons: number;
  excusedLessons: number;
  remainingLessons: number;
  debtLessons: number;
  prepaidExtraLessons: number;
  progressPct: number;
  isExhausted: boolean;
  estimatedEndDate: string | null;
  plannedSlotNumbers: Record<string, PlannedSlotLabel>;
  cycleLessons: Lesson[];
}

export interface ArchivePeriodOption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  kind: 'payment' | 'billing_period' | 'month';
}

export type CycleStudentInput = Pick<
  Student,
  | 'id'
  | 'billing_type'
  | 'billing_day'
  | 'monthly_target_lessons'
  | 'lessons_balance'
  | 'recurring_schedule'
>;

type LessonKind = 'completed' | 'penalty' | 'excused' | 'planned';

export function classifyLessonKind(lesson: Pick<Lesson, 'status' | 'needs_makeup'>): LessonKind {
  if (lesson.status === 'completed') return 'completed';
  if (lesson.status === 'missed_penalty' || (lesson.status === 'missed' && !lesson.needs_makeup)) {
    return 'penalty';
  }
  if (lesson.status === 'missed_excused' || (lesson.status === 'missed' && Boolean(lesson.needs_makeup))) {
    return 'excused';
  }
  return 'planned';
}

export function getLessonDateStr(lesson: Pick<Lesson, 'date'>): string {
  return lesson.date.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(lesson.date)
    ? lesson.date.substring(0, 10)
    : getTashkentDateString(lesson.date);
}

export function sortLessonsAsc<T extends Pick<Lesson, 'date' | 'time_str'>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const da = getLessonDateStr(a);
    const db = getLessonDateStr(b);
    if (da !== db) return da.localeCompare(db);
    return (a.time_str || '').localeCompare(b.time_str || '');
  });
}

function getLastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function matchesBillingDay(dateStr: string, bDay: number): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const clamped = Math.min(bDay, getLastDayOfMonth(y, m - 1));
  return d === clamped;
}

function projectEstimatedEndDate(
  student: Pick<Student, 'recurring_schedule'>,
  plannedInCycle: Lesson[],
  remainingLessons: number,
  todayStr: string,
  hasAnyLessonToday: boolean
): string | null {
  if (remainingLessons <= 0) return null;

  if (plannedInCycle.length >= remainingLessons) {
    return getLessonDateStr(plannedInCycle[remainingLessons - 1]);
  }

  const lastPlannedDate =
    plannedInCycle.length > 0 ? getLessonDateStr(plannedInCycle[plannedInCycle.length - 1]) : null;
  const extraNeeded = remainingLessons - plannedInCycle.length;
  const slots = student.recurring_schedule || [];

  if (slots.length === 0) {
    return lastPlannedDate;
  }

  let cursor = lastPlannedDate
    ? addDaysStr(lastPlannedDate, 1)
    : hasAnyLessonToday
    ? addDaysStr(todayStr, 1)
    : todayStr;
  let counted = 0;

  for (let i = 0; i < 365; i++) {
    const dow = dayOfWeekOf(cursor);
    const matchesCount = slots.filter((s) => Number(s.dayOfWeek) === dow).length;
    if (matchesCount > 0) {
      counted += matchesCount;
      if (counted >= extraNeeded) {
        return cursor;
      }
    }
    cursor = addDaysStr(cursor, 1);
  }

  return lastPlannedDate;
}

export function computeStudentCycleSummary(
  student: CycleStudentInput,
  studentLessons: Lesson[],
  todayStr: string = getTashkentTodayStr()
): StudentCycleSummary {
  const mode: 'package' | 'date_to_date' =
    student.billing_type === 'package' ? 'package' : 'date_to_date';
  const balance = typeof student.lessons_balance === 'number' ? student.lessons_balance : 0;
  const debtLessons = Math.max(0, -balance);
  const sortedAll = sortLessonsAsc(studentLessons);

  if (mode === 'package') {
    const totalLessons = Math.max(1, Number(student.monthly_target_lessons) || 12);

    let startDate: string;
    let isStartDateExplicit = false;

    if (isIsoDateString(student.billing_day)) {
      isStartDateExplicit = true;
      startDate = String(student.billing_day).trim();
    } else {
      const expectedUsed =
        balance <= 0 ? totalLessons : balance >= totalLessons ? 0 : totalLessons - balance;

      const deductedDesc = sortedAll
        .filter((l) => {
          const d = getLessonDateStr(l);
          const kind = classifyLessonKind(l);
          return d <= todayStr && (kind === 'completed' || kind === 'penalty');
        })
        .reverse();

      if (expectedUsed > 0 && deductedDesc.length > 0) {
        const anchor = deductedDesc[Math.min(expectedUsed, deductedDesc.length) - 1];
        let inferredStart = getLessonDateStr(anchor);
        const bDay = extractBillingDayNumber(student.billing_day);

        let candidateDate: string | null = null;
        for (let offset = -6; offset <= 0; offset++) {
          const d = addDaysStr(inferredStart, offset);
          if (matchesBillingDay(d, bDay)) {
            candidateDate = d;
            break;
          }
        }

        if (candidateDate) {
          const earliestExcused = sortedAll.find((l) => {
            const d = getLessonDateStr(l);
            return (
              d >= candidateDate! &&
              d < inferredStart &&
              classifyLessonKind(l) === 'excused'
            );
          });
          if (earliestExcused) {
            inferredStart = getLessonDateStr(earliestExcused);
          }
        }

        startDate = inferredStart;
      } else if (expectedUsed === 0) {
        startDate = todayStr;
      } else {
        const nowRef = parseISO(`${todayStr}T12:00:00+05:00`);
        startDate = getStudentBillingPeriod(student.billing_day || '10', nowRef).startDate;
      }
    }

    const activeWindowLessons = sortedAll.filter((l) => {
      const d = getLessonDateStr(l);
      const kind = classifyLessonKind(l);
      return (d >= startDate && d <= todayStr) || (d > todayStr && kind !== 'planned');
    });

    let completedLessons = 0;
    let penaltyLessons = 0;
    let excusedLessons = 0;

    for (const l of activeWindowLessons) {
      const kind = classifyLessonKind(l);
      if (kind === 'completed') completedLessons++;
      else if (kind === 'penalty') penaltyLessons++;
      else if (kind === 'excused') excusedLessons++;
    }

    const deductedInWindow = completedLessons + penaltyLessons;

    let usedLessons: number;
    let remainingLessons: number;
    let prepaidExtraLessons: number;
    let isExhausted: boolean;

    if (isStartDateExplicit) {
      usedLessons = deductedInWindow;
      if (balance <= 0) {
        remainingLessons = 0;
        prepaidExtraLessons = 0;
        isExhausted = true;
      } else {
        const neededToClose = Math.max(0, totalLessons - usedLessons);
        if (usedLessons === 0 && balance > totalLessons) {
          remainingLessons = Math.min(balance, totalLessons);
          prepaidExtraLessons = Math.max(0, balance - totalLessons);
          isExhausted = false;
        } else {
          remainingLessons = Math.min(balance, neededToClose);
          prepaidExtraLessons = Math.max(0, balance - remainingLessons);
          isExhausted = remainingLessons === 0;
        }
      }
    } else {
      if (balance <= 0) {
        usedLessons = Math.max(deductedInWindow, totalLessons);
        remainingLessons = 0;
        prepaidExtraLessons = 0;
        isExhausted = true;
      } else if (balance > totalLessons) {
        if (deductedInWindow > 0 && deductedInWindow < totalLessons) {
          usedLessons = deductedInWindow;
          remainingLessons = totalLessons - deductedInWindow;
          prepaidExtraLessons = balance - remainingLessons;
          isExhausted = false;
        } else {
          usedLessons = 0;
          remainingLessons = totalLessons;
          prepaidExtraLessons = balance - totalLessons;
          isExhausted = false;
        }
      } else {
        usedLessons = Math.max(deductedInWindow, totalLessons - balance);
        remainingLessons = balance;
        prepaidExtraLessons = 0;
        isExhausted = false;
      }
    }

    const futurePlanned = sortedAll.filter((l) => {
      const d = getLessonDateStr(l);
      return d >= todayStr && classifyLessonKind(l) === 'planned';
    });

    const plannedInCycle = futurePlanned.slice(0, remainingLessons);
    const plannedSlotNumbers: Record<string, PlannedSlotLabel> = {};

    plannedInCycle.forEach((l, idx) => {
      plannedSlotNumbers[l.id] = {
        index: usedLessons + idx + 1,
        total: totalLessons,
        isFinal: idx === remainingLessons - 1,
      };
    });

    const hasAnyLessonToday = sortedAll.some((l) => getLessonDateStr(l) === todayStr);
    const estimatedEndDate = projectEstimatedEndDate(
      student,
      plannedInCycle,
      remainingLessons,
      todayStr,
      hasAnyLessonToday
    );

    const progressPct = isExhausted
      ? 100
      : Math.min(100, Math.round((usedLessons / totalLessons) * 100));

    const cycleLessonMap = new Map<string, Lesson>();
    for (const l of activeWindowLessons) {
      cycleLessonMap.set(l.id, l);
    }
    for (const l of plannedInCycle) {
      cycleLessonMap.set(l.id, l);
    }
    const cycleLessons = sortLessonsAsc(Array.from(cycleLessonMap.values()));

    return {
      mode: 'package',
      startDate,
      endDate: estimatedEndDate,
      isStartDateExplicit,
      totalLessons,
      usedLessons,
      completedLessons,
      penaltyLessons,
      excusedLessons,
      remainingLessons,
      debtLessons,
      prepaidExtraLessons,
      progressPct,
      isExhausted,
      estimatedEndDate,
      plannedSlotNumbers,
      cycleLessons,
    };
  }

  // date_to_date mode
  const nowRef = parseISO(`${todayStr}T12:00:00+05:00`);
  const period = getStudentBillingPeriod(student.billing_day || '10', nowRef);

  const periodLessons = sortedAll.filter((l) => {
    const d = getLessonDateStr(l);
    return d >= period.startDate && d <= period.endDate;
  });

  let completedLessons = 0;
  let penaltyLessons = 0;
  let excusedLessons = 0;

  for (const l of periodLessons) {
    const kind = classifyLessonKind(l);
    if (kind === 'completed') completedLessons++;
    else if (kind === 'penalty') penaltyLessons++;
    else if (kind === 'excused') excusedLessons++;
  }

  const usedLessons = completedLessons + penaltyLessons;

  let scheduledFromRecurring = 0;
  const slots = student.recurring_schedule || [];
  if (slots.length > 0) {
    let cursor = period.startDate;
    while (cursor <= period.endDate) {
      const dow = dayOfWeekOf(cursor);
      scheduledFromRecurring += slots.filter((s) => Number(s.dayOfWeek) === dow).length;
      cursor = addDaysStr(cursor, 1);
    }
  }

  const totalLessons =
    scheduledFromRecurring > 0
      ? scheduledFromRecurring
      : Math.max(1, Number(student.monthly_target_lessons) || 12);
  const remainingLessons = Math.max(0, totalLessons - usedLessons);
  const progressPct = Math.min(100, Math.round((usedLessons / totalLessons) * 100));

  return {
    mode: 'date_to_date',
    startDate: period.startDate,
    endDate: period.endDate,
    isStartDateExplicit: true,
    totalLessons,
    usedLessons,
    completedLessons,
    penaltyLessons,
    excusedLessons,
    remainingLessons,
    debtLessons,
    prepaidExtraLessons: 0,
    progressPct,
    isExhausted: false,
    estimatedEndDate: period.endDate,
    plannedSlotNumbers: {},
    cycleLessons: periodLessons,
  };
}

export function buildArchivePeriods(
  student: CycleStudentInput,
  allLessons: Lesson[],
  payments: Payment[],
  currentCycleStartDate: string,
  todayStr: string = getTashkentTodayStr()
): ArchivePeriodOption[] {
  const options: ArchivePeriodOption[] = [];
  const seenRanges = new Set<string>();

  if (student.billing_type === 'package') {
    const pastPayments = payments
      .filter((p) => p.lessons_added > 0)
      .map((p) => ({
        ...p,
        paidDate: getTashkentDateString(p.paid_at),
      }))
      .filter((p) => p.paidDate < currentCycleStartDate)
      .sort((a, b) => b.paidDate.localeCompare(a.paidDate));

    let nextBoundary = currentCycleStartDate;
    for (const p of pastPayments) {
      const startDate = p.paidDate;
      const endDate = addDaysStr(nextBoundary, -1);
      if (startDate <= endDate) {
        const key = `${startDate}_${endDate}`;
        if (!seenRanges.has(key)) {
          seenRanges.add(key);
          options.push({
            id: `pay_${p.id}`,
            label: `Пакет · ${formatShortRuDate(startDate)} – ${formatShortRuDate(endDate)} (+${p.lessons_added} ур.)`,
            startDate,
            endDate,
            kind: 'payment',
          });
        }
      }
      nextBoundary = startDate;
    }

    const monthsMap = new Map<string, { startDate: string; endDate: string; label: string }>();
    for (const l of allLessons) {
      const d = getLessonDateStr(l);
      if (d >= currentCycleStartDate) continue;
      const ym = d.substring(0, 7);
      if (!monthsMap.has(ym)) {
        const [y, m] = ym.split('-').map(Number);
        const lastDay = getLastDayOfMonth(y, m - 1);
        const monthStart = `${ym}-01`;
        const monthEndRaw = `${ym}-${String(lastDay).padStart(2, '0')}`;
        const monthEnd =
          monthEndRaw >= currentCycleStartDate
            ? addDaysStr(currentCycleStartDate, -1)
            : monthEndRaw;
        if (monthStart <= monthEnd) {
          const parsed = parseISO(`${ym}-15T12:00:00+05:00`);
          const rawName = format(parsed, 'LLLL yyyy', { locale: ru });
          const capName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
          monthsMap.set(ym, { startDate: monthStart, endDate: monthEnd, label: capName });
        }
      }
    }

    const sortedMonths = Array.from(monthsMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    for (const [ym, info] of sortedMonths) {
      const key = `${info.startDate}_${info.endDate}`;
      if (!seenRanges.has(key)) {
        seenRanges.add(key);
        options.push({
          id: `month_${ym}`,
          label: info.label,
          startDate: info.startDate,
          endDate: info.endDate,
          kind: 'month',
        });
      }
    }

    return options;
  }

  // date_to_date: previous billing cycles
  const nowRef = parseISO(`${todayStr}T12:00:00+05:00`);
  for (let offset = -1; offset >= -6; offset--) {
    const p = getStudentBillingPeriod(student.billing_day || '10', nowRef, offset);
    const hasLessons = allLessons.some((l) => {
      const d = getLessonDateStr(l);
      return d >= p.startDate && d <= p.endDate;
    });
    if (offset === -1 || hasLessons) {
      const key = `${p.startDate}_${p.endDate}`;
      if (!seenRanges.has(key)) {
        seenRanges.add(key);
        options.push({
          id: `cycle_${offset}`,
          label: `${p.startShort} – ${p.endShort}`,
          startDate: p.startDate,
          endDate: p.endDate,
          kind: 'billing_period',
        });
      }
    }
  }

  return options;
}
