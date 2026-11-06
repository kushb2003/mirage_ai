import { supabase } from './supabase'

// Returns the Authorization header for the signed-in Supabase user, or an empty object.
export async function getChatAuthHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
