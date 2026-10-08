import type { Student } from '@/types';

/**
 * Приведение имени к виду для сравнения: нижний регистр, ё→е, без пунктуации.
 */
export function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Whisper часто путает парные согласные и мягкие/твёрдые знаки ("Сахиб" → "Сахип").
const PHON_MAP: Record<string, string> = {
  б: 'п', д: 'т', г: 'к', в: 'ф', з: 'с', ж: 'ш', щ: 'ш', ы: 'и', й: 'и', э: 'е', ъ: '', ь: '',
};

function phon(s: string): string {
  return normName(s)
    .split('')
    .map((c) => (c in PHON_MAP ? PHON_MAP[c] : c))
    .join('')
    .replace(/(.)\1+/g, '$1'); // двойные буквы → одна
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

export type ResolveResult =
  | { ok: true; student: Student }
  | { ok: false; error: string };

/**
 * Находит ученика по имени, надёжно: точное совпадение → вхождение → фонетическое/нечёткое.
 * Никогда не выбирает "наугад": при неоднозначности возвращает ошибку со списком кандидатов.
 */
export function resolveStudent(query: string, students: Student[]): ResolveResult {
  const q = normName(query);
  if (!q) return { ok: false, error: 'Не указано имя ученика.' };

  const all = students.map((s) => s.name).join(', ') || 'нет учеников';

  // 1. Точное совпадение
  const exact = students.filter((s) => normName(s.name) === q);
  if (exact.length === 1) return { ok: true, student: exact[0] };
  if (exact.length > 1) {
    return { ok: false, error: `Несколько учеников с именем "${query}": ${exact.map((s) => s.name).join(', ')}. Уточните.` };
  }

  // 2. Вхождение (запрос — часть имени, например "Мадина 11")
  const contains = students.filter((s) => normName(s.name).includes(q));
  if (contains.length === 1) return { ok: true, student: contains[0] };
  if (contains.length > 1) {
    return { ok: false, error: `Под "${query}" подходит несколько учеников: ${contains.map((s) => s.name).join(', ')}. Уточните, кого именно.` };
  }

  // 3. Фонетическое / нечёткое совпадение
  const p = phon(q);
  const scored = students
    .map((s) => {
      const full = phon(s.name);
      const firstToken = full.split(' ')[0];
      const qFirst = p.split(' ')[0];
      const dist = Math.min(levenshtein(full, p), levenshtein(firstToken, qFirst));
      return { s, dist };
    })
    .sort((a, b) => a.dist - b.dist);

  const limit = p.length >= 7 ? 2 : p.length >= 4 ? 1 : 0;
  const best = scored[0];
  if (best && best.dist <= limit) {
    const ties = scored.filter((x) => x.dist === best.dist);
    if (ties.length === 1) return { ok: true, student: best.s };
    return { ok: false, error: `Под "${query}" подходят несколько учеников: ${ties.map((t) => t.s.name).join(', ')}. Уточните.` };
  }

  return { ok: false, error: `Ученик "${query}" не найден. Ученики в CRM: ${all}.` };
}

/**
 * Проверяет, есть ли уже ученик с таким именем (с учётом фонетических искажений),
 * чтобы не создавать дубликаты.
 */
export function findExistingByName(name: string, students: Student[]): Student | null {
  const q = normName(name);
  const p = phon(name);
  return students.find((s) => normName(s.name) === q || phon(s.name) === p) || null;
}
