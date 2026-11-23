import { describe, it, expect } from 'vitest';
import type { Lesson, Payment } from '@/types';
import {
  computeStudentCycleSummary,
  buildArchivePeriods,
  type CycleStudentInput,
} from '@/lib/packageCycle';

function makeLesson(
  id: string,
  date: string,
  status: Lesson['status'],
  options?: { time_str?: string; needs_makeup?: boolean; student_id?: string }
): Lesson {
  const timeStr = options?.time_str ?? '14:00 - 16:00';
  const start = timeStr.split(' - ')[0];
  return {
    id,
    student_id: options?.student_id ?? 'adelya-1',
    student_name: 'Аделя 5 класс',
    date: `${date}T${start}:00+05:00`,
    time_str: timeStr,
    status,
    needs_makeup: options?.needs_makeup ?? false,
    created_at: `${date}T08:00:00Z`,
  };
}

describe('computeStudentCycleSummary', () => {
  it('handles Adelya exact regression scenario without resetting on Nov 23', () => {
    const adelya: CycleStudentInput = {
      id: 'adelya-1',
      billing_type: 'package',
      billing_day: '23',
      monthly_target_lessons: 26,
      lessons_balance: 4,
      recurring_schedule: [
        { dayOfWeek: 1, startTime: '14:00', endTime: '16:00' },
        { dayOfWeek: 2, startTime: '14:00', endTime: '16:00' },
        { dayOfWeek: 3, startTime: '14:00', endTime: '16:00' },
        { dayOfWeek: 4, startTime: '14:00', endTime: '16:00' },
        { dayOfWeek: 5, startTime: '14:00', endTime: '16:00' },
        { dayOfWeek: 6, startTime: '14:00', endTime: '16:00' },
      ],
    };

    // 22 completed lessons from Oct 23 through Nov 23 + 3 missed_excused
    const pastDatesCompleted = [
      '2026-10-23', '2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28',
      '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-02', '2026-11-03',
      '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-12',
      '2026-11-13', '2026-11-14', '2026-11-16', '2026-11-17', '2026-11-18',
      '2026-11-21', '2026-11-23',
    ];
    const excusedDates = ['2026-11-09', '2026-11-10', '2026-11-19'];
    const futurePlannedDates = [
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
    ];

    const lessons: Lesson[] = [
      ...pastDatesCompleted.map((d, i) => makeLesson(`c-${i}`, d, 'completed')),
      ...excusedDates.map((d, i) => makeLesson(`e-${i}`, d, 'missed_excused')),
      ...futurePlannedDates.map((d, i) => makeLesson(`p-${i}`, d, 'planned')),
    ];

    const summary = computeStudentCycleSummary(adelya, lessons, '2026-11-23');

    expect(summary.mode).toBe('package');
    expect(summary.startDate).toBe('2026-10-23');
    expect(summary.usedLessons).toBe(22);
    expect(summary.completedLessons).toBe(22);
    expect(summary.penaltyLessons).toBe(0);
    expect(summary.excusedLessons).toBe(3);
    expect(summary.remainingLessons).toBe(4);
    expect(summary.totalLessons).toBe(26);
    expect(summary.progressPct).toBe(85);
    expect(summary.isExhausted).toBe(false);
    expect(summary.estimatedEndDate).toBe('2026-11-27');
    expect(summary.plannedSlotNumbers['p-0']).toEqual({ index: 23, total: 26, isFinal: false });
    expect(summary.plannedSlotNumbers['p-3']).toEqual({ index: 26, total: 26, isFinal: true });
    expect(summary.plannedSlotNumbers['p-4']).toBeUndefined();
  });

  it('tracks explicit ISO package across month boundary, counts penalty, excludes excused', () => {
    const student: CycleStudentInput = {
      id: 'st-iso',
      billing_type: 'package',
      billing_day: '2026-10-25',
      monthly_target_lessons: 8,
      lessons_balance: 3,
      recurring_schedule: [{ dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }],
    };

    const lessons: Lesson[] = [
      makeLesson('old', '2026-10-20', 'completed'), // before package start
      makeLesson('l1', '2026-10-26', 'completed'),
      makeLesson('l2', '2026-11-02', 'missed_penalty'),
      makeLesson('l3', '2026-11-09', 'missed_excused'),
      makeLesson('l4', '2026-11-16', 'completed'),
      makeLesson('l5', '2026-11-20', 'completed'),
      makeLesson('l6', '2026-11-23', 'completed'),
      makeLesson('f1', '2026-11-30', 'planned'),
      makeLesson('f2', '2026-12-07', 'planned'),
      makeLesson('f3', '2026-12-14', 'planned'),
    ];

    const summary = computeStudentCycleSummary(student, lessons, '2026-11-23');
    expect(summary.isStartDateExplicit).toBe(true);
    expect(summary.startDate).toBe('2026-10-25');
    expect(summary.completedLessons).toBe(4);
    expect(summary.penaltyLessons).toBe(1);
    expect(summary.usedLessons).toBe(5);
    expect(summary.excusedLessons).toBe(1);
    expect(summary.remainingLessons).toBe(3);
    expect(summary.estimatedEndDate).toBe('2026-12-14');
    // Lesson before start date should not be in cycleLessons
    expect(summary.cycleLessons.some((l) => l.id === 'old')).toBe(false);
  });

  it('handles early prepayment while current package is still open, and after closing', () => {
    const baseStudent: CycleStudentInput = {
      id: 'st-prepay',
      billing_type: 'package',
      billing_day: '2026-10-23',
      monthly_target_lessons: 26,
      lessons_balance: 30, // 4 left in old + 26 prepaid for next
      recurring_schedule: [],
    };

    const completed22 = Array.from({ length: 22 }, (_, i) =>
      makeLesson(`c-${i}`, `2026-11-${String(i + 1).padStart(2, '0')}`, 'completed')
    );

    const openSummary = computeStudentCycleSummary(baseStudent, completed22, '2026-11-23');
    expect(openSummary.usedLessons).toBe(22);
    expect(openSummary.remainingLessons).toBe(4);
    expect(openSummary.prepaidExtraLessons).toBe(26);
    expect(openSummary.isExhausted).toBe(false);

    // After finishing the remaining 4 lessons: used = 26, balance = 26
    const completed26 = [
      ...completed22,
      makeLesson('c-22', '2026-11-24', 'completed'),
      makeLesson('c-23', '2026-11-25', 'completed'),
      makeLesson('c-24', '2026-11-26', 'completed'),
      makeLesson('c-25', '2026-11-27', 'completed'),
    ];
    const closedSummary = computeStudentCycleSummary(
      { ...baseStudent, lessons_balance: 26 },
      completed26,
      '2026-11-27'
    );
    expect(closedSummary.usedLessons).toBe(26);
    expect(closedSummary.remainingLessons).toBe(0);
    expect(closedSummary.prepaidExtraLessons).toBe(26);
    expect(closedSummary.isExhausted).toBe(true);
  });

  it('handles exhausted and negative balance debt packages', () => {
    const student: CycleStudentInput = {
      id: 'st-debt',
      billing_type: 'package',
      billing_day: '2026-11-01',
      monthly_target_lessons: 8,
      lessons_balance: -2,
      recurring_schedule: [],
    };
    const lessons = Array.from({ length: 10 }, (_, i) =>
      makeLesson(`d-${i}`, `2026-11-${String(i + 1).padStart(2, '0')}`, 'completed')
    );

    const summary = computeStudentCycleSummary(student, lessons, '2026-11-23');
    expect(summary.isExhausted).toBe(true);
    expect(summary.remainingLessons).toBe(0);
    expect(summary.debtLessons).toBe(2);
    expect(summary.progressPct).toBe(100);
  });

  it('projects estimatedEndDate from recurring_schedule when DB has fewer planned rows', () => {
    const student: CycleStudentInput = {
      id: 'st-proj',
      billing_type: 'package',
      billing_day: '2026-11-01',
      monthly_target_lessons: 8,
      lessons_balance: 4,
      recurring_schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' }, // Mon
        { dayOfWeek: 3, startTime: '16:00', endTime: '17:30' }, // Wed
      ],
    };

    const lessons: Lesson[] = [
      makeLesson('c1', '2026-11-02', 'completed'),
      makeLesson('c2', '2026-11-04', 'completed'),
      makeLesson('c3', '2026-11-09', 'completed'),
      makeLesson('c4', '2026-11-11', 'completed'),
      // Only 1 planned row in DB (Mon Nov 23), need 3 more (Wed Nov 25, Mon Nov 30, Wed Dec 2)
      makeLesson('p1', '2026-11-23', 'planned'),
    ];

    const summary = computeStudentCycleSummary(student, lessons, '2026-11-23');
    expect(summary.remainingLessons).toBe(4);
    expect(summary.estimatedEndDate).toBe('2026-12-02');
  });

  it('computes date_to_date cycle strictly from billing_day period', () => {
    const student: CycleStudentInput = {
      id: 'st-d2d',
      billing_type: 'date_to_date',
      billing_day: '10',
      monthly_target_lessons: 12,
      lessons_balance: 5,
      recurring_schedule: [
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 3, startTime: '16:00', endTime: '17:30' },
        { dayOfWeek: 5, startTime: '16:00', endTime: '17:30' },
      ],
    };

    // Period for billing_day=10 on 2026-11-23 is 2026-11-10 .. 2026-12-09 (13 Mon/Wed/Fri)
    const lessons: Lesson[] = [
      makeLesson('prev', '2026-11-09', 'completed'), // previous cycle
      makeLesson('cur1', '2026-11-11', 'completed'),
      makeLesson('cur2', '2026-11-13', 'missed_penalty'),
      makeLesson('cur3', '2026-11-16', 'missed_excused'),
      makeLesson('cur4', '2026-11-25', 'planned'),
    ];

    const summary = computeStudentCycleSummary(student, lessons, '2026-11-23');
    expect(summary.mode).toBe('date_to_date');
    expect(summary.startDate).toBe('2026-11-10');
    expect(summary.endDate).toBe('2026-12-09');
    expect(summary.totalLessons).toBe(13);
    expect(summary.usedLessons).toBe(2);
    expect(summary.completedLessons).toBe(1);
    expect(summary.penaltyLessons).toBe(1);
    expect(summary.excusedLessons).toBe(1);
    expect(summary.cycleLessons.some((l) => l.id === 'prev')).toBe(false);
  });
});

describe('buildArchivePeriods', () => {
  it('builds past package slices from payments and monthly buckets before current cycle', () => {
    const student: CycleStudentInput = {
      id: 'adelya-1',
      billing_type: 'package',
      billing_day: '2026-10-23',
      monthly_target_lessons: 26,
      lessons_balance: 4,
      recurring_schedule: [],
    };

    const payments: Payment[] = [
      {
        id: 'pay-cur',
        student_id: 'adelya-1',
        amount_uzs: 11700000,
        lessons_added: 26,
        payment_method: 'payme',
        paid_at: '2026-10-23T10:00:00+05:00',
        created_at: '2026-10-23T10:00:00Z',
      },
      {
        id: 'pay-old',
        student_id: 'adelya-1',
        amount_uzs: 11700000,
        lessons_added: 26,
        payment_method: 'payme',
        paid_at: '2026-09-23T10:00:00+05:00',
        created_at: '2026-09-23T10:00:00Z',
      },
    ];

    const lessons: Lesson[] = [
      makeLesson('aug', '2026-08-25', 'completed'),
      makeLesson('sep', '2026-09-24', 'completed'),
      makeLesson('oct-cur', '2026-10-23', 'completed'),
    ];

    const archive = buildArchivePeriods(student, lessons, payments, '2026-10-23', '2026-11-23');
    expect(archive.some((a) => a.kind === 'payment' && a.startDate === '2026-09-23' && a.endDate === '2026-10-22')).toBe(true);
    expect(archive.some((a) => a.kind === 'month' && a.startDate === '2026-08-01')).toBe(true);
  });
});
