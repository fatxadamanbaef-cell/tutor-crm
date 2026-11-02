-- ============================================================================
-- Migration v3: Hybrid Billing & Strict Balance Tracking
-- Non-destructive migration: preserves all existing data and rows in tutor_students and tutor_lessons.
-- ============================================================================

BEGIN;

-- 1. Add hybrid billing and balance tracking columns to tutor_students
ALTER TABLE tutor_students 
    ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'date_to_date' CHECK (billing_type IN ('date_to_date', 'package')),
    ADD COLUMN IF NOT EXISTS lesson_rate integer NOT NULL DEFAULT 300000,
    ADD COLUMN IF NOT EXISTS lessons_balance integer NOT NULL DEFAULT 0;

-- 2. Verify status constraints on tutor_lessons include new attendance states
ALTER TABLE tutor_lessons DROP CONSTRAINT IF EXISTS tutor_lessons_status_check;
ALTER TABLE tutor_lessons ADD CONSTRAINT tutor_lessons_status_check 
    CHECK (status IN ('planned', 'scheduled', 'completed', 'missed', 'missed_makeup', 'missed_excused', 'missed_penalty', 'cancelled'));

-- 3. Ensure indexes on tutor_lessons for fast billing and attendance queries
CREATE INDEX IF NOT EXISTS idx_lessons_student_status ON tutor_lessons(student_id, status);

COMMIT;

