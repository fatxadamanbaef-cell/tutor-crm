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
 * Returns YYYY-MM-DD string strictly in Asia/Tashkent (UTC+5) timezone.
 * Accepts Date object, ISO string, or defaults to current Tashkent time.
 */
export function getTashkentDateString(input?: Date | string | null): string {
  if (!input) {
    return format(getTashkentNow(), 'yyyy-MM-dd');
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && !trimmed.endsWith('Z')) {
      return trimmed.substring(0, 10);
    }
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return format(getTashkentNow(), 'yyyy-MM-dd');
    return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().substring(0, 10);
  }
  return format(input, 'yyyy-MM-dd');
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
  billingDay: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startFormatted: string; // "10 сентября"
  endFormatted: string;   // "9 октября"
  startShort: string;     // "10 сен"
  endShort: string;       // "9 окт"
  nextBillingFormatted: string; // "10 октября"
  monthName: string; // "Сентябрь 2026"
  periodStartDateObj: Date;
  periodEndDateObj: Date;
}

/**
 * Safely extracts day of month (1..31) from any billing_day string or number
 * (e.g. "15", "15 число", "с 15 числа", "2026-11-15", "15.11")
 */
export function extractBillingDayNumber(billingDayProp?: number | string | null): number {
  if (typeof billingDayProp === 'number' && !isNaN(billingDayProp)) {
    return Math.min(31, Math.max(1, Math.round(billingDayProp)));
  }
  const str = String(billingDayProp || '').trim();
  if (!str) return 10;

  // Check YYYY-MM-DD format first
  const isoMatch = str.match(/^\d{4}-\d{2}-(\d{1,2})/);
  if (isoMatch) {
    const d = parseInt(isoMatch[1], 10);
    if (d >= 1 && d <= 31) return d;
  }

  // Otherwise extract first number
  const numMatch = str.match(/\d+/);
  if (numMatch) {
    const d = parseInt(numMatch[0], 10);
    if (d >= 1 && d <= 31) return d;
  }
  return 10;
}

/**
 * Calculates student's individual billing period based on billing day (e.g. 15th of each month -> 15 Nov to 14 Dec)
 */
export function getStudentBillingPeriod(
  billingDayProp: number | string = 10,
  targetDate: Date = getTashkentNow(),
  monthOffset: number = 0
): StudentBillingPeriod {
  const billingDay = extractBillingDayNumber(billingDayProp);

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

  const clampedStartDay = Math.min(billingDay, new Date(startYear, startMonth + 1, 0).getDate());
  const startDateObj = new Date(startYear, startMonth, clampedStartDay);
  const nextMonth = startMonth + 1 > 11 ? 0 : startMonth + 1;
  const nextYear = startMonth + 1 > 11 ? startYear + 1 : startYear;
  const clampedNextDay = Math.min(billingDay, new Date(nextYear, nextMonth + 1, 0).getDate());
  const nextMonthStart = new Date(nextYear, nextMonth, clampedNextDay);
  const endDateObj = subDays(nextMonthStart, 1);

  return {
    billingDay,
    startDate: format(startDateObj, 'yyyy-MM-dd'),
    endDate: format(endDateObj, 'yyyy-MM-dd'),
    startFormatted: format(startDateObj, 'd MMMM', { locale: ru }),
    endFormatted: format(endDateObj, 'd MMMM', { locale: ru }),
    startShort: format(startDateObj, 'd MMM', { locale: ru }).replace('.', ''),
    endShort: format(endDateObj, 'd MMM', { locale: ru }).replace('.', ''),
    nextBillingFormatted: format(nextMonthStart, 'd MMMM', { locale: ru }),
    monthName: format(startDateObj, 'LLLL yyyy', { locale: ru }),
    periodStartDateObj: startDateObj,
    periodEndDateObj: endDateObj,
  };
}

/**
 * Returns ISO day of week: 1 (Mon) .. 7 (Sun) strictly in Asia/Tashkent (UTC+5)
 */
export function dayOfWeekOf(dateStr: string): number {
  const cleanDate = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
  const [y, m, d] = cleanDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/**
 * Adds n days to a date string strictly in Asia/Tashkent (UTC+5) and returns YYYY-MM-DD
 */
export function addDaysStr(dateStr: string, n: number): string {
  const cleanDate = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
  const [y, m, d] = cleanDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().substring(0, 10);
}

// 1-indexed weekday names matching dayOfWeekOf (1=Mon .. 7=Sun)
export const WD_SHORT = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
export const WD_FULL = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

/**
 * Returns true if lesson notes contain real user-entered text rather than auto-generated placeholders.
 */
export function isRealNote(notes?: string | null): boolean {
  if (!notes) return false;
  const trimmed = notes.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'периодическое расписание' ||
    lower === 'запланированный урок' ||
    lower.startsWith('регулярный урок') ||
    lower.startsWith('авто-слот')
  ) {
    return false;
  }
  return true;
}
