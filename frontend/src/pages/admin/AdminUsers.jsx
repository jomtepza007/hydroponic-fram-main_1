import { useEffect, useState } from 'react'
import { supabase } from '../../api/supabaseClient'
import { Shield, Ban, UserCheck, ChevronDown } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { useAuth } from '../../context/AuthContext'
import { formatDateTh } from '../../utils/dateUtils'
import toast from 'react-hot-toast'

const ROLES = ['customer', 'farmer', 'admin']

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="page-title">จัดการผู้ใช้งาน</h1>
            <p className="page-subtitle">เปลี่ยน Role และจัดการสิทธิ์ผู้ใช้</p>
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>ผู้ใช้</th>
                  <th>Role</th>
                  <th>สมัครเมื่อ</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-10"><div className="spinner w-8 h-8 mx-auto" /></td></tr>
                ) : users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                          : <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-forest font-bold text-sm">{u.full_name?.[0] || '?'}</div>
                        }
                        <div>
                          <p className="font-medium text-gray-800">
                            {u.full_name || 'ไม่ระบุชื่อ'}
                            {u.id === currentUser?.id && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-forest font-semibold">
                                คุณ
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">{u.phone || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={u.id === currentUser?.id}
                        onChange={e => updateRole(u.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-lg border font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed
                          ${u.role === 'admin' ? 'border-purple-200 text-purple-700 bg-purple-50' :
                            u.role === 'farmer' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                            'border-sky-200 text-sky-700 bg-sky-50'}`}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>{r === 'admin' ? '👑 Admin' : r === 'farmer' ? '🧑‍🌾 Farmer' : '👤 Customer'}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-sm text-gray-500">{formatDateTh(u.created_at)}</td>
                    <td>
                      <span className={`badge ${u.is_banned ? 'badge-cancelled' : 'badge-ready'}`}>
                        {u.is_banned ? '🚫 ถูก Ban' : '✓ ปกติ'}
                      </span>
                    </td>
                    <td>
                      {u.id === currentUser?.id ? (
                        <span className="text-xs text-gray-400 italic">บัญชีปัจจุบัน</span>
                      ) : (
                        <button
                          onClick={() => toggleBan(u.id, u.is_banned)}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                            ${u.is_banned
                              ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                        >
                          {u.is_banned ? <><UserCheck className="w-3.5 h-3.5" /> Unban</> : <><Ban className="w-3.5 h-3.5" /> Ban</>}
                        </button>
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
