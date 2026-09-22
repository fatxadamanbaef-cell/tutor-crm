'use client';

import React, { useState, useEffect } from 'react';
import { Student, Lesson, Payment, MakeupLesson } from '@/types';
import {
  getStudents,
  saveStudent,
  deleteStudent,
  getLessons,
  saveLesson,
  saveBatchLessons,
  updateLessonStatus,
  deleteLesson,
  getPayments,
  addPayment,
  getMakeups,
  resolveMakeup,
} from '@/lib/storage';
import { isSupabaseConfigured } from '@/lib/supabase';
import { initTelegramApp } from '@/lib/telegram';

import { Header } from '@/components/Header';
import { BottomNav, TabType } from '@/components/BottomNav';
import { ScheduleView } from '@/components/ScheduleView';
import { StudentsView } from '@/components/StudentsView';
import { MakeupsView } from '@/components/MakeupsView';
import { FinancesView } from '@/components/FinancesView';

import { AddLessonModal } from '@/components/modals/AddLessonModal';
import { ConductLessonModal } from '@/components/modals/ConductLessonModal';
import { GenerateScheduleModal } from '@/components/modals/GenerateScheduleModal';
import { AddStudentModal } from '@/components/modals/AddStudentModal';
import { AddPaymentModal } from '@/components/modals/AddPaymentModal';
import { MissedLessonModal } from '@/components/modals/MissedLessonModal';
import { ParentReportModal } from '@/components/modals/ParentReportModal';
import { SupabaseConfigModal } from '@/components/modals/SupabaseConfigModal';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [loading, setLoading] = useState(true);

  // Data states
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [makeups, setMakeups] = useState<MakeupLesson[]>([]);

  // Modal states
  const [isAddLessonOpen, setIsAddLessonOpen] = useState(false);
  const [lessonModalDate, setLessonModalDate] = useState<string | undefined>();
  const [lessonModalStudentId, setLessonModalStudentId] = useState<string | undefined>();

  const [isAutoScheduleOpen, setIsAutoScheduleOpen] = useState(false);
  const [autoScheduleStudentId, setAutoScheduleStudentId] = useState<string | undefined>();

  const [isConductLessonOpen, setIsConductLessonOpen] = useState(false);
  const [conductStudentId, setConductStudentId] = useState<string | undefined>();

  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);

  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [paymentStudentId, setPaymentStudentId] = useState<string | undefined>();

  const [isMissedModalOpen, setIsMissedModalOpen] = useState(false);
  const [missedTargetLesson, setMissedTargetLesson] = useState<Lesson | null>(null);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportStudent, setReportStudent] = useState<Student | null>(null);

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Load data on mount
  useEffect(() => {
    setMounted(true);
    initTelegramApp();
    refreshData();
  }, []);

  const refreshData = async () => {
    try {
      const [sData, lData, pData, mData] = await Promise.all([
        getStudents(),
        getLessons(),
        getPayments(),
        getMakeups(),
      ]);
      setStudents(sData);
      setLessons(lData);
      setPayments(pData);
      setMakeups(mData);
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---
  const handleCompleteLesson = async (lessonId: string) => {
    await updateLessonStatus(lessonId, 'completed');
    await refreshData();
  };

  const handleRevertLesson = async (lessonId: string) => {
    await updateLessonStatus(lessonId, 'scheduled');
    await refreshData();
  };

  const handleMissLesson = (lesson: Lesson) => {
    setMissedTargetLesson(lesson);
    setIsMissedModalOpen(true);
  };

  const handleConfirmMissLesson = async (options: {
    needsMakeup: boolean;
    reason: string;
  }) => {
    if (!missedTargetLesson) return;
    const newStatus = options.needsMakeup ? 'missed_makeup' : 'cancelled';
    await updateLessonStatus(missedTargetLesson.id, newStatus, {
      reason: options.reason,
    });
    await refreshData();
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (confirm('Вы уверены, что хотите удалить этот урок?')) {
      await deleteLesson(lessonId);
      await refreshData();
    }
  };

  const handleSaveLesson = async (lessonData: any) => {
    await saveLesson(lessonData);
    await refreshData();
  };

  const handleSaveBatchLessons = async (batch: Lesson[]) => {
    await saveBatchLessons(batch);
    await refreshData();
  };

  const handleConductLesson = async (data: {
    student_id: string;
    lesson_date: string;
    start_time: string;
    notes?: string;
  }) => {
    const student = students.find((s) => s.id === data.student_id);
    const createdLesson = await saveLesson({
      student_id: data.student_id,
      lesson_date: data.lesson_date,
      start_time: data.start_time,
      price: student?.price_per_lesson || 150000,
      status: 'scheduled',
      notes: data.notes || 'Проведенный урок',
    });
    // Mark as completed immediately to deduct package
    await updateLessonStatus(createdLesson.id, 'completed');
    await refreshData();
  };

  const handleSaveStudent = async (studentData: any, generatedLessons?: Lesson[]) => {
    await saveStudent(studentData);
    if (generatedLessons && generatedLessons.length > 0) {
      await saveBatchLessons(generatedLessons);
    }
    await refreshData();
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (confirm('Удалить ученика и все связанные данные?')) {
      await deleteStudent(studentId);
      await refreshData();
    }
  };

  const handleSavePayment = async (paymentData: any) => {
    await addPayment(paymentData);
    await refreshData();
  };

  const handleResolveMakeup = async (makeupId: string) => {
    await resolveMakeup(makeupId);
    await refreshData();
  };

  const handleScheduleMakeup = (makeup: MakeupLesson) => {
    setLessonModalStudentId(makeup.student_id);
    setIsAddLessonOpen(true);
  };

  const pendingMakeupsCount = makeups.filter(
    (m) => m.status === 'pending' || m.status === 'scheduled'
  ).length;

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-xs font-medium">Загрузка расписания...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <Header
        onAddLesson={() => {
          setLessonModalDate(undefined);
          setLessonModalStudentId(undefined);
          setIsAddLessonOpen(true);
        }}
        onConductLesson={() => {
          setConductStudentId(undefined);
          setIsConductLessonOpen(true);
        }}
        onOpenSync={() => setIsSyncModalOpen(true)}
        isCloudConnected={isSupabaseConfigured}
      />

      {/* Main Content View */}
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        {activeTab === 'schedule' && (
          <ScheduleView
            lessons={lessons}
            students={students}
            onCompleteLesson={handleCompleteLesson}
            onMissLesson={handleMissLesson}
            onDeleteLesson={handleDeleteLesson}
            onRevertLesson={handleRevertLesson}
            onOpenAutoSchedule={() => {
              setAutoScheduleStudentId(undefined);
              setIsAutoScheduleOpen(true);
            }}
            onAddLessonForDate={(dateStr) => {
              setLessonModalDate(dateStr);
              setLessonModalStudentId(undefined);
              setIsAddLessonOpen(true);
            }}
          />
        )}

        {activeTab === 'students' && (
          <StudentsView
            students={students}
            onAddStudent={() => {
              setStudentToEdit(null);
              setIsAddStudentOpen(true);
            }}
            onEditStudent={(s) => {
              setStudentToEdit(s);
              setIsAddStudentOpen(true);
            }}
            onDeleteStudent={handleDeleteStudent}
            onAddPaymentForStudent={(s) => {
              setPaymentStudentId(s.id);
              setIsAddPaymentOpen(true);
            }}
            onScheduleLessonForStudent={(s) => {
              setLessonModalStudentId(s.id);
              setLessonModalDate(undefined);
              setIsAddLessonOpen(true);
            }}
            onConductLessonForStudent={(s) => {
              setConductStudentId(s.id);
              setIsConductLessonOpen(true);
            }}
            onAutoScheduleForStudent={(s) => {
              setAutoScheduleStudentId(s.id);
              setIsAutoScheduleOpen(true);
            }}
            onOpenReportForStudent={(s) => {
              setReportStudent(s);
              setIsReportModalOpen(true);
            }}
          />
        )}

        {activeTab === 'makeups' && (
          <MakeupsView
            makeups={makeups}
            students={students}
            onResolveMakeup={handleResolveMakeup}
            onScheduleMakeup={handleScheduleMakeup}
          />
        )}

        {activeTab === 'finances' && (
          <FinancesView
            payments={payments}
            students={students}
            lessons={lessons}
            onAddPayment={() => {
              setPaymentStudentId(undefined);
              setIsAddPaymentOpen(true);
            }}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingMakeupsCount={pendingMakeupsCount}
      />

      {/* Modals */}
      <ParentReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        student={reportStudent}
        lessons={lessons}
      />

      <GenerateScheduleModal
        isOpen={isAutoScheduleOpen}
        onClose={() => setIsAutoScheduleOpen(false)}
        students={students}
        initialStudentId={autoScheduleStudentId}
        onSaveBatch={handleSaveBatchLessons}
      />

      <ConductLessonModal
        isOpen={isConductLessonOpen}
        onClose={() => setIsConductLessonOpen(false)}
        students={students}
        initialStudentId={conductStudentId}
        onConfirm={handleConductLesson}
      />

      <AddLessonModal
        isOpen={isAddLessonOpen}
        onClose={() => setIsAddLessonOpen(false)}
        students={students}
        initialDate={lessonModalDate}
        initialStudentId={lessonModalStudentId}
        onSave={handleSaveLesson}
      />

      <AddStudentModal
        isOpen={isAddStudentOpen}
        onClose={() => setIsAddStudentOpen(false)}
        studentToEdit={studentToEdit}
        onSave={handleSaveStudent}
      />

      <AddPaymentModal
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        students={students}
        initialStudentId={paymentStudentId}
        onSave={handleSavePayment}
      />

      <MissedLessonModal
        isOpen={isMissedModalOpen}
        onClose={() => setIsMissedModalOpen(false)}
        lesson={missedTargetLesson}
        onConfirm={handleConfirmMissLesson}
      />

      <SupabaseConfigModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        isCloudConnected={isSupabaseConfigured}
      />
    </div>
  );
}
