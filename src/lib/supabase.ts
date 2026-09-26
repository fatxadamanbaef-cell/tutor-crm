import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rqgvjdqthjwvqyqyhajg.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZ3ZqZHF0aGp3dnF5cXloYWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzk1MDksImV4cCI6MjEwNTY1NTUwOX0.G7rufwuviuPRho8b0vNaAYUqZ5HfmorAj3Q78e1A5GY';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
