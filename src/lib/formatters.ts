import { format, parseISO, startOfMonth, endOfMonth, isSameDay, addDays, subDays, addMonths, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';

// Tashkent is UTC+5 (300 minutes offset)
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Returns current Date in Tashkent time (UTC+5)
 */
export function getTashkentNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + TASHKENT_OFFSET_MS);
}

/**
 * Returns YYYY-MM-DD for Tashkent today
 */
export function getTashkentTodayStr(): string {
  return format(getTashkentNow(), 'yyyy-MM-dd');
}

/**
 * Returns list of Date objects for horizontal strip (e.g. 2 days in past, today, 12 days in future)
 */
export function getTashkentDateStrip(daysPast: number = 2, daysFuture: number = 14): Date[] {
  const today = getTashkentNow();
  const startDate = subDays(today, daysPast);
  const totalDays = daysPast + daysFuture + 1;
  return Array.from({ length: totalDays }).map((_, i) => addDays(startDate, i));
}

/**
 * Format date string to Tashkent readable date, e.g. "Сегодня, 23 сентября"
 */
export function formatTashkentHeaderDate(date: Date = getTashkentNow()): string {
  return format(date, 'd MMMM, EEEE', { locale: ru });
}

/**
 * Format day of week and day number for horizontal calendar chips
 */
export function formatCalendarChip(date: Date): { dayOfWeek: string; dayNumber: string; isToday: boolean } {
  const todayStr = getTashkentTodayStr();
  const dateStr = format(date, 'yyyy-MM-dd');
  return {
    dayOfWeek: format(date, 'EE', { locale: ru }),
    dayNumber: format(date, 'd'),
    isToday: dateStr === todayStr,
  };
}

/**
 * Check if an ISO date string matches a target date (YYYY-MM-DD) in Tashkent time
 */
export function isSameTashkentDate(isoDateString: string, targetDate: Date): boolean {
  try {
    const targetStr = format(targetDate, 'yyyy-MM-dd');
    return isoDateString.startsWith(targetStr);
  } catch {
    return false;
  }
}

/**
 * Check if an ISO date string matches Tashkent today
 */
export function isTashkentToday(isoDateString: string): boolean {
  try {
    const todayStr = getTashkentTodayStr();
    return isoDateString.startsWith(todayStr);
  } catch {
    return false;
  }
}

/**
 * Currency formatter: 2 400 000 UZS
 */
export function formatUZS(amount: number): string {
  if (isNaN(amount) || amount === undefined || amount === null) return '0 UZS';
  return `${Math.round(amount).toLocaleString('ru-RU')} UZS`;
}

/**
 * Format simple time (HH:mm)
 */
export function formatTimeSlot(start: string = '18:00', durationMin: number = 90): string {
  try {
    const [h, m] = start.split(':').map(Number);
    const endMinutes = h * 60 + m + durationMin;
    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)} - ${pad(endH)}:${pad(endM)}`;
  } catch {
    return start;
  }
}

/**
 * Format readable date with day of week: "12 сентября (Чт)"
 */
export function formatRuDateWithDay(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const raw = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
    const d = parseISO(raw);
    const dayName = format(d, 'EEE', { locale: ru });
    const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${format(d, 'd MMMM', { locale: ru })} (${capDay})`;
  } catch {
    return dateStr;
  }
}

/**
 * Generate recurring dates for student schedule (e.g. 8 lessons on Tue/Thu starting from 2026-09-10)
 */
export function generateStudentScheduleDates(
  startDateStr: string,
  daysOfWeek: number[], // 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat, 0 = Sun
  timeStr: string,
  count: number = 8
): { date: string; time_str: string }[] {
  const result: { date: string; time_str: string }[] = [];
  try {
    let curr = parseISO(startDateStr.includes('T') ? startDateStr.substring(0, 10) : startDateStr);
    let iterations = 0;

    while (result.length < count && iterations < 90) {
      const dayOfWeek = curr.getDay();
      if (daysOfWeek.includes(dayOfWeek)) {
        const dateStr = format(curr, 'yyyy-MM-dd');
        const startTime = timeStr.includes('-') ? timeStr.split('-')[0].trim() : timeStr || '18:00';
        result.push({
          date: `${dateStr}T${startTime}:00+05:00`,
          time_str: timeStr,
        });
      }
      curr = addDays(curr, 1);
      iterations++;
    }
  } catch (e) {
    console.error('generateStudentScheduleDates error:', e);
  }

  return result;
}

export interface StudentBillingPeriod {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startFormatted: string; // "10 сентября"
  endFormatted: string;   // "9 октября"
  nextBillingFormatted: string; // "10 октября"
  monthName: string; // "Сентябрь 2026"
  periodStartDateObj: Date;
  periodEndDateObj: Date;
}

/**
 * Calculates student's individual billing period based on billing day (e.g. 10th of each month)
 */
export function getStudentBillingPeriod(
  billingDayProp: number | string = 10,
  targetDate: Date = getTashkentNow(),
  monthOffset: number = 0
): StudentBillingPeriod {
  let billingDay = typeof billingDayProp === 'string' ? parseInt(billingDayProp, 10) : billingDayProp;
  if (isNaN(billingDay) || billingDay < 1 || billingDay > 31) {
    billingDay = 10;
  }

  let base = targetDate;
  if (monthOffset !== 0) {
    base = monthOffset > 0 ? addMonths(base, monthOffset) : subMonths(base, Math.abs(monthOffset));
  }

  const currentYear = base.getFullYear();
  const currentMonth = base.getMonth(); // 0-indexed
  const currentDay = base.getDate();

  let startYear = currentYear;
  let startMonth = currentMonth;

  if (currentDay < billingDay) {
    startMonth = currentMonth - 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear = currentYear - 1;
    }
  }

  const startDateObj = new Date(startYear, startMonth, billingDay);
  const nextMonthStart = addMonths(startDateObj, 1);
  const endDateObj = subDays(nextMonthStart, 1);

  return {
    startDate: format(startDateObj, 'yyyy-MM-dd'),
    endDate: format(endDateObj, 'yyyy-MM-dd'),
    startFormatted: format(startDateObj, 'd MMMM', { locale: ru }),
    endFormatted: format(endDateObj, 'd MMMM', { locale: ru }),
    nextBillingFormatted: format(nextMonthStart, 'd MMMM', { locale: ru }),
    monthName: format(startDateObj, 'LLLL yyyy', { locale: ru }),
    periodStartDateObj: startDateObj,
    periodEndDateObj: endDateObj,
  };
}
