import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../api/supabaseClient'
import { RefreshCw, LogOut, AlertCircle } from 'lucide-react'

/**
 * ProtectedRoute — ตรวจสอบ role ก่อน render children
 * @param {string[]} allowedRoles - ['admin', 'farmer', 'customer']
 */
export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { isLoggedIn, role, isBanned, loading } = useAuth()
  const [timeoutReached, setTimeoutReached] = useState(false)

  useEffect(() => {
    if (isLoggedIn && role === null) {
      const timer = setTimeout(() => {
        setTimeoutReached(true)
      }, 6000)
      return () => clearTimeout(timer)
    } else {
      setTimeoutReached(false)
    }
  }, [isLoggedIn, role])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="spinner w-10 h-10" />
      </div>
    )
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  if (isBanned) {
    return <Navigate to="/banned" replace />
  }

  // profile กำลังโหลด (user login แล้วแต่ยังดึง role ไม่ได้)
  if (isLoggedIn && role === null) {
    if (timeoutReached) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="max-w-md w-full bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-500">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">กำลังเชื่อมต่อข้อมูลผู้ใช้งาน...</h2>
            <p className="text-sm text-gray-500 mb-6">
              ระบบใช้เวลาโหลดสิทธิ์การเข้าถึงนานกว่าปกติ คุณสามารถลองรีเฟรชหน้าเว็บ หรือออกจากระบบแล้วเข้าสู่ระบบใหม่อีกครั้ง
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 px-4 bg-forest text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-forest-dark transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> รีเฟรชหน้านี้
              </button>
              <button
                onClick={async () => {
                  try {
                    await supabase.auth.signOut()
                  } catch {}
                  window.location.href = '/login'
                }}
                className="w-full py-2.5 px-4 border border-gray-200 text-gray-600 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="spinner w-10 h-10" />
      </div>
    )
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
