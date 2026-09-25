import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Leaf } from 'lucide-react'
import { supabase } from '../api/supabaseClient'

/**
 * หน้านี้รับ redirect จาก Google OAuth (PKCE flow)
 * ฟัง onAuthStateChange โดยตรงจาก supabase เพื่อ redirect ตาม role ใน profiles table
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const redirected = useRef(false)

  useEffect(() => {
    console.log('[AuthCallback] mounted, URL:', window.location.href)

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    console.log('[AuthCallback] code in URL:', code ? 'YES' : 'NO')

    // ฟัง SIGNED_IN event โดยตรง
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthCallback] onAuthStateChange event:', event, 'session:', !!session)

      if (event === 'SIGNED_IN' && session && !redirected.current) {
        redirected.current = true

        console.log('[AuthCallback] SIGNED_IN - loading profile for:', session.user.id)

        // โหลด role จาก profiles table
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()

          const role = profile?.role || 'customer'
          console.log('[AuthCallback] role:', role)

          if (role === 'admin') navigate('/admin', { replace: true })
          else if (role === 'farmer') navigate('/farmer', { replace: true })
          else navigate('/', { replace: true })
        } catch (err) {
          console.error('[AuthCallback] profile error:', err)
          navigate('/', { replace: true })
        }
      }
    })

    // ถ้ามี code ใน URL → trigger exchange โดยตรง
    if (code) {
      console.log('[AuthCallback] triggering exchangeCodeForSession...')
      supabase.auth.exchangeCodeForSession(window.location.href).then(({ data, error }) => {
        console.log('[AuthCallback] exchangeCodeForSession result:', { data: !!data?.session, error: error?.message })
      })
    } else {
      // ไม่มี code → เช็ค session ที่มีอยู่แล้ว
      supabase.auth.getSession().then(({ data: { session } }) => {
        console.log('[AuthCallback] getSession result:', !!session)
        if (session && !redirected.current) {
          redirected.current = true
          navigate('/', { replace: true })
        }
      })
    }

    // Fallback timeout
    const timeout = setTimeout(() => {
      if (!redirected.current) {
        console.log('[AuthCallback] TIMEOUT - redirecting to login')
        navigate('/login', { replace: true })
      }
    }, 15000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-mint-100 flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 bg-gradient-green rounded-2xl flex items-center justify-center shadow-glow animate-pulse">
        <Leaf className="w-8 h-8 text-white" />
      </div>
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-primary-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-forest animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-forest-dark font-semibold text-lg">กำลังเข้าสู่ระบบ...</p>
        <p className="text-gray-400 text-sm mt-1">กรุณารอสักครู่</p>
      </div>
    </div>
  )
}
