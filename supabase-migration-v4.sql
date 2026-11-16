-- ============================================================================
-- Migration v4: Atomic Balance Increment RPC
-- Adds a PostgreSQL function for race-condition-safe balance updates.
-- Multiple concurrent status changes (e.g. rapid taps in UI) each increment/
-- decrement atomically without reading stale balance values first.
-- ============================================================================

BEGIN;

-- Atomic increment/decrement of lessons_balance.
-- delta > 0 → top-up (payment / excused refund)
-- delta < 0 → deduction (completed / missed_penalty)
CREATE OR REPLACE FUNCTION increment_lessons_balance(
  p_student_id uuid,
  p_delta      integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE tutor_students
  SET    lessons_balance = lessons_balance + p_delta
  WHERE  id = p_student_id
  RETURNING lessons_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found: %', p_student_id;
  END IF;

  RETURN v_new_balance;
END;
$$;

COMMIT;
