require('dotenv').config({ path: 'd:\\mathvibe project\\tutor-crm\\.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rqgvjdqthjwvqyqyhajg.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZ3ZqZHF0aGp3dnF5cXloYWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzk1MDksImV4cCI6MjEwNTY1NTUwOX0.G7rufwuviuPRho8b0vNaAYUqZ5HfmorAj3Q78e1A5GY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.from('tutor_students').insert([{
    name: 'Test Student',
    price_per_lesson: 150000,
    package_remaining_lessons: 0,
    package_total_lessons: 8,
    billing_day: "10 число",
    payment_type: 'package',
    is_active: true
  }]).select();
  
  if (error) {
    console.error('INSERT ERROR:', error);
  } else {
    console.log('SUCCESS:', data);
  }
}

test();
