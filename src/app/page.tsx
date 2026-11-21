'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Student, Lesson, Makeup, LessonStatus } from '@/types';
import {
  getStudents,
  getLessons,
  getPendingMakeups,
  saveStudent,
  deleteStudent,
  updateStudentSettings,
  updateLessonTime,
  saveLesson,
  deleteLesson,
  updateLessonDetails,
  setLessonStatusDirect,
  scheduleSundayMakeup,
  archiveMakeup,
  isDeductedStatus,
} from '@/lib/storage';
import { getTashkentNow, getStudentBillingPeriod } from '@/lib/formatters';
import { initTelegramApp, getTelegramWebApp } from '@/lib/telegram';
import { Loader2 } from 'lucide-react';

import { BottomNav, TabType } from '@/components/BottomNav';
import { ClientsTab } from '@/components/tabs/ClientsTab';
import { ScheduleTab } from '@/components/tabs/ScheduleTab';
import { StatsTab } from '@/components/tabs/StatsTab';
import { SettingsTab } from '@/components/tabs/SettingsTab';
import { ClientProfileScreen } from '@/components/tabs/ClientProfileScreen';
import { AddStudentModal } from '@/components/modals/AddStudentModal';
import { AddLessonModal } from '@/components/modals/AddLessonModal';
import { EditLessonModal } from '@/components/modals/EditLessonModal';
import { AddPaymentModal } from '@/components/modals/AddPaymentModal';
import { getTutorSettings } from '@/lib/settings';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [makeups, setMakeups] = useState<Makeup[]>([]);

  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isAddLessonOpen, setIsAddLessonOpen] = useState(false);
  const [selectedDateForNewLesson, setSelectedDateForNewLesson] = useState<Date | undefined>(
    undefined
  );
  const [selectedStartTimeForNewLesson, setSelectedStartTimeForNewLesson] = useState<
    string | undefined
  >(undefined);
  const [preselectedStudentIdForLesson, setPreselectedStudentIdForLesson] = useState<
    string | undefined
  >(undefined);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [paymentModalStudent, setPaymentModalStudent] = useState<Student | null>(null);
  const [paymentsVersion, setPaymentsVersion] = useState<number>(0);
  const [lessonsRevision, setLessonsRevision] = useState<number>(0);

  const refreshData = useCallback(async () => {
    try {
      const [sData, lData, mData] = await Promise.all([
        getStudents(false),
        getLessons(),
        getPendingMakeups(),
      ]);
      setStudents(sData);
      setLessons(lData);
      setMakeups(mData);
      setLoading(false);

      // Deep link to edit lesson
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const editLessonId = params.get('editLesson');
        if (editLessonId) {
          const lessonToEdit = lData.find((l) => l.id === editLessonId);
          if (lessonToEdit) {
            setSelectedLesson(lessonToEdit);
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      }
    } catch (e) {
      console.error('Data load error:', e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initTelegramApp();
    // Disable vertical swipe-to-close inside the app
    const tg = getTelegramWebApp();
    if (tg?.disableVerticalSwipes) {
      try {
        tg.disableVerticalSwipes();
      } catch {}
    }
    refreshData();
    getTutorSettings().catch(() => {});

    // Lightweight background heartbeat to ensure Telegram reminders/digests stay reliable while app is open
    const triggerCronCheck = () => {
      const initData = getTelegramWebApp()?.initData || '';
      const headers: Record<string, string> = {};
      if (initData) headers['x-telegram-init-data'] = initData;
      fetch('/api/bot/cron?mode=all', { headers }).catch(() => {});
    };
    triggerCronCheck();
    const cronTimer = setInterval(triggerCronCheck, 3 * 60 * 1000);
    return () => clearInterval(cronTimer);
  }, [refreshData]);

  // Live recalculated attendance stats per student's individual billing period (from billing_day)
  const liveStudents = useMemo(() => {
    const now = getTashkentNow();
    const periodMap: Record<string, { startDate: string; endDate: string }> = {};
    for (const s of students) {
      const p = getStudentBillingPeriod(s.billing_day || '10', now);
      periodMap[s.id] = { startDate: p.startDate, endDate: p.endDate };
    }

    const conductedMap: Record<string, number> = {};
    const missedMap: Record<string, number> = {};

    for (const l of lessons) {
      const p = periodMap[l.student_id];
      const d = l.date.substring(0, 10);
      if (p && (d < p.startDate || d > p.endDate)) continue;
      if (l.status === 'completed') {
        conductedMap[l.student_id] = (conductedMap[l.student_id] || 0) + 1;
      } else if (
        l.status === 'missed' ||
        l.status === 'missed_excused' ||
        l.status === 'missed_penalty'
      ) {
        missedMap[l.student_id] = (missedMap[l.student_id] || 0) + 1;
      }
    }

    return students.map((s) => ({
      ...s,
      conducted_this_month: conductedMap[s.id] ?? 0,
      missed_this_month: missedMap[s.id] ?? 0,
    }));
  }, [students, lessons]);

  const lowBalanceCount = useMemo(
    () =>
      liveStudents.filter((s) => s.is_active !== false && (s.lessons_balance ?? 0) <= 0).length,
    [liveStudents]
  );

  const selectedStudent = useMemo(
    () =>
      selectedStudentId ? liveStudents.find((s) => s.id === selectedStudentId) || null : null,
    [selectedStudentId, liveStudents]
  );

  const handleOpenStudent = useCallback((student: Student) => {
    setSelectedStudentId(student.id);
  }, []);

  const handleSetLessonStatus = useCallback(
    async (lessonId: string, status: LessonStatus, missReason?: string) => {
      try {
        const prevLesson = lessons.find((l) => l.id === lessonId);
        const prevDeducted = prevLesson ? isDeductedStatus(prevLesson.status) : false;
        const targetDeducted = isDeductedStatus(status);
        let delta = 0;
        if (!prevDeducted && targetDeducted) delta = -1;
        else if (prevDeducted && !targetDeducted) delta = 1;

        const isClearingReason =
          status === 'planned' || status === 'scheduled' || status === 'completed';

        // Optimistic local state update for lessons
        setLessons((prev) =>
          prev.map((l) =>
            l.id === lessonId
              ? {
                  ...l,
                  status,
                  miss_reason: isClearingReason
                    ? undefined
                    : missReason !== undefined
                    ? missReason
                    : l.miss_reason,
                  needs_makeup: false,
                }
              : l
          )
        );

        // Optimistic local state update for student balance
        if (delta !== 0 && prevLesson) {
          setStudents((prev) =>
            prev.map((s) =>
              s.id === prevLesson.student_id
                ? { ...s, lessons_balance: (s.lessons_balance ?? 0) + delta }
                : s
            )
          );
        }

        const res = await setLessonStatusDirect(lessonId, status, missReason);
        if (typeof res.newBalance === 'number') {
          setStudents((prev) =>
            prev.map((s) =>
              s.id === res.studentId ? { ...s, lessons_balance: res.newBalance } : s
            )
          );
        }
      } catch (e) {
        console.error('Status change failed:', e);
        refreshData();
      }
    },
    [lessons, refreshData]
  );

  const handleUpdateLessonNote = useCallback(async (lessonId: string, notes: string) => {
    try {
      setLessons((prev) => prev.map((l) => (l.id === lessonId ? { ...l, notes } : l)));
      await updateLessonDetails(lessonId, { notes });
    } catch (e) {
      console.error('Failed to update lesson note:', e);
    }
  }, []);

  const handleScheduleSundayMakeup = useCallback(
    async (makeupIdOrLessonId: string, sundayDate: string, timeStr: string) => {
      try {
        const makeup = makeups.find(
          (m) => m.id === makeupIdOrLessonId || m.missed_lesson_id === makeupIdOrLessonId
        );
        if (makeup) {
          const newL = await scheduleSundayMakeup(makeup.id, sundayDate, timeStr);
          setLessons((prev) => [...prev, newL]);
          setMakeups((prev) => prev.filter((m) => m.id !== makeup.id));
        } else {
          const lesson = lessons.find((l) => l.id === makeupIdOrLessonId);
          if (lesson) {
            const newL = await saveLesson({
              student_id: lesson.student_id,
              date: sundayDate,
              time_str: timeStr,
              status: 'planned',
              is_makeup: true,
              notes: `Отработка за ${lesson.date.substring(0, 10)}: ${lesson.miss_reason || ''}`,
            });
            setLessons((prev) => [...prev, newL]);
          }
        }
      } catch (e) {
        console.error('Failed to schedule Sunday makeup:', e);
        refreshData();
      }
    },
    [makeups, lessons, refreshData]
  );

  const handleArchiveMakeup = useCallback(
    async (makeupIdOrLessonId: string) => {
      try {
        const makeup = makeups.find(
          (m) => m.id === makeupIdOrLessonId || m.missed_lesson_id === makeupIdOrLessonId
        );
        if (makeup) {
          await archiveMakeup(makeup.id);
          setMakeups((prev) => prev.filter((m) => m.id !== makeup.id));
        } else {
          await updateLessonDetails(makeupIdOrLessonId, { needs_makeup: false });
          setLessons((prev) =>
            prev.map((l) => (l.id === makeupIdOrLessonId ? { ...l, needs_makeup: false } : l))
          );
        }
      } catch (e) {
        console.error('Failed to archive makeup:', e);
        refreshData();
      }
    },
    [makeups, refreshData]
  );

  const handleDeleteStudent = useCallback(
    async (studentId: string) => {
      try {
        setStudents((prev) => prev.filter((s) => s.id !== studentId));
        setLessons((prev) => prev.filter((l) => l.student_id !== studentId));
        setSelectedStudentId(null);
        await deleteStudent(studentId);
      } catch (e) {
        console.error('Delete error:', e);
        refreshData();
      }
    },
    [refreshData]
  );

  const handleSaveStudent = useCallback(async (data: any) => {
    try {
      const saved = await saveStudent(data);
      setStudents((prev) => [...prev.filter((s) => s.id !== saved.id), saved]);
      setIsAddStudentOpen(false);
      // Refresh lessons for this student's new slots
      getLessons()
        .then(setLessons)
        .catch(() => {});
    } catch (e: any) {
      console.error('Save error:', e);
      throw e;
    }
  }, []);

  const handleSaveStudentInfo = useCallback(async (studentId: string, updates: any) => {
    try {
      await updateStudentSettings(studentId, updates);
      const [updatedStudents, updatedLessons] = await Promise.all([
        getStudents(false),
        getLessons(),
      ]);
      setStudents(updatedStudents);
      setLessons(updatedLessons);
    } catch (e: any) {
      console.error('Failed to save student info:', e);
      alert('Ошибка при сохранении: ' + (e?.message || String(e)));
      throw e;
    }
  }, []);

  const handleUpdateLessonTime = useCallback(
    async (lessonId: string, timeStr: string, dateStr?: string) => {
      try {
        setLessons((prev) =>
          prev.map((l) =>
            l.id === lessonId
              ? {
                  ...l,
                  time_str: timeStr,
                  date: dateStr ? `${dateStr}T${timeStr.split(' - ')[0]}:00+05:00` : l.date,
                }
              : l
          )
        );
        await updateLessonTime(lessonId, timeStr, dateStr);
      } catch (e) {
        console.error('Failed to update lesson time:', e);
        refreshData();
      }
    },
    [refreshData]
  );

  const handleUpdateLessonMissReason = useCallback(async (lessonId: string, missReason: string) => {
    try {
      setLessons((prev) =>
        prev.map((l) => (l.id === lessonId ? { ...l, miss_reason: missReason } : l))
      );
      await updateLessonDetails(lessonId, { miss_reason: missReason });
    } catch (e) {
      console.error('Failed to update miss reason:', e);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f5f8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Determine modal/overlay stack depth for BackButton
  const hasOverlay =
    Boolean(paymentModalStudent) || Boolean(selectedLesson) || isAddStudentOpen || isAddLessonOpen;
  const hasProfile = Boolean(selectedStudent);

  return (
    <div className="h-screen bg-[#f4f5f8] overflow-hidden relative selection:bg-blue-100">
      {/* Telegram BackButton controller */}
      <TelegramBackButtonController
        hasProfile={hasProfile}
        hasOverlay={hasOverlay}
        onCloseOverlay={() => {
          if (paymentModalStudent) {
            setPaymentModalStudent(null);
            return;
          }
          if (selectedLesson) {
            setSelectedLesson(null);
            return;
          }
          if (isAddStudentOpen) {
            setIsAddStudentOpen(false);
            return;
          }
          if (isAddLessonOpen) {
            setIsAddLessonOpen(false);
            return;
          }
        }}
        onCloseProfile={() => setSelectedStudentId(null)}
      />

      {/* Main Tab Content */}
      <div className="h-full overflow-y-auto overscroll-none">
        {activeTab === 'schedule' && (
          <ScheduleTab
            students={liveStudents}
            lessons={lessons}
            makeups={makeups}
            onAddLesson={(date, startTime) => {
              setSelectedDateForNewLesson(date || getTashkentNow());
              setSelectedStartTimeForNewLesson(startTime);
              setPreselectedStudentIdForLesson(undefined);
              setIsAddLessonOpen(true);
            }}
            onOpenLesson={(lesson) => {
              setSelectedLesson(lesson);
            }}
            onOpenStudent={handleOpenStudent}
            onUpdateLessonTime={handleUpdateLessonTime}
            onSetLessonStatus={handleSetLessonStatus}
            onUpdateLessonNote={handleUpdateLessonNote}
            onScheduleSundayMakeup={handleScheduleSundayMakeup}
            onArchiveMakeup={handleArchiveMakeup}
            onRefresh={refreshData}
          />
        )}
        {activeTab === 'clients' && (
          <ClientsTab
            students={liveStudents}
            onOpenStudent={handleOpenStudent}
            onAddStudent={() => setIsAddStudentOpen(true)}
            onOpenPaymentModal={(student) => setPaymentModalStudent(student)}
            onRefresh={refreshData}
          />
        )}
        {activeTab === 'stats' && (
          <StatsTab
            lessons={lessons}
            students={liveStudents}
            paymentsVersion={paymentsVersion}
            onOpenStudent={handleOpenStudent}
          />
        )}
        {activeTab === 'settings' && <SettingsTab onRefresh={refreshData} />}
      </div>

      {/* Navigation */}
      <BottomNav
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        lowBalanceCount={lowBalanceCount}
      />

      {/* Full-Screen Profile Screen */}
      {selectedStudent && (
        <ClientProfileScreen
          key={selectedStudent.id}
          student={selectedStudent}
          lessons={lessons}
          lessonsRevision={lessonsRevision}
          paymentsVersion={paymentsVersion}
          onBack={() => {
            setSelectedStudentId(null);
          }}
          onDeleteStudent={handleDeleteStudent}
          onSaveStudentInfo={handleSaveStudentInfo}
          onUpdateLessonMissReason={handleUpdateLessonMissReason}
          onOpenLesson={(lesson) => setSelectedLesson(lesson)}
          onOpenPaymentModal={(student) => setPaymentModalStudent(student)}
          onPaymentsChanged={() => setPaymentsVersion((v) => v + 1)}
          onRefresh={refreshData}
          onAddLessonForStudent={(studentId) => {
            setSelectedDateForNewLesson(getTashkentNow());
            setSelectedStartTimeForNewLesson(undefined);
            setPreselectedStudentIdForLesson(studentId);
            setIsAddLessonOpen(true);
          }}
        />
      )}

      {/* Modals */}
      <AddStudentModal
        isOpen={isAddStudentOpen}
        onClose={() => setIsAddStudentOpen(false)}
        onSave={handleSaveStudent}
      />

      <AddLessonModal
        isOpen={isAddLessonOpen}
        onClose={() => setIsAddLessonOpen(false)}
        students={liveStudents}
        lessons={lessons}
        initialDate={selectedDateForNewLesson}
        initialStartTime={selectedStartTimeForNewLesson}
        initialStudentId={preselectedStudentIdForLesson}
        onSave={async (data) => {
          try {
            const newLesson = await saveLesson(data);
            setLessons((prev) => [...prev, newLesson]);
            if (isDeductedStatus(data.status)) {
              setStudents((prev) =>
                prev.map((s) =>
                  s.id === data.student_id
                    ? { ...s, lessons_balance: (s.lessons_balance ?? 0) - 1 }
                    : s
                )
              );
            }
            setIsAddLessonOpen(false);
          } catch (e) {
            console.error('Failed to save lesson:', e);
            refreshData();
          }
        }}
      />

      <EditLessonModal
        isOpen={Boolean(selectedLesson)}
        onClose={() => setSelectedLesson(null)}
        lesson={selectedLesson}
        student={
          selectedLesson
            ? liveStudents.find((s) => s.id === selectedLesson.student_id) || null
            : null
        }
        lessons={lessons}
        onSave={async (lessonId, updates) => {
          try {
            const prevLesson = lessons.find((l) => l.id === lessonId);
            if (prevLesson && updates.status) {
              const prevDeducted = isDeductedStatus(prevLesson.status);
              const nextDeducted = isDeductedStatus(updates.status);
              let delta = 0;
              if (!prevDeducted && nextDeducted) delta = -1;
              else if (prevDeducted && !nextDeducted) delta = 1;
              if (delta !== 0) {
                setStudents((prev) =>
                  prev.map((s) =>
                    s.id === prevLesson.student_id
                      ? { ...s, lessons_balance: (s.lessons_balance ?? 0) + delta }
                      : s
                  )
                );
              }
            }
            setLessons((prev) =>
              prev.map((l) => (l.id === lessonId ? { ...l, ...updates } : l))
            );
            await updateLessonDetails(lessonId, updates);
            setLessonsRevision((v) => v + 1);
            setSelectedLesson(null);
          } catch (e) {
            console.error('Update failed:', e);
            refreshData();
          }
        }}
        onDelete={async (lessonId) => {
          try {
            const prevLesson = lessons.find((l) => l.id === lessonId);
            if (prevLesson && isDeductedStatus(prevLesson.status)) {
              setStudents((prev) =>
                prev.map((s) =>
                  s.id === prevLesson.student_id
                    ? { ...s, lessons_balance: (s.lessons_balance ?? 0) + 1 }
                    : s
                )
              );
            }
            setLessons((prev) => prev.filter((l) => l.id !== lessonId));
            await deleteLesson(lessonId);
            setSelectedLesson(null);
          } catch (e) {
            console.error('Delete failed:', e);
            refreshData();
          }
        }}
      />

      <AddPaymentModal
        isOpen={Boolean(paymentModalStudent)}
        student={paymentModalStudent}
        onClose={() => setPaymentModalStudent(null)}
        onSaved={async ({ studentId, newBalance }) => {
          setStudents((prev) =>
            prev.map((s) =>
              s.id === studentId ? { ...s, lessons_balance: newBalance } : s
            )
          );
          setPaymentsVersion((v) => v + 1);
          await refreshData();
        }}
      />
    </div>
  );
}

// ─── Telegram BackButton controller ──────────────────────────────────────────
interface BackBtnProps {
  hasProfile: boolean;
  hasOverlay: boolean;
  onCloseOverlay: () => void;
  onCloseProfile: () => void;
}

function TelegramBackButtonController({
  hasProfile,
  hasOverlay,
  onCloseOverlay,
  onCloseProfile,
}: BackBtnProps) {
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg?.BackButton) return;

    const shouldShow = hasProfile || hasOverlay;

    if (!shouldShow) {
      tg.BackButton.hide();
      return;
    }

    const handler = () => {
      if (hasOverlay) {
        onCloseOverlay();
      } else if (hasProfile) {
        onCloseProfile();
      }
    };

    tg.BackButton.show();
    tg.BackButton.onClick(handler);

    return () => {
      tg.BackButton.offClick(handler);
    };
  }, [hasProfile, hasOverlay, onCloseOverlay, onCloseProfile]);

  return null;
}
