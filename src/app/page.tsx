'use client';

import React, { useEffect, useState } from 'react';
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
} from '@/lib/storage';
import { initTelegramApp } from '@/lib/telegram';
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

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [makeups, setMakeups] = useState<Makeup[]>([]);

  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isAddLessonOpen, setIsAddLessonOpen] = useState(false);
  const [selectedDateForNewLesson, setSelectedDateForNewLesson] = useState<Date | undefined>(undefined);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  useEffect(() => {
    initTelegramApp();
    refreshData();
  }, []);

  const refreshData = async () => {
    try {
      const [sData, lData, mData] = await Promise.all([
        getStudents(),
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
  };

  const handleSetLessonStatus = async (
    lessonId: string,
    status: LessonStatus,
    missReason?: string,
    needsMakeup?: boolean
  ) => {
    try {
      // Optimistic local state update
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId
            ? {
                ...l,
                status,
                miss_reason: missReason !== undefined ? missReason : l.miss_reason,
                needs_makeup: needsMakeup !== undefined ? needsMakeup : l.needs_makeup,
              }
            : l
        )
      );

      await setLessonStatusDirect(lessonId, status, missReason, needsMakeup);

      // Update makeups list in background if needed
      getPendingMakeups().then(setMakeups).catch(() => {});
    } catch (e) {
      console.error('Status change failed:', e);
      refreshData();
    }
  };

  const handleScheduleSundayMakeup = async (makeupIdOrLessonId: string, sundayDate: string, timeStr: string) => {
    try {
      const makeup = makeups.find(m => m.id === makeupIdOrLessonId || m.missed_lesson_id === makeupIdOrLessonId);
      if (makeup) {
        const newL = await scheduleSundayMakeup(makeup.id, sundayDate, timeStr);
        setLessons((prev) => [...prev, newL]);
        setMakeups((prev) => prev.filter((m) => m.id !== makeup.id));
      } else {
        const lesson = lessons.find(l => l.id === makeupIdOrLessonId);
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
  };

  const handleArchiveMakeup = async (makeupIdOrLessonId: string) => {
    try {
      const makeup = makeups.find(m => m.id === makeupIdOrLessonId || m.missed_lesson_id === makeupIdOrLessonId);
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
  };

  const handleDeleteStudent = async (studentId: string) => {
    try {
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      setLessons((prev) => prev.filter((l) => l.student_id !== studentId));
      setSelectedStudent(null);
      await deleteStudent(studentId);
    } catch (e) {
      console.error('Delete error:', e);
      refreshData();
    }
  };

  const handleSaveStudent = async (data: any) => {
    try {
      const saved = await saveStudent(data);
      setStudents((prev) => [...prev.filter((s) => s.id !== saved.id), saved]);
      setIsAddStudentOpen(false);
      // Refresh lessons for this student's new slots
      getLessons().then(setLessons).catch(() => {});
    } catch (e: any) {
      console.error('Save error:', e);
      alert('Ошибка при сохранении: ' + (e.message || String(e)));
    }
  };

  const handleSaveStudentInfo = async (studentId: string, updates: any) => {
    try {
      await updateStudentSettings(studentId, updates);
      const updatedStudents = await getStudents();
      setStudents(updatedStudents);
      const refreshed = updatedStudents.find((s) => s.id === studentId);
      if (refreshed) setSelectedStudent(refreshed);
      getLessons().then(setLessons).catch(() => {});
    } catch (e) {
      console.error('Failed to save student info:', e);
    }
  };

  const handleUpdateLessonTime = async (lessonId: string, timeStr: string, dateStr?: string) => {
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
  };

  const handleUpdateLessonMissReason = async (lessonId: string, missReason: string) => {
    try {
      setLessons((prev) =>
        prev.map((l) => (l.id === lessonId ? { ...l, miss_reason: missReason } : l))
      );
      await updateLessonDetails(lessonId, { miss_reason: missReason });
    } catch (e) {
      console.error('Failed to update miss reason:', e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f2f2f7] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#f2f2f7] overflow-hidden relative selection:bg-blue-100">
      {/* Main Tab Content */}
      <div className="h-full overflow-y-auto">
        {activeTab === 'schedule' && (
          <ScheduleTab
            students={students}
            lessons={lessons}
            makeups={makeups}
            onAddLesson={() => {
              setSelectedDateForNewLesson(new Date());
              setIsAddLessonOpen(true);
            }}
            onOpenLesson={(lesson) => {
              setSelectedLesson(lesson);
            }}
            onUpdateLessonTime={handleUpdateLessonTime}
            onSetLessonStatus={handleSetLessonStatus}
            onScheduleSundayMakeup={handleScheduleSundayMakeup}
            onArchiveMakeup={handleArchiveMakeup}
            onRefresh={refreshData}
          />
        )}
        {activeTab === 'clients' && (
          <ClientsTab
            students={students}
            onOpenStudent={setSelectedStudent}
            onAddStudent={() => setIsAddStudentOpen(true)}
          />
        )}
        {activeTab === 'stats' && <StatsTab lessons={lessons} students={students} />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>

      {/* Navigation */}
      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />

      {/* Full-Screen Profile Screen */}
      {selectedStudent && (
        <ClientProfileScreen
          student={selectedStudent}
          lessons={lessons}
          onBack={() => {
            setSelectedStudent(null);
          }}
          onDeleteStudent={handleDeleteStudent}
          onSaveStudentInfo={handleSaveStudentInfo}
          onUpdateLessonMissReason={handleUpdateLessonMissReason}
          onOpenLesson={(lesson) => setSelectedLesson(lesson)}
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
        students={students}
        initialDate={selectedDateForNewLesson}
        onSave={async (data) => {
          try {
            const newLesson = await saveLesson(data);
            setLessons((prev) => [...prev, newLesson]);
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
        student={selectedLesson ? students.find((s) => s.id === selectedLesson.student_id) || null : null}
        onSave={async (lessonId, updates) => {
          try {
            setLessons((prev) =>
              prev.map((l) => (l.id === lessonId ? { ...l, ...updates } : l))
            );
            await updateLessonDetails(lessonId, updates);
            setSelectedLesson(null);
          } catch (e) {
            console.error('Update failed:', e);
            refreshData();
          }
        }}
        onDelete={async (lessonId) => {
          try {
            setLessons((prev) => prev.filter((l) => l.id !== lessonId));
            await deleteLesson(lessonId);
            setSelectedLesson(null);
          } catch (e) {
            console.error('Delete failed:', e);
            refreshData();
          }
        }}
      />
    </div>
  );
}
