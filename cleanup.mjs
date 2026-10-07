import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rqgvjdqthjwvqyqyhajg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZ3ZqZHF0aGp3dnF5cXloYWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzk1MDksImV4cCI6MjEwNTY1NTUwOX0.G7rufwuviuPRho8b0vNaAYUqZ5HfmorAj3Q78e1A5GY'
);

async function run() {
  const { data: students } = await supabase.from('tutor_students').select('*').ilike('name', '%сахиб%');
  if (!students || students.length === 0) {
    console.log('Студент не найден');
    return;
  }
  const student = students[0];
  console.log(`Очищаем уроки для: ${student.name} (${student.id})`);

  const { data: lessons } = await supabase
    .from('tutor_lessons')
    .select('*')
    .eq('student_id', student.id)
    .order('lesson_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (!lessons) return;

  const datesSeen = new Set();
  let deletedCount = 0;
  let restoredBalance = 0;

  for (const lesson of lessons) {
    // Удаляем уроки из будущего (больше 7 октября)
    if (lesson.lesson_date > '2026-10-07') {
      console.log(`Удаляем урок из будущего: ${lesson.lesson_date}`);
      await supabase.from('tutor_lessons').delete().eq('id', lesson.id);
      deletedCount++;
      if (lesson.status === 'completed') restoredBalance++;
      continue;
    }

    // Удаляем дубликаты на одну и ту же дату
    if (datesSeen.has(lesson.lesson_date)) {
      console.log(`Удаляем дубликат на: ${lesson.lesson_date}`);
      await supabase.from('tutor_lessons').delete().eq('id', lesson.id);
      deletedCount++;
      if (lesson.status === 'completed') restoredBalance++;
      continue;
    }

    datesSeen.add(lesson.lesson_date);
    
    // Оставляем урок, но если он 18:00, сделаем 19:00 как просил пользователь
    if (lesson.start_time !== '19:00') {
       await supabase.from('tutor_lessons').update({ start_time: '19:00', end_time: '20:30' }).eq('id', lesson.id);
    }
  }

  // Обновляем баланс
  if (restoredBalance > 0) {
    console.log(`Восстанавливаем баланс на +${restoredBalance} уроков...`);
    const newBalance = (student.package_remaining_lessons || 0) + restoredBalance;
    await supabase.from('tutor_students').update({ package_remaining_lessons: newBalance }).eq('id', student.id);
  }

  console.log(`Готово! Удалено лишних уроков: ${deletedCount}.`);
}

run().catch(console.error);
