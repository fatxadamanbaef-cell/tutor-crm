-- ============================================================================
-- Migration v5: Actual Payments (Cash Flow), Atomic Payment RPCs & Tutor Settings
-- Non-destructive migration for Tutor Tracker CRM (Timezone: Asia/Tashkent UTC+5)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Table: tutor_payments (Cash Flow & Student Payment History)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tutor_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.tutor_students(id) ON DELETE CASCADE,
  amount_uzs     integer NOT NULL CHECK (amount_uzs >= 0),
  lessons_added  integer NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'payme' CHECK (payment_method IN ('payme', 'click', 'card', 'cash')),
  paid_at        timestamptz NOT NULL DEFAULT now(),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_payments_student_paid_at
  ON public.tutor_payments (student_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_tutor_payments_paid_at
  ON public.tutor_payments (paid_at DESC);

-- ============================================================================
-- 2. Atomic RPC: record_student_payment
-- Inserts a payment record into tutor_payments AND increments
-- tutor_students.lessons_balance in a single transaction.
-- Returns JSONB: { "payment": { ... }, "new_balance": <integer> }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_student_payment(
  p_student_id     uuid,
  p_amount_uzs     integer,
  p_lessons_added  integer,
  p_payment_method text DEFAULT 'payme',
  p_paid_at        timestamptz DEFAULT now(),
  p_note           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method      text;
  v_payment     public.tutor_payments%ROWTYPE;
  v_new_balance integer;
BEGIN
  IF p_amount_uzs IS NULL OR p_amount_uzs < 0 THEN
    RAISE EXCEPTION 'Invalid amount_uzs: % (must be >= 0)', p_amount_uzs;
  END IF;

  v_method := COALESCE(NULLIF(lower(trim(p_payment_method)), ''), 'payme');
  IF v_method NOT IN ('payme', 'click', 'card', 'cash') THEN
    RAISE EXCEPTION 'Invalid payment_method: %', p_payment_method;
  END IF;

  UPDATE public.tutor_students
  SET    lessons_balance = lessons_balance + COALESCE(p_lessons_added, 0)
  WHERE  id = p_student_id
  RETURNING lessons_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found: %', p_student_id;
  END IF;

  INSERT INTO public.tutor_payments (
    student_id,
    amount_uzs,
    lessons_added,
    payment_method,
    paid_at,
    note
  )
  VALUES (
    p_student_id,
    p_amount_uzs,
    COALESCE(p_lessons_added, 0),
    v_method,
    COALESCE(p_paid_at, now()),
    NULLIF(trim(COALESCE(p_note, '')), '')
  )
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'new_balance', v_new_balance
  );
END;
$$;

-- ============================================================================
-- 3. Atomic RPC: delete_student_payment
-- Deletes a payment record from tutor_payments AND rolls back its lessons_added
-- from tutor_students.lessons_balance in a single transaction.
-- Returns JSONB: { "deleted_payment": { ... }, "student_id": <uuid>, "new_balance": <integer> }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_student_payment(
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment     public.tutor_payments%ROWTYPE;
  v_new_balance integer;
BEGIN
  DELETE FROM public.tutor_payments
  WHERE  id = p_payment_id
  RETURNING * INTO v_payment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  UPDATE public.tutor_students
  SET    lessons_balance = lessons_balance - v_payment.lessons_added
  WHERE  id = v_payment.student_id
  RETURNING lessons_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'deleted_payment', to_jsonb(v_payment),
    'student_id', v_payment.student_id,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_student_payment(uuid, integer, integer, text, timestamptz, text)
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_student_payment(uuid)
  TO anon, authenticated, service_role;

-- ============================================================================
-- 4. Table: tutor_settings (Unified Tutor Profile & Payment Requisites)
-- Note: Intentionally left empty on migration so existing browser localStorage
-- settings can be prefilled in SettingsTab and saved once to Supabase.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tutor_settings (
  id                      text PRIMARY KEY DEFAULT 'default',
  tutor_name              text NOT NULL DEFAULT 'Фархад',
  bank_name               text NOT NULL DEFAULT 'Payme / Click',
  card_number             text NOT NULL DEFAULT '',
  card_holder             text NOT NULL DEFAULT '',
  reminder_minutes_before integer NOT NULL DEFAULT 15,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMIT;
