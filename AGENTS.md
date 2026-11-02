<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tutor CRM (Architecture & Development Guide)

Lightweight, mobile-first CRM for private tutors operating inside Telegram Mini App and Web browsers.
Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Supabase, and OpenAI GPT-4.1.

---

## 1. Core Architecture & Philosophy

- **Hybrid Billing & Balance Model**: 
  - Supports two billing modes per student: `date_to_date` (calendar period based on monthly `billing_day`) and `package` (lesson package quota).
  - Tracks strict `lessons_balance` with each student having a defined `lesson_rate` (default 300,000 UZS).
  - Sunday makeups workflow is completely deprecated in favor of explicit 3-state attendance tracking.
- **Strict Timezone Standard**: Single source of truth is **Asia/Tashkent (UTC+5)**. All dates are formatted using `getTashkentDateString(date?: Date)` in `src/lib/formatters.ts`.
- **Database Isolation**: System bot configurations (`_BOT_CONFIG`, `_BOT_STATE`) in `tutor_students` are filtered out at query level (`.not('name', 'like', '_BOT_%')`).
- **Mobile WebView Performance**: Lightweight list view with zero drag-and-drop overhead, ensuring 60 FPS in Telegram WebViews.

---

## 2. 3-State Attendance & Idempotent Balance Deductions

Attendance transitions directly control `lessons_balance` on `tutor_students`:
1. `completed` (✅ Был): Decrements `lessons_balance` by 1.
2. `missed_penalty` (🔥 Сгорел): Decrements `lessons_balance` by 1 (paid/burned absence).
3. `missed_excused` (🛑 Отмена): Does **not** decrement balance. If transitioning from `completed` or `missed_penalty`, refunds +1 back to `lessons_balance`.
- Transitions back to `planned` refund +1 if previous state was deducted.
- Balance mutations are idempotent (`completed` -> `completed` never double-deducts).

---

## 3. Data Layer & Billing Engine (`src/lib/storage.ts`)

- **Windowed Lesson Fetching**: `getLessons(fromDate?, toDate?)` defaults to active window:
  `[1st of previous month, today + 35 days]`.
- **Interactive Schedule Horizon & Archive**:
  - `getStudentHorizonLessons(studentId, daysHorizon)`: fetches past (`today - daysHorizon`) and upcoming (`today + daysHorizon`) lessons, ensuring recurring projection up to 9 weeks (63 days) ahead.
  - `getUnmarkedPastLessons(studentId)`: returns all past lessons (`lesson_date <= today`) still in `planned`/`scheduled` status.
  - `initializePackageFromPastDate(studentId, startDate, packageCount, excludedDates)`: backfills past package lessons from `startDate`, sets starting baseline, marks completed/excused lessons, and sets exact remaining balance.
- **Recurring Schedule Generation & Template Changes**:
  - `planRecurringLessonsForStudent(studentId, slots, weeksAhead = 9, cleanFutureUntouched)`
  - When schedule template changes, future untouched planned slots (`lesson_date >= today`, `status IN ('planned', 'scheduled')`, default notes) are cleaned before generating new slots.
  - Completed, missed, or custom rescheduled lessons are **never deleted or overwritten**.
- **Hybrid Billing Calculator Engine**:
  - `calculateStudentBilling(studentId, customStartDate?, customEndDate?)`:
    - `date_to_date`: iterates through calendar days in billing cycle `[billing_day, billing_day - 1]`, counts recurring slots, calculates gross sum, adjusts for current balance, and outputs net amount to pay.
    - `package`: calculates package cost (`monthly_target_lessons * lesson_rate`) and current balance.
  - `topUpStudentBalance(studentId, lessonsAdded)`: increments balance upon payment.

---

## 4. UI Structure

- `src/app/page.tsx`: Main SPA container managing optimistic UI mutations for status changes, balance adjustments, and schedule updates.
- `src/components/tabs/ScheduleTab.tsx`:
  - `HorizontalDateStrip.tsx`: Fast swipeable calendar strip with lesson count indicators and "Сегодня" quick jump.
  - `LessonCard.tsx`: Chronological card with 1-tap quick buttons:
    - **Был** (`completed`, -1 balance)
    - **Сгорел** (`missed_penalty`, -1 balance)
    - **Отмена** (`missed_excused`, 0 balance change)
    - **Инфо** (opens `EditLessonModal.tsx`)
- `src/components/tabs/ClientsTab.tsx` & `ClientProfileScreen.tsx`:
  - Student profiles with live balance badge, `+ / -` quick adjustments, period billing breakdown, and recurring schedule editor.
  - **Quick-Mark Past Lessons Alert**: high-visibility banner with 1-tap `✅`, `🔥`, `🛑` chips and bulk `✅ Отметить все (N) как проведенные`.
  - **Retroactive Package Wizard**: "📦 Открыть пакет с прошлой даты" with live slot preview chips, exclusion toggles, and instant balance recalculation.
  - **7 / 14 / 30 / 60-Day Horizon**: interactive timeline with "Все / Прошедшие / Будущие" filters, live counter bar, and 1-tap status switchers (`✅`, `🔥`, `🛑`, `📅`).

---

## 5. Telegram Bot & AI Integration

- **Route Endpoints**:
  - `/api/bot/route.ts`: Telegram webhook handler, Whisper voice transcription, GPT-4.1 natural language processing, and interactive 1-tap reminder callbacks (`status:<id>:completed`, `status:<id>:penalty`, `status:<id>:excused`).
  - `/api/bot/cron/route.ts`: Periodic cron job for 08:30 morning digest (with billing alerts for due dates & low balances), 15-minute reminders with 1-tap buttons, and Sunday weekly summaries.
  - `/api/bot/digest/route.ts`: Manual/API trigger for sending morning digest using unified `buildMorningDigest()`.
- **OpenAI Tools (`src/lib/openai.ts`)**:
  - `markLessonStatus`: Mark lesson completed, penalty miss, or excused cancellation with balance tracking.
  - `calculateStudentBilling`: Compute period billing, lesson counts, and amount in UZS.
  - `addStudentPayment`: Record student lesson package payments to balance.
  - `setupOrUpdateStudent`: Create/update student profile, `billing_type`, `lesson_rate`, `lessons_balance`, and recurring schedule.
  - `rescheduleLesson`: Reschedule any lesson to a new date/time.
  - `getSchedule`: Query real lessons within any specific date window.
