import { supabase } from './supabase';
import { generateUUID } from './uuid';

/**
 * Серверное состояние бота (без миграций БД):
 *  - processed: id уже обработанных Telegram-апдейтов (защита от повторной доставки / дублей),
 *  - history: короткая память диалога с ИИ (чтобы "да", "а по датам?" работали).
 *
 * Хранится в служебной строке `_BOT_STATE` таблицы tutor_students:
 *   notes                     — JSON состояния
 *   package_remaining_lessons — счётчик версии для атомарной записи (compare-and-swap)
 */
const STATE_NAME = '_BOT_STATE';
const MAX_PROCESSED = 60;
const MAX_HISTORY = 8;
const HISTORY_TTL_MS = 30 * 60 * 1000;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface BotState {
  processed: number[];
  history: HistoryMessage[];
}

interface StateRow {
  id: string;
  version: number;
  state: BotState;
}

function emptyState(): BotState {
  return { processed: [], history: [] };
}

function parseState(raw: unknown): BotState {
  if (typeof raw !== 'string' || !raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    return {
      processed: Array.isArray(parsed.processed) ? parsed.processed : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return emptyState();
  }
}

async function loadRow(): Promise<StateRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('tutor_students')
    .select('id, notes, package_remaining_lessons')
    .eq('name', STATE_NAME)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;

  if (data && data.length > 0) {
    return {
      id: data[0].id,
      version: Number(data[0].package_remaining_lessons) || 0,
      state: parseState(data[0].notes),
    };
  }

  const id = generateUUID();
  const { error: insErr } = await supabase.from('tutor_students').insert([
    {
      id,
      name: STATE_NAME,
      notes: JSON.stringify(emptyState()),
      price_per_lesson: 0,
      package_remaining_lessons: 0,
      package_total_lessons: 0,
      is_active: false,
    },
  ]);
  if (insErr) throw insErr;
  // перечитываем: при гонке могли создаться две строки — берём самую раннюю
  return loadRow();
}

/**
 * Атомарно меняет состояние. fn возвращает новое состояние или null (ничего не менять).
 * Возвращает true, если запись удалась.
 */
async function mutateState(fn: (s: BotState) => BotState | null): Promise<boolean> {
  if (!supabase) return false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await loadRow();
    if (!row) return false;
    const next = fn(row.state);
    if (!next) return false;

    const { data, error } = await supabase
      .from('tutor_students')
      .update({ notes: JSON.stringify(next), package_remaining_lessons: row.version + 1 })
      .eq('id', row.id)
      .eq('package_remaining_lessons', row.version)
      .select('id');

    if (error) throw error;
    if (data && data.length === 1) return true;
    // кто-то изменил состояние одновременно — повторяем
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
  }
  return false;
}

/**
 * Захватывает апдейт Telegram. Возвращает false, если он уже обрабатывался/обрабатывается
 * (повторная доставка вебхука) — такой апдейт нужно проигнорировать.
 * При сбое хранилища "fail open": лучше обработать, чем потерять команду.
 */
export async function claimUpdate(updateId: number): Promise<boolean> {
  try {
    let duplicate = false;
    await mutateState((s) => {
      if (s.processed.includes(updateId)) {
        duplicate = true;
        return null;
      }
      return { ...s, processed: [...s.processed, updateId].slice(-MAX_PROCESSED) };
    });
    return !duplicate;
  } catch (e) {
    console.error('claimUpdate failed (fail open):', e);
    return true;
  }
}

export async function getHistory(): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    const row = await loadRow();
    if (!row) return [];
    const now = Date.now();
    return row.state.history
      .filter((m) => now - m.ts < HISTORY_TTL_MS)
      .map(({ role, content }) => ({ role, content }));
  } catch (e) {
    console.error('getHistory failed:', e);
    return [];
  }
}

export async function appendHistory(userText: string, assistantText: string): Promise<void> {
  try {
    const now = Date.now();
    await mutateState((s) => {
      const fresh = s.history.filter((m) => now - m.ts < HISTORY_TTL_MS);
      const history = [
        ...fresh,
        { role: 'user' as const, content: userText.slice(0, 800), ts: now },
        { role: 'assistant' as const, content: assistantText.slice(0, 1200), ts: now },
      ].slice(-MAX_HISTORY);
      return { ...s, history };
    });
  } catch (e) {
    console.error('appendHistory failed:', e);
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await mutateState((s) => ({ ...s, history: [] }));
  } catch (e) {
    console.error('clearHistory failed:', e);
  }
}
