BEGIN;

-- ============================================================================
-- ШАГ 1: Безопасное обновление таблицы учеников (tutor_students)
-- ============================================================================
ALTER TABLE tutor_students
    ADD COLUMN IF NOT EXISTS monthly_target_lessons INT NOT NULL DEFAULT 12,
    ADD COLUMN IF NOT EXISTS recurring_schedule JSONB DEFAULT '[]'::jsonb;

-- Переносим старый размер абонемента в новую месячную норму для существующих учеников
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tutor_students' AND column_name = 'package_total_lessons'
    ) THEN
        UPDATE tutor_students 
        SET monthly_target_lessons = COALESCE(NULLIF(package_total_lessons, 0), 12);
    END IF;
END $$;

-- Удаляем только финансовые колонки (ученики, их id, имена, телефоны, цвета и billing_day остаются!)
ALTER TABLE tutor_students
    DROP COLUMN IF EXISTS price_per_lesson,
    DROP COLUMN IF EXISTS package_remaining_lessons,
    DROP COLUMN IF EXISTS package_total_lessons;


-- ============================================================================
-- ШАГ 2: Безопасное обновление таблицы уроков (tutor_lessons)
-- ============================================================================
ALTER TABLE tutor_lessons
    ADD COLUMN IF NOT EXISTS miss_reason TEXT,
    ADD COLUMN IF NOT EXISTS needs_makeup BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_makeup BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- Снимаем старое ограничение на статусы, чтобы можно было использовать 'missed' и 'planned'
ALTER TABLE tutor_lessons DROP CONSTRAINT IF EXISTS tutor_lessons_status_check;
ALTER TABLE tutor_lessons ADD CONSTRAINT tutor_lessons_status_check 
    CHECK (status IN ('planned', 'scheduled', 'completed', 'missed', 'missed_makeup', 'missed_excused', 'missed_penalty', 'cancelled'));

-- Если в tutor_makeups были записаны причины пропусков, переносим их в tutor_lessons.miss_reason
UPDATE tutor_lessons l
SET miss_reason = m.reason
FROM tutor_makeups m
WHERE m.missed_lesson_id = l.id AND l.miss_reason IS NULL AND m.reason IS NOT NULL;

-- Конвертируем старые статусы пропусков в единый статус 'missed' без потери истории
UPDATE tutor_lessons
SET 
    needs_makeup = true,
    miss_reason = COALESCE(miss_reason, notes, 'Уважительная причина (из архива)'),
    status = 'missed'
WHERE status IN ('missed_excused', 'missed_makeup');

UPDATE tutor_lessons
SET 
    needs_makeup = false,
    miss_reason = COALESCE(miss_reason, notes, 'Пропуск без отработки'),
    status = 'missed'
WHERE status = 'missed_penalty';

-- Удаляем колонку цены урока
ALTER TABLE tutor_lessons
    DROP COLUMN IF EXISTS price;

-- Индексы для быстрых выборок по датам и архиву ученика
CREATE INDEX IF NOT EXISTS idx_lessons_date ON tutor_lessons(lesson_date);
CREATE INDEX IF NOT EXISTS idx_lessons_student_date ON tutor_lessons(student_id, lesson_date);


-- ============================================================================
-- ШАГ 3: Безопасное обновление таблицы отработок (tutor_makeups)
-- ============================================================================
ALTER TABLE tutor_makeups
    ADD COLUMN IF NOT EXISTS scheduled_lesson_id UUID REFERENCES tutor_lessons(id) ON DELETE SET NULL;

-- Приводим старые статусы отработок к новой системе ('pending' | 'scheduled' | 'completed' | 'archived')
UPDATE tutor_makeups SET status = 'completed' WHERE status = 'resolved';
UPDATE tutor_makeups SET status = 'archived' WHERE status = 'burned';


-- ============================================================================
-- ШАГ 4: Автоматическое извлечение шаблона расписания (recurring_schedule)
-- из уже существующих уроков старых учеников
-- ============================================================================
WITH extracted_slots AS (
    SELECT DISTINCT 
        student_id,
        EXTRACT(ISODOW FROM lesson_date)::INT AS day_of_week, -- 1 (Пн) .. 7 (Вс)
        to_char(start_time, 'HH24:MI') AS start_str,
        to_char(end_time, 'HH24:MI') AS end_str
    FROM tutor_lessons
    WHERE lesson_date >= CURRENT_DATE - INTERVAL '30 days'
      AND status IN ('planned', 'scheduled', 'completed', 'missed', 'missed_makeup')
),
aggregated_schedules AS (
    SELECT 
        student_id,
        jsonb_agg(
            jsonb_build_object(
                'dayOfWeek', day_of_week,
                'startTime', start_str,
                'endTime', end_str
            ) ORDER BY day_of_week, start_str
        ) AS schedule_json
    FROM extracted_slots
    GROUP BY student_id
)
UPDATE tutor_students s
SET recurring_schedule = a.schedule_json
FROM aggregated_schedules a
WHERE s.id = a.student_id 
  AND (s.recurring_schedule IS NULL OR s.recurring_schedule = '[]'::jsonb);


-- ============================================================================
-- ШАГ 5: Удаление финансовой таблицы платежей и старых RPC-функций баланса
-- ============================================================================
DROP TABLE IF EXISTS tutor_payments CASCADE;
DROP FUNCTION IF EXISTS update_student_balance CASCADE;
DROP FUNCTION IF EXISTS add_payment_to_student CASCADE;

COMMIT;
