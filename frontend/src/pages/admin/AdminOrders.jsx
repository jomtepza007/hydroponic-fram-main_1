import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ChevronRight, Download, History, Mail, Phone, Search } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import OrderDateFilter, { filterOrdersByDate } from '../../components/orders/OrderDateFilter'
import { getAllOrders, updateOrderStatus } from '../../api/orders'
import { exportOrdersToExcel, exportOrdersToCSV } from '../../utils/csvExport'
import {
  formatDateTh,
  getCustomerDisplayName,
  getCustomerEmail,
  getCustomerPhone,
  isEquipmentOrder,
  EQUIPMENT_STATUS_LABELS,
} from '../../utils/dateUtils'
import { getCustomerTypeConfig } from '../../utils/customerTypeUtils'
import toast from 'react-hot-toast'

// ไม่รวม completed/cancelled ในรายการหลัก — ดูได้ที่หน้าประวัติ
const STATUSES = ['', 'waiting_cycle', 'pending', 'confirmed', 'seeding', 'growing', 'ready']
const LABELS = {
  '': 'ทั้งหมด', waiting_cycle: 'รอสร้างรอบปลูก', pending: 'รอดำเนินการ', confirmed: 'ยืนยัน', seeding: 'เพาะเมล็ด',
  growing: 'ลงราง', ready: 'พร้อมส่ง', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก'
}

const CATEGORY_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'vegetable', label: '🥬 ผักไฮโดรโปนิก' },
  { value: 'equipment', label: '🌱 อุปกรณ์ & ชุดปลูก' },
]

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [dateType, setDateType] = useState('pickup')
  const [datePreset, setDatePreset] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const d = await getAllOrders()
      // กรองเฉพาะที่ยังไม่เสร็จสิ้น
      setOrders((d || []).filter(o => o.status !== 'completed' && o.status !== 'cancelled'))
    }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const vegCount = useMemo(() => orders.filter(o => !isEquipmentOrder(o)).length, [orders])
  const equipCount = useMemo(() => orders.filter(o => isEquipmentOrder(o)).length, [orders])

  const filtered = useMemo(() => {
    let result = orders

    // 1. หมวดหมู่สินค้า
    if (categoryFilter === 'equipment') {
      result = result.filter(o => isEquipmentOrder(o))
    } else if (categoryFilter === 'vegetable') {
      result = result.filter(o => !isEquipmentOrder(o))
    }

    // 2. สถานะออเดอร์
    if (statusFilter) {
      result = result.filter(o => o.status === statusFilter)
    }

    // 3. คำค้นหา (Search)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(o => {
        const idMatch = o.id.toLowerCase().includes(q)
        const nameMatch = getCustomerDisplayName(o).toLowerCase().includes(q)
        const phoneMatch = getCustomerPhone(o).toLowerCase().includes(q)
        const emailMatch = getCustomerEmail(o).toLowerCase().includes(q)
        const itemsMatch = o.order_items?.some(i =>
          i.vegetable_types?.name?.toLowerCase().includes(q)
        )
        return idMatch || nameMatch || phoneMatch || emailMatch || itemsMatch
      })
    }

    // 4. ตัวกรองวันที่ (Date Filter)
    return filterOrdersByDate(result, { dateType, datePreset, startDate, endDate })
  }, [orders, categoryFilter, statusFilter, searchTerm, dateType, datePreset, startDate, endDate])

  async function handleStatus(id, status) {
    const o = orders.find(item => item.id === id)
    const isEq = isEquipmentOrder(o)
    try {
      await updateOrderStatus(id, status, '', isEq)
      toast.success('อัปเดตสำเร็จ')
      await load()
    } catch { toast.error('เกิดข้อผิดพลาด') }
  }


  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-5 lg:p-7">
        <div className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="page-title">จัดการออเดอร์ทั้งหมด</h1>
              <p className="page-subtitle">ออเดอร์ที่กำลังดำเนินการอยู่</p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Search Bar */}
              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาชื่อลูกค้า, เลขออเดอร์..."
                  className="input pl-9 text-xs w-full py-2"
                />
              </div>

              <button
                type="button"
                id="btn-export-orders-excel"
                onClick={() => exportOrdersToExcel(filtered)}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-primary-50 hover:border-forest hover:text-forest transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="ส่งออกรายการออเดอร์ที่กรองอยู่เป็น Excel (.xlsx)"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>ส่งออก Excel</span>
              </button>
              <Link
                to="/admin/order-history"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-primary-50 hover:border-forest hover:text-forest transition-all shadow-sm"
              >
                <History className="w-4 h-4" />
                <span>ประวัติ</span>
              </Link>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 mb-3 border-b border-gray-200 pb-2.5">
            {CATEGORY_FILTERS.map(cat => {
              const count =
                cat.value === 'all' ? orders.length : cat.value === 'vegetable' ? vegCount : equipCount
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(cat.value)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5
                    ${categoryFilter === cat.value
                      ? 'bg-forest text-white shadow-2xs'
                      : 'bg-white text-gray-600 hover:bg-primary-50 border border-gray-200'
                    }`}
                >
                  {cat.label}
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      categoryFilter === cat.value
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Status Filters */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all
                  ${statusFilter === s ? 'bg-forest text-white shadow-2xs' : 'bg-white text-gray-600 border border-gray-200 hover:bg-primary-50'}`}>
                {LABELS[s]}
              </button>
            ))}
          </div>

          {/* Date Filter Bar */}
          <OrderDateFilter
            dateType={dateType}
            onDateTypeChange={setDateType}
            datePreset={datePreset}
            onDatePresetChange={setDatePreset}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            onReset={() => {
              setDatePreset('all')
              setStartDate('')
              setEndDate('')
            }}
            isHistory={false}
            totalFilteredCount={filtered.length}
          />

          <div className="table-wrapper">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">ออเดอร์</th>
                  <th className="whitespace-nowrap min-w-[140px]">ลูกค้า</th>
                  <th className="min-w-[110px]">รายการ</th>
                  <th className="whitespace-nowrap">วันรับ</th>
                  <th className="whitespace-nowrap">ยอด</th>
                  <th className="whitespace-nowrap">สถานะ</th>
                  <th className="whitespace-nowrap">เปลี่ยนสถานะ</th>
                  <th className="whitespace-nowrap">จัดการ</th>
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
                  const typeCfg = getCustomerTypeConfig(o.profiles?.customer_type)

                  return (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap">
                        <p className="font-semibold text-sm">#{o.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-xs text-gray-400">{formatDateTh(o.created_at)}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800">{customerName}</p>
                          <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${typeCfg.badgeClass} whitespace-nowrap`}>
                            <span>{typeCfg.emoji}</span>
                            <span>{typeCfg.label}</span>
                          </span>
                        </div>
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
                      <td className="text-sm text-gray-700 whitespace-nowrap">
                        <p className="font-medium text-gray-800">{formatDateTh(o.pickup_date)}</p>
                        {isEquipmentOrder(o) && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium inline-block mt-0.5 whitespace-nowrap">
                            จัดส่งพัสดุ
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap sm:text-left">
                        {o.final_amount != null && Number(o.final_amount) < Number(o.total_amount) ? (
                          <div>
                            <span className="text-xs text-gray-400 line-through block">฿{Number(o.total_amount).toLocaleString()}</span>
                            <span className="text-forest font-bold text-sm">฿{Number(o.final_amount).toLocaleString()}</span>
                            <span className="text-[10px] text-emerald-600 font-semibold block whitespace-nowrap">
                              {Number(o.order_discount_amount) > 0 ? 'ลดพิเศษทั้งออเดอร์' : 'ลดแล้ว'}
                            </span>
                          </div>
                        ) : (
                          <span className="font-semibold text-forest">฿{Number(o.total_amount).toLocaleString()}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <OrderStatusBadge status={o.status} isEquipment={isEquipmentOrder(o)} />
                      </td>
                      <td className="whitespace-nowrap">
                        {o.status === 'waiting_cycle' ? (
                          // ล็อกไม่ให้เปลี่ยนสถานะ — ต้องไปยืนยันสร้างรอบปลูกก่อน
                          <div className="flex items-center">
                            <span className="text-xs px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-medium whitespace-nowrap inline-flex items-center gap-1 shadow-2xs">
                              🌱 ยืนยันรอบปลูกก่อน
                            </span>
                          </div>
                        ) : (
                          <select
                            onChange={e => handleStatus(o.id, e.target.value)}
                            value={o.status}
                            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white cursor-pointer whitespace-nowrap min-w-[120px] font-medium shadow-2xs hover:border-forest transition-colors"
                          >
                            {(isEquipmentOrder(o)
                              ? ['pending', 'confirmed', 'ready', 'completed', 'cancelled']
                              : ['pending', 'confirmed', 'seeding', 'growing', 'ready', 'completed', 'cancelled']
                            ).map(s => (
                              <option key={s} value={s}>
                                {isEquipmentOrder(o) ? (EQUIPMENT_STATUS_LABELS[s] || LABELS[s] || s) : (LABELS[s] || s)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <Link
                          to={`/farmer/orders/${o.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-forest hover:bg-forest hover:text-white hover:border-forest transition-all shadow-sm whitespace-nowrap"
                        >
                          <Camera className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="whitespace-nowrap">จัดการ & อัปโหลดรูป</span>
                          <ChevronRight className="w-3 h-3 flex-shrink-0" />
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
