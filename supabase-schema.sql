-- =========================================================
-- Supabase Schema for Tutor Tracker (Single Page CRM)
-- Timezone: Asia/Tashkent (UTC+5)
-- =========================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Создаем правильные таблицы, если их вдруг нет
create table if not exists public.tutor_students (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    price_per_lesson numeric not null default 150000,
    package_remaining_lessons integer not null default 0,
    package_total_lessons integer not null default 8,
    phone text,
    telegram text,
    color text default '#3B82F6',
    payment_type text default 'package',
    notes text,
    billing_day text, -- НОВАЯ КОЛОНКА
    is_active boolean default true,
    created_at timestamptz not null default now()
);

-- ДОБАВЛЯЕМ КОЛОНКУ, ЕСЛИ ТАБЛИЦА УЖЕ БЫЛА СОЗДАНА РАНЕЕ
alter table public.tutor_students add column if not exists billing_day text;

create table if not exists public.tutor_lessons (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.tutor_students(id) on delete cascade,
    lesson_date date not null,
    start_time time not null,
    end_time time not null,
    status text not null,
    price numeric,
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists public.tutor_payments (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.tutor_students(id) on delete cascade,
    amount numeric not null default 0,
    lessons_count integer not null default 0,
    payment_date date,
    payment_method text,
    created_at timestamptz not null default now()
);

create table if not exists public.tutor_makeups (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.tutor_students(id) on delete cascade,
    student_name text,
    missed_lesson_id uuid not null,
    reason text,
    status text default 'pending',
    missed_date date,
    created_at timestamptz not null default now()
);

-- ==========================================
-- 2. БЕЗОПАСНЫЕ ПРОЦЕДУРЫ (RPC) ДЛЯ БАЛАНСА
-- ==========================================

-- Функция для безопасного изменения баланса (декремент/инкремент)
create or replace function update_student_balance(p_student_id uuid, p_delta integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.tutor_students
  set package_remaining_lessons = package_remaining_lessons + p_delta
  where id = p_student_id;
end;
$$;

-- Функция для пополнения при оплате (меняет и оставшиеся и всего)
create or replace function add_payment_to_student(p_student_id uuid, p_lessons_added integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.tutor_students
  set 
    package_remaining_lessons = package_remaining_lessons + p_lessons_added,
    package_total_lessons = package_total_lessons + p_lessons_added
  where id = p_student_id;
end;
$$;
