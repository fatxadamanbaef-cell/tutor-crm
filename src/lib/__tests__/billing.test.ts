import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BillingCalculation, Student } from '@/types';
import { DEFAULT_SETTINGS, type TutorSettings } from '@/lib/settings';

const mockState = vi.hoisted(() => ({
  studentRow: null as Record<string, unknown> | null,
  lessonRow: null as Record<string, unknown> | null,
  lessonUpdateCalls: [] as Array<{ payload: Record<string, unknown>; id: string }>,
  rpcCalls: [] as Array<{ fn: string; params: Record<string, unknown> }>,
  rpcReturnBalance: 5,
}));

vi.mock('@/lib/supabase', () => {
  const createBuilder = (table: string) => {
    let isUpdate = false;
    let updatePayload: Record<string, unknown> = {};

    const builder = {
      select: () => builder,
      update: (payload: Record<string, unknown>) => {
        isUpdate = true;
        updatePayload = payload;
        return builder;
      },
      eq: (_col: string, val: string) => {
        if (isUpdate && table === 'tutor_lessons') {
          mockState.lessonUpdateCalls.push({ payload: updatePayload, id: val });
          return Promise.resolve({ data: null, error: null });
        }
        return builder;
      },
      single: () => {
        if (table === 'tutor_students') {
          return Promise.resolve({
            data: mockState.studentRow,
            error: mockState.studentRow ? null : { message: 'Not found' },
          });
        }
        if (table === 'tutor_lessons') {
          return Promise.resolve({
            data: mockState.lessonRow,
            error: mockState.lessonRow ? null : { message: 'Not found' },
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return builder;
  };

  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (table: string) => createBuilder(table),
      rpc: (fn: string, params: Record<string, unknown>) => {
        mockState.rpcCalls.push({ fn, params });
        return Promise.resolve({ data: mockState.rpcReturnBalance, error: null });
      },
    },
  };
});

import {
  parseTimeRange,
  isDeductedStatus,
  buildBillingPeriod,
  calculateStudentBilling,
  setLessonStatusDirect,
} from '@/lib/storage';
import { buildParentInvoiceMessage } from '@/lib/settings';

beforeEach(() => {
  mockState.studentRow = null;
  mockState.lessonRow = null;
  mockState.lessonUpdateCalls = [];
  mockState.rpcCalls = [];
  mockState.rpcReturnBalance = 5;
});

describe('parseTimeRange', () => {
  it('parses single start time using default duration (90m) or custom duration', () => {
    expect(parseTimeRange('16:00')).toEqual({ start: '16:00', end: '17:30' });
    expect(parseTimeRange('16:00', 60)).toEqual({ start: '16:00', end: '17:00' });
  });

  it('parses explicit range and dot separator and wraps midnight', () => {
    expect(parseTimeRange('14:30 - 16:00')).toEqual({ start: '14:30', end: '16:00' });
    expect(parseTimeRange('9.30')).toEqual({ start: '09:30', end: '11:00' });
    expect(parseTimeRange('23:00')).toEqual({ start: '23:00', end: '00:30' });
  });

  it('throws on invalid time strings', () => {
    expect(() => parseTimeRange('')).toThrow();
    expect(() => parseTimeRange('25:00')).toThrow();
    expect(() => parseTimeRange('12:75')).toThrow();
  });
});

describe('isDeductedStatus', () => {
  it('returns true only for deducted attendance states', () => {
    expect(isDeductedStatus('completed')).toBe(true);
    expect(isDeductedStatus('missed_penalty')).toBe(true);
    expect(isDeductedStatus('missed')).toBe(true);

    expect(isDeductedStatus('missed_excused')).toBe(false);
    expect(isDeductedStatus('planned')).toBe(false);
    expect(isDeductedStatus('scheduled')).toBe(false);
    expect(isDeductedStatus(null)).toBe(false);
    expect(isDeductedStatus(undefined)).toBe(false);
  });
});

describe('buildBillingPeriod', () => {
  it('handles same-month, previous-month, rollover, and month-length clamping', () => {
    expect(buildBillingPeriod(10, new Date(2026, 10, 23))).toEqual({
      startDate: '2026-11-10',
      endDate: '2026-12-09',
    });
    expect(buildBillingPeriod(10, new Date(2026, 10, 5))).toEqual({
      startDate: '2026-10-10',
      endDate: '2026-11-09',
    });
    expect(buildBillingPeriod(15, new Date(2026, 0, 5))).toEqual({
      startDate: '2025-12-15',
      endDate: '2026-01-14',
    });
    expect(buildBillingPeriod(31, new Date(2026, 1, 15))).toEqual({
      startDate: '2026-01-31',
      endDate: '2026-02-27',
    });
    expect(buildBillingPeriod(31, new Date(2026, 3, 10))).toEqual({
      startDate: '2026-03-31',
      endDate: '2026-04-29',
    });
  });
});

describe('calculateStudentBilling', () => {
  it('computes package billing accurately', async () => {
    mockState.studentRow = {
      id: 'st-pkg',
      name: 'Сахиб',
      billing_type: 'package',
      lesson_rate: 250000,
      lessons_balance: 3,
      monthly_target_lessons: 8,
      billing_day: '10',
      recurring_schedule: [],
    };

    const calc = await calculateStudentBilling('st-pkg');
    expect(calc.billingType).toBe('package');
    expect(calc.packageSize).toBe(8);
    expect(calc.packageAmount).toBe(2000000);
    expect(calc.lessonsBalance).toBe(3);
    expect(calc.summaryText).toContain('3 ур.');
  });

  it('computes date_to_date scheduled lessons, balance credits, and negative debt', async () => {
    // November 2026 has 13 Mon/Wed/Fri days (Nov 2,4,6,9,11,13,16,18,20,23,25,27,30)
    mockState.studentRow = {
      id: 'st-d2d',
      name: 'Алина',
      billing_type: 'date_to_date',
      lesson_rate: 300000,
      lessons_balance: 2,
      monthly_target_lessons: 12,
      billing_day: '10',
      recurring_schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 3, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 5, startTime: '16:00', endTime: '17:30' },
      ],
    };

    const withCredit = await calculateStudentBilling('st-d2d', '2026-11-01', '2026-11-30');
    expect(withCredit.scheduledLessonsCount).toBe(13);
    expect(withCredit.grossAmount).toBe(3900000);
    expect(withCredit.lessonsToPay).toBe(11);
    expect(withCredit.netAmount).toBe(3300000);

    // Excess positive balance clamps lessonsToPay to 0
    mockState.studentRow.lessons_balance = 50;
    const prePaid = await calculateStudentBilling('st-d2d', '2026-11-01', '2026-11-30');
    expect(prePaid.lessonsToPay).toBe(0);
    expect(prePaid.netAmount).toBe(0);

    // Negative balance increases lessonsToPay
    mockState.studentRow.lessons_balance = -2;
    const inDebt = await calculateStudentBilling('st-d2d', '2026-11-01', '2026-11-30');
    expect(inDebt.lessonsToPay).toBe(15);
    expect(inDebt.netAmount).toBe(4500000);
  });

  it('extracts day 15 instead of 31 when billing_day is an ISO date string', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T12:00:00+05:00'));
    try {
      mockState.studentRow = {
        id: 'st-iso',
        name: 'Тимур',
        billing_type: 'date_to_date',
        lesson_rate: 300000,
        lessons_balance: 0,
        monthly_target_lessons: 8,
        billing_day: '2026-11-15',
        recurring_schedule: [],
      };
      const calc = await calculateStudentBilling('st-iso');
      expect(calc.startDate).toBe('2026-11-15');
      expect(calc.endDate).toBe('2026-12-14');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('setLessonStatusDirect (3-state idempotent balance mutations)', () => {
  const makeLesson = (status: string, balance = 5) => ({
    id: 'lesson-1',
    student_id: 'student-1',
    status,
    tutor_students: { id: 'student-1', name: 'Аслан', lessons_balance: balance },
  });

  it('deducts -1 when transitioning planned -> completed', async () => {
    mockState.lessonRow = makeLesson('scheduled', 5);
    mockState.rpcReturnBalance = 4;

    const res = await setLessonStatusDirect('lesson-1', 'completed');
    expect(res.newBalance).toBe(4);
    expect(mockState.rpcCalls).toEqual([
      { fn: 'increment_lessons_balance', params: { p_student_id: 'student-1', p_delta: -1 } },
    ]);
  });

  it('does NOT double-deduct on completed -> completed or completed -> missed_penalty', async () => {
    mockState.lessonRow = makeLesson('completed', 4);
    await setLessonStatusDirect('lesson-1', 'completed');
    expect(mockState.rpcCalls).toHaveLength(0);

    await setLessonStatusDirect('lesson-1', 'missed_penalty');
    expect(mockState.rpcCalls).toHaveLength(0);
  });

  it('refunds +1 when transitioning completed -> missed_excused or missed_penalty -> planned', async () => {
    mockState.lessonRow = makeLesson('completed', 4);
    mockState.rpcReturnBalance = 5;
    const res1 = await setLessonStatusDirect('lesson-1', 'missed_excused');
    expect(res1.newBalance).toBe(5);

    mockState.lessonRow = makeLesson('missed_penalty', 4);
    const res2 = await setLessonStatusDirect('lesson-1', 'planned');
    expect(res2.newBalance).toBe(5);

    expect(mockState.rpcCalls).toEqual([
      { fn: 'increment_lessons_balance', params: { p_student_id: 'student-1', p_delta: 1 } },
      { fn: 'increment_lessons_balance', params: { p_student_id: 'student-1', p_delta: 1 } },
    ]);
  });

  it('does NOT change balance on missed_excused -> planned', async () => {
    mockState.lessonRow = makeLesson('missed_excused', 5);
    const res = await setLessonStatusDirect('lesson-1', 'planned');
    expect(res.newBalance).toBe(5);
    expect(mockState.rpcCalls).toHaveLength(0);
  });
});

describe('buildParentInvoiceMessage', () => {
  const baseStudent: Pick<
    Student,
    'name' | 'lesson_rate' | 'lessons_balance' | 'monthly_target_lessons'
  > = {
    name: 'Аслан',
    lesson_rate: 300000,
    lessons_balance: 2,
    monthly_target_lessons: 8,
  };

  it('includes card requisites and package summary', () => {
    const calc: BillingCalculation = {
      studentId: '1',
      studentName: 'Аслан',
      billingType: 'package',
      lessonRate: 300000,
      lessonsBalance: 2,
      packageSize: 8,
      packageAmount: 2400000,
      summaryText: '',
    };
    const settings: TutorSettings = {
      ...DEFAULT_SETTINGS,
      tutorName: 'Фархад',
      bankName: 'Uzcard',
      cardNumber: '8600 1234 5678 9012',
      cardHolder: 'Farkhad',
    };

    const msg = buildParentInvoiceMessage(baseStudent, calc, settings);
    expect(msg).toContain('Абонемент: 8 уроков');
    expect(msg).toContain('8600 1234 5678 9012');
    expect(msg).toContain('Получатель: Farkhad');
    expect(msg).not.toContain('Задолженность');
  });

  it('adds debt line when package balance is negative and omits card block if empty', () => {
    const calc: BillingCalculation = {
      studentId: '1',
      studentName: 'Аслан',
      billingType: 'package',
      lessonRate: 300000,
      lessonsBalance: -2,
      packageSize: 8,
      packageAmount: 2400000,
      summaryText: '',
    };
    const msg = buildParentInvoiceMessage(
      { ...baseStudent, lessons_balance: -2 },
      calc,
      { ...DEFAULT_SETTINGS, cardNumber: '' }
    );
    expect(msg).toContain('Задолженность за 2 ур.');
    expect(msg).not.toContain('Реквизиты для оплаты');
  });

  it('formats date_to_date period dates and net amount', () => {
    const calc: BillingCalculation = {
      studentId: '1',
      studentName: 'Аслан',
      billingType: 'date_to_date',
      lessonRate: 300000,
      lessonsBalance: 1,
      startDate: '2026-11-10',
      endDate: '2026-12-09',
      scheduledLessonsCount: 12,
      grossAmount: 3600000,
      lessonsToPay: 11,
      netAmount: 3300000,
      summaryText: '',
    };
    const msg = buildParentInvoiceMessage(baseStudent, calc, DEFAULT_SETTINGS);
    expect(msg).toContain('10.11.2026 – 09.12.2026');
    expect(msg).toContain('К оплате: 11 ур.');
  });
});
