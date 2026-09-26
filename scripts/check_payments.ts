import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPayments() {
  const { data: students } = await supabase.from('tutor_students').select('id').ilike('name', '%Давид%');
  if (students && students.length > 0) {
    const { data: payments } = await supabase.from('tutor_payments').select('*').eq('student_id', students[0].id);
    console.log('David Payments:', payments);
  }
}

checkPayments();
