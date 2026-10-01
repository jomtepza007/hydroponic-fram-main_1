import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell, CheckCheck, Package, Camera, ShoppingBag,
  Clock, ChevronRight, X, ExternalLink, Sparkles
} from 'lucide-react'
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} from '../../api/notifications'
import { formatDateTh } from '../../utils/dateUtils'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../api/supabaseClient'

export default function NotificationDropdown({ dark = false, placement = 'bottom-end' }) {
  const { user, isAdmin, isFarmer } = useAuth()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user?.id) return

    loadNotifications()

    // Realtime subscription สำหรับแจ้งเตือนใหม่
    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications()
        }
      )
      .subscribe()

    // Polling ทุกๆ 30 วินาทีเป็น fallback
    const interval = setInterval(loadNotifications, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [user?.id])

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  async function loadNotifications() {
    if (!user?.id) return
    try {
      const [list, count] = await Promise.all([
        getMyNotifications(user.id, 15),
        getUnreadCount(user.id),
      ])
      setNotifications(list)
      setUnreadCount(count)
    } catch (e) {
      console.warn('Load notifications failed:', e)
    }
  }

  async function handleToggle() {
    if (!open) {
      setLoading(true)
      await loadNotifications()
      setLoading(false)
    }
    setOpen(prev => !prev)
  }

  async function handleNotificationClick(n) {
    // 1. Mark as read
    if (!n.is_read) {
      await markAsRead(n.id)
      setNotifications(prev =>
        prev.map(item => (item.id === n.id ? { ...item, is_read: true } : item))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    }

    setOpen(false)

    // 2. นำทางไปยังหน้าที่เกี่ยวข้อง
    if (n.related_id) {
      if (isAdmin) {
        navigate(`/admin/orders/${n.related_id}`)
      } else if (isFarmer) {
        navigate(`/farmer/orders/${n.related_id}`)
      } else {
        navigate(`/orders/${n.related_id}`)
      }
    }
  }

  async function handleMarkAllAsRead() {
    if (!user?.id || unreadCount === 0) return
    await markAllAsRead(user.id)
    setNotifications(prev => prev.map(item => ({ ...item, is_read: true })))
    setUnreadCount(0)
  }

  // เลือกไอคอนตามประเภท
  function renderTypeIcon(type) {
    switch (type) {
      case 'planting_photo':
        return (
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <Camera className="w-4 h-4" />
          </div>
        )
      case 'order_status':
        return (
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4" />
          </div>
        )
      case 'new_order':
        return (
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="w-4 h-4" />
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-primary-100 text-forest flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
        )
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        id="btn-notification-bell"
        onClick={handleToggle}
        className={`relative p-2 rounded-xl transition-all duration-200 ${
          dark
            ? open
              ? 'bg-white/20 text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
            : open
              ? 'bg-primary-100 text-forest'
              : 'text-gray-500 hover:text-forest hover:bg-primary-50'
        }`}
        title="การแจ้งเตือน"
      >
        <Bell className="w-5 h-5" />

        {/* Unread badge with ping effect */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex items-center justify-center rounded-full h-4 w-4 bg-red-500 text-white text-[10px] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className={`absolute ${
            placement === 'sidebar'
              ? 'left-full top-0 ml-3'
              : 'right-0 top-full mt-2'
          } w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 py-0 z-50 overflow-hidden animate-slide-up text-gray-800`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-50/70 to-emerald-50/30 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800 text-sm">การแจ้งเตือน</span>
              {unreadCount > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-forest text-white">
                  {unreadCount} ใหม่
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-xs text-forest hover:text-forest-dark font-medium flex items-center gap-1 hover:underline transition-all"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                อ่านทั้งหมด
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="spinner w-6 h-6" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Bell className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p className="text-sm font-medium text-gray-500">ไม่มีการแจ้งเตือนในขณะนี้</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  เมื่อมีความคืบหน้าของออเดอร์ ข้อมูลจะปรากฏที่นี่
                </p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-gray-50/80 ${
                    !n.is_read ? 'bg-emerald-50/40' : 'bg-white'
                  }`}
                >
                  {renderTypeIcon(n.type)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p
                        className={`text-xs font-bold truncate ${
                          !n.is_read ? 'text-gray-900' : 'text-gray-700'
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-forest flex-shrink-0" />
                      )}
                    </div>
                    {n.message && (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1.5 pt-1 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-300" />
                        {formatDateTh(n.created_at, 'd MMM HH:mm น.')}
                      </span>
                      {n.related_id && (
                        <span className="text-forest font-semibold flex items-center gap-0.5 hover:underline">
                          ดูรายละเอียด <ChevronRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer view all / quick links */}
          <div className="p-2.5 bg-gray-50 border-t border-gray-100 text-center">
            <Link
              to={isAdmin ? '/admin/orders' : isFarmer ? '/farmer/orders' : '/orders'}
              onClick={() => setOpen(false)}
              className="text-xs text-forest font-semibold hover:underline inline-flex items-center gap-1"
            >
              ดูรายการออเดอร์ทั้งหมด <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
