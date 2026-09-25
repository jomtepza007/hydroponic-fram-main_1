import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * ProtectedRoute — ตรวจสอบ role ก่อน render children
 * @param {string[]} allowedRoles - ['admin', 'farmer', 'customer']
 */
export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { isLoggedIn, role, isBanned, loading } = useAuth()

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
