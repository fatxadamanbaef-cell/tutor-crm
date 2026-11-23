import { describe, it, expect } from 'vitest';
import type { Student } from '@/types';
import { normName, resolveStudent, findExistingByName } from '@/lib/nameMatch';

function makeStudent(id: string, name: string): Student {
  return {
    id,
    name,
    monthly_target_lessons: 12,
    billing_type: 'date_to_date',
    lesson_rate: 300000,
    lessons_balance: 0,
    created_at: '2026-01-01T00:00:00Z',
  };
}

const students: Student[] = [
  makeStudent('1', 'Сахиб'),
  makeStudent('2', 'Алина 10 класс'),
  makeStudent('3', 'Аслан'),
  makeStudent('4', 'Тимур И.'),
  makeStudent('5', 'Тимур А.'),
];

describe('normName', () => {
  it('lowercases, replaces ё with е, and strips punctuation', () => {
    expect(normName('  Артём-К. (11)  ')).toBe('артем к 11');
  });
});

describe('resolveStudent', () => {
  it('matches exact names and unique substrings', () => {
    const exact = resolveStudent('Сахиб', students);
    expect(exact).toEqual({ ok: true, student: students[0] });

    const sub = resolveStudent('Алина', students);
    expect(sub).toEqual({ ok: true, student: students[1] });
  });

  it('handles Whisper phonetic typos', () => {
    const res = resolveStudent('Сахип', students);
    expect(res).toEqual({ ok: true, student: students[0] });
  });

  it('returns an explicit ambiguity error when multiple students match', () => {
    const res = resolveStudent('Тимур', students);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('Тимур И.');
      expect(res.error).toContain('Тимур А.');
    }
  });

  it('returns not-found error when no student matches', () => {
    const res = resolveStudent('Неизвестный', students);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('не найден');
    }
  });
});

describe('findExistingByName', () => {
  it('detects exact and phonetic duplicates', () => {
    expect(findExistingByName('Сахип', students)?.id).toBe('1');
    expect(findExistingByName('АСЛАН', students)?.id).toBe('3');
    expect(findExistingByName('Давид', students)).toBeNull();
  });
});
