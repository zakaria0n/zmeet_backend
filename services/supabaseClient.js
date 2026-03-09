import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'YOUR_SUPABASE_SERVICE_KEY';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'; // If service key is not available, we can fallback, but auth admin needs service_role

// We use service key for admin operations, or anon key if we only want standard client ops. 
// For a backend, service role is often useful, but standard client works too.
export const supabase = createClient(supabaseUrl, supabaseKey);
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey); // For operations mimicking a client
