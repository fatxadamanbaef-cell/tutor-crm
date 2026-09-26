import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDavid() {
  const { data: students, error: err1 } = await supabase.from('tutor_students').select('*').ilike('name', '%Давид%');
  if (err1) console.error(err1);
  console.log('Davids:', students);

  if (students && students.length > 0) {
    const { data: lessons, error: err2 } = await supabase.from('tutor_lessons').select('*').eq('student_id', students[0].id);
    if (err2) console.error(err2);
    console.log('David Lessons:', lessons?.length);
    console.log(lessons);
  }
}

checkDavid();
