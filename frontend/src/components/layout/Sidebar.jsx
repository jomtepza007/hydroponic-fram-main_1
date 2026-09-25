import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, ShoppingBag, Package, Users,
  Settings, BarChart2, Leaf, LogOut, ChevronRight, Boxes, MapPin
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { signOut } from '../../api/auth'

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'แดชบอร์ด', end: true },
  { to: '/admin/vegetables', icon: Leaf, label: 'จัดการผัก & อุปกรณ์' },
  { to: '/admin/orders', icon: ShoppingBag, label: 'ออเดอร์ทั้งหมด' },
  { to: '/admin/users', icon: Users, label: 'จัดการผู้ใช้' },
  { to: '/admin/growing-areas', icon: MapPin, label: 'พื้นที่ปลูก' },
  { to: '/admin/resources', icon: Boxes, label: 'ทรัพยากร' },
  { to: '/admin/farm-settings', icon: Settings, label: 'ตั้งค่าฟาร์ม' },
  { to: '/admin/reports', icon: BarChart2, label: 'รายงาน' },
]

const farmerLinks = [
  { to: '/farmer', icon: LayoutDashboard, label: 'แดชบอร์ด', end: true },
  { to: '/farmer/vegetables', icon: Leaf, label: 'จัดการผัก & อุปกรณ์' },
  { to: '/farmer/schedule', icon: Calendar, label: 'ตารางปลูก' },
  { to: '/farmer/orders', icon: ShoppingBag, label: 'รายการออเดอร์' },
  { to: '/farmer/resources', icon: Package, label: 'สต็อกทรัพยากร' },
]

export default function Sidebar() {
  const { isAdmin, profile, user } = useAuth()
  const navigate = useNavigate()
  const links = isAdmin ? adminLinks : farmerLinks
  const roleLabel = isAdmin ? 'Admin' : 'Farmer'
  const roleColor = isAdmin ? 'bg-purple-500' : 'bg-amber-500'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-base">HydroFarm</p>
            <p className="text-xs text-white/50">Management</p>
          </div>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 py-4 overflow-y-auto scrollbar-hide">
        <p className="px-5 text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">
          เมนูหลัก
        </p>
        {links.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />
          </NavLink>
        ))}
      </nav>

      {/* User Info */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              className="w-9 h-9 rounded-full border-2 border-white/20"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {profile?.full_name || user?.email?.split('@')[0]}
            </p>
            <span className={`text-xs px-1.5 py-0.5 rounded-md text-white/90 ${roleColor}`}>
              {roleLabel}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl
                     text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          ออกจากระบบ
        </button>
      </div>
    </aside>
  )
}
