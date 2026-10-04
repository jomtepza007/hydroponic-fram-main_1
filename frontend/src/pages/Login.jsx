import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Leaf, ArrowLeft, ShieldCheck, Sparkles, Lock } from 'lucide-react'
import { signInWithGoogle } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function Login() {
  const { isLoggedIn, role } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  // redirect หลังล็อกอินแล้ว (รอให้ role โหลดเสร็จก่อน)
  useEffect(() => {
    if (isLoggedIn && role !== null) {
      if (role === 'admin') navigate('/admin')
      else if (role === 'farmer') navigate('/farmer')
      else navigate('/')
    }
  }, [isLoggedIn, role, navigate])

  async function handleGoogleLogin() {
    try {
      setLoading(true)
      await signInWithGoogle()
    } catch (err) {
      console.error('Login error:', err.message)
      toast.error('ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/50 flex flex-col justify-center items-center px-4 py-12 overflow-hidden select-none">
      {/* Decorative ambient background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-200/30 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-teal-200/30 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-emerald-100/20 to-mint-200/20 rounded-full blur-3xl pointer-events-none" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.07]" />
      </div>

      {/* Top Left: Back to Home */}
      <div className="absolute top-6 left-6 z-20">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-forest bg-white/80 hover:bg-white px-3.5 py-2 rounded-full border border-gray-200/80 shadow-xs hover:shadow-md transition-all backdrop-blur-sm group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5 text-forest" />
          <span>กลับสู่หน้าหลัก</span>
        </Link>
      </div>

      {/* Main Login Card */}
      <div className="relative w-full max-w-[420px] z-10">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(45,106,79,0.1)] border border-emerald-100/80 p-8 sm:p-10 animate-slide-up">
          
          {/* Farm Logo Badge */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative inline-flex items-center justify-center mb-4">
              <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-emerald-500 to-forest flex items-center justify-center shadow-lg shadow-emerald-600/25 ring-8 ring-emerald-50">
                <Leaf className="w-9 h-9 text-white" />
              </div>
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center text-xs border border-emerald-100">
                🌱
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-forest border border-emerald-200/80 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              HydroFarm Preorder System
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              เข้าสู่ระบบ
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-2 leading-relaxed">
              สั่งจองผักไฮโดรโปนิกส์สดสะอาดล่วงหน้า และติดตามการเจริญเติบโตของผลผลิตได้ทุกขั้นตอน
            </p>
          </div>

          {/* Action Button */}
          <div className="space-y-4 pt-2">
            <button
              id="btn-google-login"
              type="button"
              disabled={loading}
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white border border-gray-200/90
                         rounded-2xl text-gray-700 font-semibold text-sm shadow-sm hover:shadow-md
                         hover:border-emerald-300 hover:bg-emerald-50/30 active:scale-[0.98] transition-all duration-200
                         disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer group"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-forest border-t-transparent rounded-full animate-spin" />
                  <span className="text-forest text-sm font-medium">กำลังเชื่อมต่อ Google...</span>
                </div>
              ) : (
                <>
                  <svg className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-gray-700 group-hover:text-forest transition-colors font-medium">
                    เข้าสู่ระบบด้วย Google
                  </span>
                </>
              )}
            </button>

            {/* Subtle Security Footnote */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 pt-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span>เข้าสู่ระบบอย่างปลอดภัยด้วย Google OAuth 2.0</span>
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-gray-100 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Lock className="w-3 h-3 text-gray-400" />
            <span>เฉพาะสมาชิกและลูกค้าที่ได้รับสิทธิ์เข้าใช้งาน</span>
          </div>
        </div>
      </div>

      {/* Bottom Footer Note */}
      <footer className="text-center text-xs text-gray-400 py-2 z-10">
        HydroFarm © 2026 • ผักไฮโดรโปนิกส์คุณภาพ สด สะอาด ปลอดภัย
      </footer>
    </div>
  )
}
