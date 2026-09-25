import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../api/supabaseClient'
import { getProfile } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // Supabase auth user
  const [profile, setProfile] = useState(null) // profiles table row (with role)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // ดึง session ปัจจุบัน
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        await loadProfile(session.user.id, session.user)
      }
      setLoading(false)
    })

    // Listen สำหรับ auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id, session.user)
        } else {
          setUser(null)
          setProfile(null)
          try { localStorage.removeItem('equipment_cart') } catch {}
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId, currentUser = null) {
    try {
      let profileData = await getProfile(userId)

      // ถ้า profile ยังไม่มี full_name ให้บันทึกจาก Google Metadata หรือ Email อัตโนมัติ
      const fallbackName = currentUser?.user_metadata?.full_name ||
                           currentUser?.user_metadata?.name ||
                           (currentUser?.email ? currentUser.email.split('@')[0] : '')

      if (profileData && (!profileData.full_name || profileData.full_name === 'ลูกค้าทั่วไป') && fallbackName) {
        try {
          const { data: updated } = await supabase
            .from('profiles')
            .update({ full_name: fallbackName })
            .eq('id', userId)
            .select()
            .single()
          if (updated) profileData = updated
        } catch (e) {
          console.warn('Failed to auto-update profile name:', e)
        }
      }

      setProfile(profileData)
    } catch {
      // ลองอีกครั้ง 1 รอบ กรณี network glitch
      try {
        await new Promise(r => setTimeout(r, 500))
        const profileData = await getProfile(userId)
        setProfile(profileData)
      } catch {
        // ยังไม่มี profile จริง (user ใหม่มาก) — ไม่ fallback เป็น customer
        // เพื่อไม่ให้ farmer/admin ถูก redirect ผิด
        setProfile(null)
      }
    }
  }

  const value = {
    user,
    profile,
    loading,
    role: profile?.role ?? null,
    isAdmin: profile?.role === 'admin',
    isFarmer: profile?.role === 'farmer',
    isCustomer: profile?.role === 'customer',
    isBanned: profile?.is_banned === true,
    isLoggedIn: !!user,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
