import { describe, it, expect } from 'vitest';
import {
  getTashkentDateString,
  extractBillingDayNumber,
  getStudentBillingPeriod,
  dayOfWeekOf,
  addDaysStr,
  formatTimeSlot,
  isRealNote,
  generateStudentScheduleDates,
} from '@/lib/formatters';

describe('getTashkentDateString', () => {
  it('passes through YYYY-MM-DD strings unchanged', () => {
    expect(getTashkentDateString('2026-11-23')).toBe('2026-11-23');
  });

  it('keeps +05:00 ISO timestamps on the same Tashkent calendar day', () => {
    expect(getTashkentDateString('2026-11-23T00:30:00+05:00')).toBe('2026-11-23');
    expect(getTashkentDateString('2026-11-23T23:59:59+05:00')).toBe('2026-11-23');
  });

  it('converts UTC Z timestamps across midnight into UTC+5 (Asia/Tashkent)', () => {
    // 20:30 UTC == 01:30 (+05:00) next day
    expect(getTashkentDateString('2026-11-23T20:30:00Z')).toBe('2026-11-24');
    // 18:59:59 UTC == 23:59:59 (+05:00) same day
    expect(getTashkentDateString('2026-11-23T18:59:59Z')).toBe('2026-11-23');
  });
});

describe('extractBillingDayNumber', () => {
  it('handles numbers and clamps to [1, 31]', () => {
    expect(extractBillingDayNumber(15)).toBe(15);
    expect(extractBillingDayNumber(0)).toBe(1);
    expect(extractBillingDayNumber(45)).toBe(31);
  });

  it('extracts day from text, ISO dates, and dot dates', () => {
    expect(extractBillingDayNumber('15')).toBe(15);
    expect(extractBillingDayNumber('15 число')).toBe(15);
    expect(extractBillingDayNumber('с 5 числа')).toBe(5);
    expect(extractBillingDayNumber('2026-11-15')).toBe(15);
    expect(extractBillingDayNumber('15.11')).toBe(15);
  });

  it('falls back to 10 on empty or null input', () => {
    expect(extractBillingDayNumber('')).toBe(10);
    expect(extractBillingDayNumber(null)).toBe(10);
    expect(extractBillingDayNumber(undefined)).toBe(10);
  });
});

describe('getStudentBillingPeriod', () => {
  it('computes period starting this month when currentDay >= billingDay', () => {
    const period = getStudentBillingPeriod('10', new Date(2026, 10, 23));
    expect(period.billingDay).toBe(10);
    expect(period.startDate).toBe('2026-11-10');
    expect(period.endDate).toBe('2026-12-09');
  });

  it('computes period starting previous month when currentDay < billingDay', () => {
    const period = getStudentBillingPeriod('10', new Date(2026, 10, 5));
    expect(period.startDate).toBe('2026-10-10');
    expect(period.endDate).toBe('2026-11-09');
  });

  it('handles December -> January year rollover', () => {
    const period = getStudentBillingPeriod(15, new Date(2026, 0, 5));
    expect(period.startDate).toBe('2025-12-15');
    expect(period.endDate).toBe('2026-01-14');
  });

  it('clamps billingDay=31 in February for non-leap and leap years', () => {
    const feb2026 = getStudentBillingPeriod(31, new Date(2026, 1, 15));
    expect(feb2026.startDate).toBe('2026-01-31');
    expect(feb2026.endDate).toBe('2026-02-27');

    const mar2024 = getStudentBillingPeriod(31, new Date(2024, 2, 15));
    expect(mar2024.startDate).toBe('2024-02-29');
    expect(mar2024.endDate).toBe('2024-03-30');
  });

  it('supports monthOffset -1 and +1', () => {
    const prev = getStudentBillingPeriod(10, new Date(2026, 10, 23), -1);
    expect(prev.startDate).toBe('2026-10-10');
    expect(prev.endDate).toBe('2026-11-09');

    const next = getStudentBillingPeriod(10, new Date(2026, 10, 23), 1);
    expect(next.startDate).toBe('2026-12-10');
    expect(next.endDate).toBe('2027-01-09');
  });
});

describe('dayOfWeekOf & addDaysStr', () => {
  it('returns ISO weekday 1 (Mon) .. 7 (Sun)', () => {
    expect(dayOfWeekOf('2026-11-23')).toBe(1); // Monday
    expect(dayOfWeekOf('2026-11-28')).toBe(6); // Saturday
    expect(dayOfWeekOf('2026-11-29')).toBe(7); // Sunday
  });

  it('shifts dates across months, years, and leap days', () => {
    expect(addDaysStr('2026-11-28', 4)).toBe('2026-12-02');
    expect(addDaysStr('2026-01-02', -3)).toBe('2025-12-30');
    expect(addDaysStr('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('formatTimeSlot & isRealNote', () => {
  it('formats time slot and wraps past midnight', () => {
    expect(formatTimeSlot('18:00', 90)).toBe('18:00 - 19:30');
    expect(formatTimeSlot('23:00', 90)).toBe('23:00 - 00:30');
  });

  it('distinguishes auto-generated placeholders from real homework notes', () => {
    expect(isRealNote('')).toBe(false);
    expect(isRealNote('   ')).toBe(false);
    expect(isRealNote(null)).toBe(false);
    expect(isRealNote('Периодическое расписание')).toBe(false);
    expect(isRealNote('Запланированный урок')).toBe(false);
    expect(isRealNote('Регулярный урок (Пн)')).toBe(false);
    expect(isRealNote('Авто-слот 18:00')).toBe(false);
    expect(isRealNote('Разобрали Present Perfect, ДЗ стр. 42')).toBe(true);
  });
});

describe('generateStudentScheduleDates', () => {
  it('generates exact count of slots matching weekdays with +05:00 offset', () => {
    // 2026-11-23 is Monday (1). Request Tue (2) and Thu (4), count 4
    const slots = generateStudentScheduleDates('2026-11-23', [2, 4], '16:00 - 17:30', 4);
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ date: '2026-11-24T16:00:00+05:00', time_str: '16:00 - 17:30' });
    expect(slots[1]).toEqual({ date: '2026-11-26T16:00:00+05:00', time_str: '16:00 - 17:30' });
    expect(slots[2]).toEqual({ date: '2026-12-01T16:00:00+05:00', time_str: '16:00 - 17:30' });
    expect(slots[3]).toEqual({ date: '2026-12-03T16:00:00+05:00', time_str: '16:00 - 17:30' });
  });
});
