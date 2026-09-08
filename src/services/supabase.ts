import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { authStorage } from '@/services/auth-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey);

/**
 * The publishable key is safe in a client app only when Supabase RLS is enabled.
 * Never place a service_role key in EXPO_PUBLIC_ variables.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        ...(authStorage ? { storage: authStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
