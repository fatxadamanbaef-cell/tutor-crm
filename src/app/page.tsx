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
      await setLessonStatusDirect(lessonId, status, missReason, needsMakeup);
      await refreshData();
    } catch (e) {
      console.error('Status change failed:', e);
    }
  };

  const handleScheduleSundayMakeup = async (makeupIdOrLessonId: string, sundayDate: string, timeStr: string) => {
    try {
      // Find if it's makeupId or lessonId
      const makeup = makeups.find(m => m.id === makeupIdOrLessonId || m.missed_lesson_id === makeupIdOrLessonId);
      if (makeup) {
        await scheduleSundayMakeup(makeup.id, sundayDate, timeStr);
      } else {
        const lesson = lessons.find(l => l.id === makeupIdOrLessonId);
        if (lesson) {
          await saveLesson({
            student_id: lesson.student_id,
            date: sundayDate,
            time_str: timeStr,
            status: 'planned',
            is_makeup: true,
            notes: `Отработка за ${lesson.date.substring(0, 10)}: ${lesson.miss_reason || ''}`,
          });
        }
      }
      await refreshData();
    } catch (e) {
      console.error('Failed to schedule Sunday makeup:', e);
    }
  };

  const handleArchiveMakeup = async (makeupIdOrLessonId: string) => {
    try {
      const makeup = makeups.find(m => m.id === makeupIdOrLessonId || m.missed_lesson_id === makeupIdOrLessonId);
      if (makeup) {
        await archiveMakeup(makeup.id);
      } else {
        await updateLessonDetails(makeupIdOrLessonId, { needs_makeup: false });
      }
      await refreshData();
    } catch (e) {
      console.error('Failed to archive makeup:', e);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    try {
      await deleteStudent(studentId);
      setSelectedStudent(null);
      await refreshData();
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const handleSaveStudent = async (data: any) => {
    try {
      await saveStudent(data);
      await refreshData();
      setIsAddStudentOpen(false);
    } catch (e: any) {
      console.error('Save error:', e);
      alert('Ошибка при сохранении: ' + (e.message || String(e)));
    }
  };

  const handleSaveStudentInfo = async (studentId: string, updates: any) => {
    try {
      await updateStudentSettings(studentId, updates);
      await refreshData();
      if (selectedStudent) {
        const refreshed = (await getStudents()).find((s) => s.id === studentId);
        if (refreshed) setSelectedStudent(refreshed);
      }
    } catch (e) {
      console.error('Failed to save student info:', e);
    }
  };

  const handleUpdateLessonTime = async (lessonId: string, timeStr: string, dateStr?: string) => {
    try {
      await updateLessonTime(lessonId, timeStr, dateStr);
      await refreshData();
    } catch (e) {
      console.error('Failed to update lesson time:', e);
    }
  };

  const handleUpdateLessonMissReason = async (lessonId: string, missReason: string) => {
    try {
      await updateLessonDetails(lessonId, { miss_reason: missReason });
      await refreshData();
    } catch (e) {
      console.error('Failed to update miss reason:', e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 overflow-hidden relative selection:bg-blue-100">
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
            refreshData();
          }}
          onDeleteStudent={handleDeleteStudent}
          onSaveStudentInfo={handleSaveStudentInfo}
          onUpdateLessonMissReason={handleUpdateLessonMissReason}
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
            await saveLesson(data);
            await refreshData();
            setIsAddLessonOpen(false);
          } catch (e) {
            console.error('Failed to save lesson:', e);
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
            await updateLessonDetails(lessonId, updates);
            await refreshData();
          } catch (e) {
            console.error('Update failed:', e);
          }
        }}
        onDelete={async (lessonId) => {
          try {
            await deleteLesson(lessonId);
            await refreshData();
          } catch (e) {
            console.error('Delete failed:', e);
          }
        }}
      />
    </div>
  );
}
