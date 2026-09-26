-- =========================================================
-- Supabase Schema for Tutor Tracker (Single Page CRM)
-- Timezone: Asia/Tashkent (UTC+5)
-- =========================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. STUDENTS TABLE
create table if not exists public.students (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    price_per_lesson numeric not null default 150000,
    prepaid_balance integer not null default 0,
    makeup_debt integer not null default 0,
    phone text,
    created_at timestamptz not null default timezone('Asia/Tashkent', now())
);

-- 2. LESSONS TABLE
create table if not exists public.lessons (
    id uuid primary key default uuid_generate_v4(),
    student_id uuid not null references public.students(id) on delete cascade,
    date timestamptz not null,
    status text not null default 'planned' check (status in ('planned', 'completed', 'missed_excused', 'missed_penalty')),
    created_at timestamptz not null default timezone('Asia/Tashkent', now())
);

-- 3. PAYMENTS TABLE (Ledger)
create table if not exists public.payments (
    id uuid primary key default uuid_generate_v4(),
    student_id uuid not null references public.students(id) on delete cascade,
    amount_uzs numeric not null default 0,
    lessons_added integer not null default 0,
    created_at timestamptz not null default timezone('Asia/Tashkent', now())
);

-- Indexes for lightning fast queries
create index if not exists idx_lessons_student_id on public.lessons(student_id);
create index if not exists idx_lessons_date on public.lessons(date);
create index if not exists idx_payments_student_id on public.payments(student_id);

-- Enable RLS
alter table public.students enable row level security;
alter table public.lessons enable row level security;
alter table public.payments enable row level security;

-- Public access policies for Telegram Mini App
create policy "Allow all operations for students" on public.students for all using (true) with check (true);
create policy "Allow all operations for lessons" on public.lessons for all using (true) with check (true);
create policy "Allow all operations for payments" on public.payments for all using (true) with check (true);

-- Insert Seed Data (Mock)
insert into public.students (id, name, price_per_lesson, prepaid_balance, makeup_debt, phone)
values
  ('11111111-1111-4111-8111-111111111111', 'Сахиб Рахимов', 150000, 6, 0, '+998901234567'),
  ('22222222-2222-4222-8222-222222222222', 'Малика Каримова', 180000, 0, 1, '+998977654321'),
  ('33333333-3333-4333-8333-333333333333', 'Алишер Усманов', 120000, 2, 2, '+998935551122')
on conflict (id) do nothing;
