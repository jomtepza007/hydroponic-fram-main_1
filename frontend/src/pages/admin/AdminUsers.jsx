import { useEffect, useState } from 'react'
import { supabase } from '../../api/supabaseClient'
import {
  Ban, UserCheck, Search, Filter, X, Download, Users, Phone, Mail, RotateCcw
} from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { useAuth } from '../../context/AuthContext'
import { exportCustomersToExcel, exportCustomersToCSV } from '../../utils/csvExport'
import { formatDateTh } from '../../utils/dateUtils'
import { getCustomerTypeConfig } from '../../utils/customerTypeUtils'
import toast from 'react-hot-toast'

const ROLES = ['customer', 'farmer', 'admin']
const CUSTOMER_TYPES = ['ทั่วไป', 'ร้านอาหาร', 'โรงแรม', 'ขายส่ง', 'องค์กร']

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // ตัวกรองและค้นหา
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [customerTypeFilter, setCustomerTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'banned'

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setUsers(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function updateRole(userId, role) {
    if (userId === currentUser?.id && role !== 'admin') {
      toast.error('ไม่สามารถเปลี่ยน Role ของตัวเองออกจาก Admin ได้')
      return
    }
    try {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
      if (error) throw error
      toast.success(`เปลี่ยน Role เป็น "${role}" สำเร็จ`)
      setUsers(u => u.map(usr => usr.id === userId ? { ...usr, role } : usr))
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    }
  }

  async function updateCustomerType(userId, customerType) {
    try {
      const { error } = await supabase.from('profiles').update({ customer_type: customerType }).eq('id', userId)
      if (error) throw error
      toast.success(`เปลี่ยนประเภทลูกค้าเป็น "${customerType}" สำเร็จ`)
      setUsers(u => u.map(usr => usr.id === userId ? { ...usr, customer_type: customerType } : usr))
    } catch {
      toast.error('เกิดข้อผิดพลาดในการเปลี่ยนประเภทลูกค้า')
    }
  }

  async function toggleBan(userId, isBanned) {
    if (userId === currentUser?.id) {
      toast.error('ไม่สามารถ Ban บัญชีของตัวเองได้')
      return
    }
    try {
      const { error } = await supabase.from('profiles').update({ is_banned: !isBanned }).eq('id', userId)
      if (error) throw error
      toast.success(isBanned ? 'ยกเลิก Ban สำเร็จ' : 'Ban ผู้ใช้สำเร็จ')
      setUsers(u => u.map(usr => usr.id === userId ? { ...usr, is_banned: !isBanned } : usr))
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    }
  }

  function handleResetFilters() {
    setSearchQuery('')
    setRoleFilter('all')
    setCustomerTypeFilter('all')
    setStatusFilter('all')
  }

  const hasActiveFilters = searchQuery !== '' || roleFilter !== 'all' || customerTypeFilter !== 'all' || statusFilter !== 'all'

  // กรองข้อมูลผู้ใช้งานตามชื่อ, อีเมล, เบอร์โทรศัพท์, และตัวกรองประเภท
  const filteredUsers = users.filter(u => {
    // 1. ค้นหา ชื่อ, อีเมล, หรือเบอร์โทรศัพท์
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const name = (u.full_name || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      const phone = (u.phone || '').toLowerCase()
      if (!name.includes(q) && !email.includes(q) && !phone.includes(q)) {
        return false
      }
    }

    // 2. ตัวกรอง Role
    if (roleFilter !== 'all' && u.role !== roleFilter) {
      return false
    }

    // 3. ตัวกรองประเภทลูกค้า
    if (customerTypeFilter !== 'all') {
      const currentType = u.customer_type || 'ทั่วไป'
      if (currentType !== customerTypeFilter) {
        return false
      }
    }

    // 4. ตัวกรองสถานะบัญชี
    if (statusFilter === 'active' && u.is_banned) return false
    if (statusFilter === 'banned' && !u.is_banned) return false

    return true
  })

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="page-title">จัดการผู้ใช้งาน</h1>
              <p className="page-subtitle">ค้นหา, ตรวจสอบประเภทลูกค้า, และกำหนดสิทธิ์ผู้ใช้งานในระบบ</p>
            </div>

            <button
              type="button"
              id="btn-export-customers-excel"
              onClick={() => exportCustomersToExcel(filteredUsers)}
              className="btn-outline flex items-center gap-2 text-xs font-semibold py-2 shadow-xs"
              title="ส่งออกรายชื่อลูกค้าเป็น Excel (.xlsx) จัดระเบียบให้อ่านง่าย"
            >
              <Download className="w-4 h-4 text-forest" />
              <span>ดาวน์โหลดรายชื่อผู้ใช้ ({filteredUsers.length}) .xlsx</span>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="card mb-6 p-4 bg-white border border-gray-100 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  id="input-user-search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อ, อีเมล, หรือเบอร์โทร..."
                  className="input pl-9 pr-8 text-xs w-full py-2"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Customer Type */}
              <div>
                <select
                  id="select-filter-customer-type"
                  value={customerTypeFilter}
                  onChange={e => setCustomerTypeFilter(e.target.value)}
                  className="input text-xs w-full py-2 bg-white"
                >
                  <option value="all">🏢 ประเภทลูกค้าทั้งหมด</option>
                  {CUSTOMER_TYPES.map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Role */}
              <div>
                <select
                  id="select-filter-role"
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value)}
                  className="input text-xs w-full py-2 bg-white"
                >
                  <option value="all">👤 Role ทั้งหมด</option>
                  <option value="customer">👤 ลูกค้า (Customer)</option>
                  <option value="farmer">🧑‍🌾 เกษตรกร (Farmer)</option>
                  <option value="admin">👑 ผู้ดูแลระบบ (Admin)</option>
                </select>
              </div>

              {/* Filter Status */}
              <div>
                <select
                  id="select-filter-status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="input text-xs w-full py-2 bg-white"
                >
                  <option value="all">⚡ สถานะบัญชีทั้งหมด</option>
                  <option value="active">✅ ปกติ (Active)</option>
                  <option value="banned">⛔ ถูกระงับ (Banned)</option>
                </select>
              </div>
            </div>

            {/* Bottom filter bar with count and reset */}
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-50">
              <div className="flex items-center gap-2">
                <span>แสดงผล: <strong className="text-gray-800">{filteredUsers.length}</strong> จากทั้งหมด {users.length} คน</span>
                {hasActiveFilters && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-50 text-forest font-semibold">
                    กรองข้อมูลอยู่
                  </span>
                )}
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>

          {/* Users Table */}
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>ผู้ใช้งาน (ชื่อ / อีเมล / เบอร์โทร)</th>
                  <th>Role</th>
                  <th>ประเภทลูกค้า (สำหรับคิดส่วนลด)</th>
                  <th>สมัครเมื่อ</th>
                  <th>สถานะบัญชี</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10"><div className="spinner w-8 h-8 mx-auto" /></td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">
                      <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                      <p className="font-semibold text-gray-500">ไม่พบผู้ใช้งานที่ตรงกับเงื่อนไข</p>
                      <p className="text-xs text-gray-400 mt-1">ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง</p>
                      {hasActiveFilters && (
                        <button
                          onClick={handleResetFilters}
                          className="mt-3 btn-sm btn-outline text-xs inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          ล้างตัวกรอง
                        </button>
                      )}
                    </td>
                  </tr>
                ) : filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-primary-50/30 transition-colors">
                    <td>
                      <div className="flex items-center gap-3">
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-gray-100" />
                          : <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-forest font-bold text-sm">{u.full_name?.[0] || '?'}</div>
                        }
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                            <span className="truncate">{u.full_name || 'ไม่ระบุชื่อ'}</span>
                            {u.id === currentUser?.id && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-forest text-white font-semibold">
                                คุณ
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                            {u.email && <span>{u.email}</span>}
                            {u.email && u.phone && <span>•</span>}
                            {u.phone && <span>{u.phone}</span>}
                            {!u.email && !u.phone && <span>-</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={u.id === currentUser?.id}
                        onChange={e => updateRole(u.id, e.target.value)}
                        className={`text-xs px-2.5 py-1 rounded-xl border font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed
                          ${u.role === 'admin' ? 'border-purple-200 text-purple-700 bg-purple-50' :
                            u.role === 'farmer' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                            'border-sky-200 text-sky-700 bg-sky-50'}`}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>{r === 'admin' ? '👑 Admin' : r === 'farmer' ? '🧑‍🌾 Farmer' : '👤 Customer'}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {(() => {
                        const typeCfg = getCustomerTypeConfig(u.customer_type)
                        return (
                          <select
                            value={u.customer_type || 'ทั่วไป'}
                            onChange={e => updateCustomerType(u.id, e.target.value)}
                            className={`text-xs px-2.5 py-1 rounded-xl border font-bold transition-all cursor-pointer shadow-2xs ${typeCfg.badgeClass}`}
                            title="คลิกเพื่อเปลี่ยนประเภทลูกค้า"
                          >
                            <option value="ทั่วไป">👤 ทั่วไป</option>
                            <option value="ร้านอาหาร">🍽️ ร้านอาหาร</option>
                            <option value="โรงแรม">🏨 โรงแรม</option>
                            <option value="ขายส่ง">📦 ขายส่ง</option>
                            <option value="องค์กร">🏢 องค์กร</option>
                          </select>
                        )
                      })()}
                    </td>
                    <td className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTh(u.created_at)}
                    </td>
                    <td>
                      <span className={`badge ${u.is_banned ? 'badge-cancelled' : 'badge-completed'}`}>
                        {u.is_banned ? '⛔ ระงับ' : '✅ ปกติ'}
                      </span>
                    </td>
                    <td>
                      {u.id !== currentUser?.id ? (
                        <button
                          id={`btn-ban-${u.id}`}
                          onClick={() => toggleBan(u.id, u.is_banned)}
                          className={`btn-sm flex items-center gap-1 text-xs py-1 px-2.5 rounded-lg font-medium transition-all ${
                            u.is_banned
                              ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                              : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                          }`}
                        >
                          {u.is_banned ? (
                            <><UserCheck className="w-3.5 h-3.5" /> ปลดระงับ</>
                          ) : (
                            <><Ban className="w-3.5 h-3.5" /> ระงับ</>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 italic">บัญชีปัจจุบัน</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
