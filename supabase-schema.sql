-- =========================================================
-- ТАБЛИЦЫ ДЛЯ ПРИЛОЖЕНИЯ РЕПЕТИТОРА (TUTOR TRACKER)
-- Запустите этот скрипт в Supabase -> SQL Editor -> New query
-- =========================================================

-- 1. Таблица учеников (students)
CREATE TABLE IF NOT EXISTS public.tutor_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    telegram TEXT,
    price_per_lesson NUMERIC(10, 2) NOT NULL DEFAULT 1000.00,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('per_lesson', 'package')) DEFAULT 'package',
    package_total_lessons INT NOT NULL DEFAULT 8,
    package_remaining_lessons INT NOT NULL DEFAULT 8,
    color TEXT DEFAULT '#3B82F6',
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Таблица уроков (lessons)
CREATE TABLE IF NOT EXISTS public.tutor_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.tutor_students(id) ON DELETE CASCADE,
    lesson_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'missed_makeup', 'made_up', 'cancelled')) DEFAULT 'scheduled',
    is_paid BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Таблица платежей (payments)
CREATE TABLE IF NOT EXISTS public.tutor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.tutor_students(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    lessons_count INT NOT NULL DEFAULT 1,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'СБП / Перевод',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Таблица отработок (makeups)
CREATE TABLE IF NOT EXISTS public.tutor_makeups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.tutor_students(id) ON DELETE CASCADE,
    missed_lesson_id UUID REFERENCES public.tutor_lessons(id) ON DELETE SET NULL,
    makeup_lesson_id UUID REFERENCES public.tutor_lessons(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'scheduled', 'completed')) DEFAULT 'pending',
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Индексы для быстрой выборки расписания
CREATE INDEX IF NOT EXISTS idx_tutor_lessons_date ON public.tutor_lessons(lesson_date);
CREATE INDEX IF NOT EXISTS idx_tutor_lessons_student ON public.tutor_lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_tutor_payments_student ON public.tutor_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_tutor_makeups_student ON public.tutor_makeups(student_id);

-- Отключение RLS или разрешение публичного доступа по anon-ключу (для личного использования)
ALTER TABLE public.tutor_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_makeups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access for authenticated and anon" ON public.tutor_students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for authenticated and anon" ON public.tutor_lessons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for authenticated and anon" ON public.tutor_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access for authenticated and anon" ON public.tutor_makeups FOR ALL USING (true) WITH CHECK (true);
