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

- **Zero-Finance Model**: The system tracks lessons, attendance, student targets, and Sunday makeups. Financial fields, prices, balances, and payment calculations are completely removed.
- **Strict Timezone Standard**: Single source of truth is **Asia/Tashkent (UTC+5)**. All dates are formatted using `getTashkentDateString(date?: Date)` in `src/lib/formatters.ts`. Never use raw `new Date().toISOString().split('T')[0]`.
- **Database Isolation**: System bot configurations (`_BOT_CONFIG`, `_BOT_STATE`) in `tutor_students` are filtered out at query level (`.not('name', 'like', '_BOT_%')`).
- **Mobile WebView Performance**: Lightweight list view with zero drag-and-drop overhead, ensuring 60 FPS in Telegram WebViews.

---

## 2. Data Layer (`src/lib/storage.ts`)

- **Windowed Lesson Fetching**: `getLessons(fromDate?, toDate?)` defaults to an active window:
  `[1st of previous month, today + 35 days]`.
- **Student Archive on Demand**: Full history for a specific student is loaded only when opening their profile via `getStudentLessonsArchive(studentId)`.
- **Safe Recurring Generator**:
  - `planRecurringLessonsForStudent(studentId, slots, weeksAhead)` is **strictly additive** (`INSERT IF NOT EXISTS`).
  - Existing lessons (`planned`, `completed`, `missed`, rescheduled) are **never deleted or overwritten**.
  - Recurring generation is triggered ONLY on the server cron (`/api/bot/cron`) or when a teacher explicitly saves a recurring schedule in `ClientProfileScreen.tsx`.
- **Client Polling & Event Listeners**:
  - No `visibilitychange` or `window.focus` event listeners reloading or regenerating lessons.
  - Page loads data in parallel (`Promise.all([getStudents(), getLessons(), getPendingMakeups()])`) and applies **Optimistic UI** updates on user actions.

---

## 3. UI Structure

- `src/app/page.tsx`: Main SPA container managing navigation (`Schedule`, `Clients`), quick stat badges, and optimistic state mutations.
- `src/components/tabs/ScheduleTab.tsx`:
  - `HorizontalDateStrip.tsx`: Fast swipeable calendar strip with lesson count indicators and a "Сегодня" button.
  - `LessonCard.tsx`: Chronological card with 1-tap quick actions:
    - **Был** (toggle completed / planned)
    - **Пропуск** (with inline submenu: "В отработку (ВС)" / "Без отработки")
    - **Перенести** (opens `EditLessonModal.tsx`)
  - `SundayMakeupsSection.tsx`: Pending makeup lesson queue with 1-click scheduling.
- `src/components/tabs/ClientsTab.tsx` & `ClientProfileScreen.tsx`: Student management, monthly target setting, recurring schedule editor, and full lesson archive.

---

## 4. Telegram Bot & AI Integration

- **Route Endpoints**:
  - `/api/bot/route.ts`: Telegram webhook handler, audio voice transcription (Whisper), and natural language command parsing (GPT-4.1).
  - `/api/bot/cron/route.ts`: Periodic cron job for 08:30 morning digest, 15-minute lesson reminders, and weekly Sunday summary.
  - `/api/bot/digest/route.ts`: Manual/API trigger for sending morning digest using unified `buildMorningDigest()`.
- **OpenAI Tools (`src/lib/openai.ts`)**:
  - `markLessonStatus`: Mark lesson completed or missed with reason and optional Sunday makeup.
  - `rescheduleLesson`: Reschedule planned, conducted, or missed lessons to any target date/time.
  - `setupOrUpdateStudent`: Create/update student profile, target, billing day, and recurring schedule.
  - `getSchedule`: Query real lessons within any specific date window.
  - `getStudentArchiveReport`: Full attendance summary without finance.
