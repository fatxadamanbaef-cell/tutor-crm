'use client';

import React, { useEffect, useState } from 'react';
import { Student, Lesson, FinanceSummary } from '@/types';
import { getStudents, getLessons, getFinanceSummary, addPayment, deleteStudent, saveStudent, updateStudentBillingDay, updateStudentColor, updateLessonTime, saveLesson, deleteLesson, updateLessonDetails, saveBatchLessons, updateStudentInfo, setLessonStatusDirect } from '@/lib/storage';
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
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary>({ earnedThisMonthUzs: 0, completedLessonsCount: 0 });
  
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
      const [sData, lData, fData] = await Promise.all([
        getStudents(),
        getLessons(),
        getFinanceSummary(),
      ]);
      setStudents(sData);
      setLessons(lData);
      setFinanceSummary(fData);
      setLoading(false);
    } catch (e) {
      console.error('Data load error:', e);
      setLoading(false);
    }
  };

  const handleAddPayment = async (studentId: string, amount: number, lessonsAdded: number, date?: string) => {
    try {
      await addPayment(studentId, amount, lessonsAdded, date);
      await refreshData();
      if (selectedStudent) {
        const refreshed = (await getStudents()).find(s => s.id === studentId);
        if (refreshed) setSelectedStudent(refreshed);
      }
    } catch (e) {
      console.error('Payment error:', e);
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

  const handleSaveStudent = async (data: any, generatedLessons?: Lesson[]) => {
    try {
      const saved = await saveStudent(data);
      setStudents(prev => [...prev, saved]);
      
      // Save generated schedule lessons if any
      if (generatedLessons && generatedLessons.length > 0) {
        const lessonsWithStudentId = generatedLessons.map(l => ({ ...l, student_id: saved.id }));
        await saveBatchLessons(lessonsWithStudentId);
      }
      
      await refreshData();
      setIsAddStudentOpen(false);
    } catch (e: any) {
      console.error('Save error:', e);
      alert('Ошибка при сохранении: ' + (e.message || String(e)));
    }
  };

  const handleToggleCalendarDate = async (studentId: string, dateStr: string) => {
    try {
      const updatedStudents = await getStudents();
      setStudents(updatedStudents);
      if (selectedStudent) {
        const refreshed = updatedStudents.find(s => s.id === studentId);
        if (refreshed) setSelectedStudent(refreshed);
      }
    } catch (e) {
      console.error('Toggle sync error:', e);
    }
  };

  const handleUpdateBillingDay = async (studentId: string, day: number) => {
    try {
      await updateStudentBillingDay(studentId, String(day));
      await refreshData();
      if (selectedStudent) setSelectedStudent(prev => prev ? { ...prev, billing_day: day } : null);
    } catch (e) {
      console.error('Failed to update billing day:', e);
    }
  };

  const handleUpdateColor = async (studentId: string, color: string) => {
    try {
      await updateStudentColor(studentId, color);
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, color } : s));
      if (selectedStudent) setSelectedStudent({ ...selectedStudent, color });
    } catch(e) {
      console.error('Failed to update color', e);
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

  const handleSaveStudentInfo = async (studentId: string, updates: { name?: string; phone?: string }) => {
    try {
      await updateStudentInfo(studentId, updates);
      await refreshData();
      if (selectedStudent) {
        const refreshed = (await getStudents()).find(s => s.id === studentId);
        if (refreshed) setSelectedStudent(refreshed);
      }
    } catch (e) {
      console.error('Failed to save student info:', e);
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
            onAddLesson={() => {
              setSelectedDateForNewLesson(new Date());
              setIsAddLessonOpen(true);
            }}
            onOpenLesson={(lesson) => {
              setSelectedLesson(lesson);
            }}
            onUpdateLessonTime={handleUpdateLessonTime}
          />
        )}
        {activeTab === 'clients' && (
          <ClientsTab 
            students={students} 
            onOpenStudent={setSelectedStudent} 
            onAddStudent={() => setIsAddStudentOpen(true)} 
          />
        )}
        {activeTab === 'stats' && <StatsTab summary={financeSummary} lessons={lessons} students={students} />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>

      {/* Navigation */}
      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />

      {/* Full-Screen Modals */}
      {selectedStudent && (
        <ClientProfileScreen
          student={selectedStudent}
          lessons={lessons}
          onBack={() => { setSelectedStudent(null); refreshData(); }}
          onAddPayment={handleAddPayment}
          onDeleteStudent={handleDeleteStudent}
          onToggleCalendarDate={handleToggleCalendarDate}
          onUpdateBillingDay={handleUpdateBillingDay}
          onUpdateColor={handleUpdateColor}
          onSaveStudentInfo={handleSaveStudentInfo}
        />
      )}

      {/* Simple Modals */}
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
        student={selectedLesson ? students.find(s => s.id === selectedLesson.student_id) || null : null}
        onSave={async (lessonId, updates) => {
          try {
            const originalLesson = lessons.find(l => l.id === lessonId);
            if (updates.status && originalLesson && originalLesson.status !== updates.status) {
              await setLessonStatusDirect(lessonId, updates.status);
            }
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
