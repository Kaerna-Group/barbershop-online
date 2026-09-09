import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const mockModeRequested = import.meta.env.VITE_USE_MOCKS === 'true'
const supabaseUrl = mockModeRequested
  ? undefined
  : import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = mockModeRequested
  ? undefined
  : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const hasSupabaseCredentials = Boolean(supabaseUrl && supabaseKey)

export const isMockMode = mockModeRequested || !hasSupabaseCredentials
export const isSupabaseConfigured = hasSupabaseCredentials && !isMockMode

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED')
  }
  return supabase
}
