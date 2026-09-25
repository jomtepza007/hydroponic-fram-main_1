import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ChevronRight, Mail, Phone } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getAllOrders, updateOrderStatus } from '../../api/orders'
import {
  formatDateTh,
  getCustomerDisplayName,
  getCustomerEmail,
  getCustomerPhone,
  isEquipmentOrder,
} from '../../utils/dateUtils'
import toast from 'react-hot-toast'

const STATUSES = ['', 'pending', 'confirmed', 'seeding', 'growing', 'ready', 'completed', 'cancelled']
const LABELS = {
  '': 'ทั้งหมด', pending: 'รอดำเนินการ', confirmed: 'ยืนยัน', seeding: 'เพาะเมล็ด',
  growing: 'ลงราง', ready: 'พร้อมส่ง', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก'
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try { const d = await getAllOrders(); setOrders(d || []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = statusFilter ? orders.filter(o => o.status === statusFilter) : orders

  async function handleStatus(id, status) {
    try {
      await updateOrderStatus(id, status)
      toast.success('อัปเดตสำเร็จ')
      await load()
    } catch { toast.error('เกิดข้อผิดพลาด') }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="page-title mb-2">จัดการออเดอร์ทั้งหมด</h1>
          <p className="page-subtitle mb-6">ดูและอัปเดตสถานะออเดอร์ทั้งระบบ</p>

          <div className="flex gap-2 flex-wrap mb-6">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all
                  ${statusFilter === s ? 'bg-forest text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-primary-50'}`}>
                {LABELS[s]}
              </button>
            ))}
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>ออเดอร์</th><th>ลูกค้า</th><th>รายการ</th>
                  <th>วันรับ</th><th>ยอด</th><th>สถานะ</th><th>เปลี่ยนสถานะ</th><th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-10"><div className="spinner w-8 h-8 mx-auto" /></td></tr>
                ) : filtered.map(o => {
                  const customerEmail = getCustomerEmail(o)
                  let customerName = getCustomerDisplayName(o)
                  if ((customerName === 'ลูกค้าทั่วไป' || customerName.startsWith('ลูกค้า (')) && customerEmail) {
                    customerName = customerEmail.split('@')[0]
                  }
                  const customerPhone = getCustomerPhone(o)

                  return (
                    <tr key={o.id}>
                      <td>
                        <p className="font-semibold text-sm">#{o.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-xs text-gray-400">{formatDateTh(o.created_at)}</p>
                      </td>
                      <td>
                        <p className="text-sm font-semibold text-gray-800">{customerName}</p>
                        {customerEmail && (
                          <p className="text-xs text-emerald-700 flex items-center gap-1 font-medium mt-0.5">
                            <Mail className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            <span className="truncate max-w-[150px]">{customerEmail}</span>
                          </p>
                        )}
                        {customerPhone && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span>{customerPhone}</span>
                          </p>
                        )}
                      </td>
                      <td className="text-sm text-gray-600">
                        {o.order_items?.map(i => i.vegetable_types?.name).join(', ') || '-'}
                      </td>
                      <td className="text-sm font-medium text-forest">{formatDateTh(o.pickup_date)}</td>
                      <td className="font-semibold text-forest">฿{Number(o.total_amount).toLocaleString()}</td>
                      <td><OrderStatusBadge status={o.status} isEquipment={isEquipmentOrder(o)} /></td>
                      <td>
                        <select
                          onChange={e => handleStatus(o.id, e.target.value)}
                          value={o.status}
                          className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white cursor-pointer"
                        >
                          {['pending', 'confirmed', 'seeding', 'growing', 'ready', 'completed', 'cancelled'].map(s => (
                            <option key={s} value={s}>{LABELS[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <Link
                          to={`/farmer/orders/${o.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-forest hover:bg-forest hover:text-white hover:border-forest transition-all shadow-sm"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>จัดการ & อัปโหลดรูป</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
