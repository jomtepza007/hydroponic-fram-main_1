import { supabase } from './supabaseClient'

/** ล็อกอินด้วย Google OAuth */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw error
  return data
}

/** ออกจากระบบ */
export async function signOut() {
  try {
    localStorage.removeItem('equipment_cart')
  } catch {
    // Ignore localStorage errors
  }
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/** ดึงข้อมูล Session ปัจจุบัน */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  return session
}

/** ดึง Profile ของ User พร้อม Role */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}
