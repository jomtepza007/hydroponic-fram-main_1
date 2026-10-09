import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search, History, Package, Mail, Phone, CheckCircle2, XCircle, Download } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import OrderDateFilter, { filterOrdersByDate } from '../../components/orders/OrderDateFilter'
import { getAllOrders } from '../../api/orders'
import { exportOrdersToExcel } from '../../utils/csvExport'
import {
  formatDateTh,
  isEquipmentOrder,
  getCustomerDisplayName,
  getCustomerPhone,
  getCustomerEmail,
} from '../../utils/dateUtils'
import { useAuth } from '../../context/AuthContext'

const CATEGORY_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'vegetable', label: '🥬 ผักไฮโดรโปนิก' },
  { value: 'equipment', label: '🌱 อุปกรณ์ & ชุดปลูก' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'completed', label: '✅ เสร็จสิ้น' },
  { value: 'cancelled', label: '❌ ยกเลิก' },
]

export default function FarmerOrderHistory() {
  const { isAdmin } = useAuth()
  const [orders, setOrders] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [dateType, setDateType] = useState('created')
  const [datePreset, setDatePreset] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    loadOrders()
  }, [])

  useEffect(() => {
    let result = orders

    if (categoryFilter === 'equipment') {
      result = result.filter(o => isEquipmentOrder(o))
    } else if (categoryFilter === 'vegetable') {
      result = result.filter(o => !isEquipmentOrder(o))
    }

    if (statusFilter !== 'all') {
      result = result.filter(o => o.status === statusFilter)
    }

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

    // Filter by Date
    result = filterOrdersByDate(result, { dateType, datePreset, startDate, endDate })

    setFiltered(result)
  }, [orders, categoryFilter, statusFilter, searchTerm, dateType, datePreset, startDate, endDate])

  async function loadOrders() {
    try {
      // โหลดเฉพาะ completed และ cancelled
      const [completed, cancelled] = await Promise.all([
        getAllOrders({ status: 'completed' }),
        getAllOrders({ status: 'cancelled' }),
      ])
      const all = [...(completed || []), ...(cancelled || [])]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setOrders(all)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const completedCount = orders.filter(o => o.status === 'completed').length
  const cancelledCount = orders.filter(o => o.status === 'cancelled').length
  const detailBase = isAdmin ? '/admin/orders' : '/farmer/orders'

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-5 lg:p-7">
        <div className="w-full">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <History className="w-6 h-6 text-forest" />
                <h1 className="page-title">ประวัติการสั่งซื้อ</h1>
              </div>
              <p className="page-subtitle">ออเดอร์ที่เสร็จสิ้นและยกเลิกทั้งหมด</p>
            </div>
            {/* Search & Export */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative w-full sm:w-64">
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
                id="btn-export-history-excel"
                onClick={() => exportOrdersToExcel(filtered)}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-primary-50 hover:border-forest hover:text-forest transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="ส่งออกประวัติออเดอร์ที่กรองอยู่เป็น Excel (.xlsx)"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>ส่งออก Excel</span>
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card flex items-center gap-3 p-4">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
                <p className="text-xs text-gray-500">เสร็จสิ้นแล้ว</p>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{cancelledCount}</p>
                <p className="text-xs text-gray-500">ยกเลิกแล้ว</p>
              </div>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200 pb-3">
            {CATEGORY_FILTERS.map(cat => {
              const count =
                cat.value === 'all'
                  ? orders.length
                  : cat.value === 'vegetable'
                  ? orders.filter(o => !isEquipmentOrder(o)).length
                  : orders.filter(o => isEquipmentOrder(o)).length
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(cat.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2
                    ${categoryFilter === cat.value
                      ? 'bg-forest text-white shadow-sm'
                      : 'bg-white text-gray-600 hover:bg-primary-50 border border-gray-200'
                    }`}
                >
                  {cat.label}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
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
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${statusFilter === f.value
                    ? 'bg-forest text-white'
                    : 'bg-white text-gray-600 hover:bg-primary-50 border border-gray-200'
                  }`}
              >
                {f.label}
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
            isHistory={true}
            totalFilteredCount={filtered.length}
          />

          {/* Table */}
          <div className="table-wrapper">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">ออเดอร์</th>
                  <th className="whitespace-nowrap min-w-[140px]">ลูกค้า</th>
                  <th className="whitespace-nowrap">หมวดหมู่</th>
                  <th className="min-w-[110px]">รายการสินค้า</th>
                  <th className="whitespace-nowrap">วันรับ/จัดส่ง</th>
                  <th className="whitespace-nowrap">ยอดรวม</th>
                  <th className="whitespace-nowrap">สถานะ</th>
                  <th className="whitespace-nowrap">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10">
                      <div className="spinner w-8 h-8 mx-auto" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <History className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>ยังไม่มีประวัติออเดอร์</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(order => {
                    const isEquip = isEquipmentOrder(order)
                    const customerEmail = getCustomerEmail(order)
                    let customerName = getCustomerDisplayName(order)
                    if ((customerName === 'ลูกค้าทั่วไป' || customerName.startsWith('ลูกค้า (')) && customerEmail) {
                      customerName = customerEmail.split('@')[0]
                    }
                    const customerPhone = getCustomerPhone(order)

                    return (
                      <tr key={order.id} className="hover:bg-primary-50/40 transition-colors">
                        {/* Order ID */}
                        <td className="whitespace-nowrap">
                          <p className="font-bold text-gray-800 text-sm">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-400">{formatDateTh(order.created_at)}</p>
                        </td>

                        {/* Customer */}
                        <td>
                          <div className="flex items-center gap-2.5">
                            {order.profiles?.avatar_url ? (
                              <img
                                src={order.profiles.avatar_url}
                                alt={customerName}
                                className="w-8 h-8 rounded-full object-cover border border-gray-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-mint-100 text-forest font-bold flex items-center justify-center text-xs">
                                {customerName.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 text-sm truncate max-w-[150px]" title={customerName}>
                                {customerName}
                              </p>
                              {customerEmail && (
                                <p className="text-xs text-emerald-700 font-medium flex items-center gap-1 truncate max-w-[150px]">
                                  <Mail className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{customerEmail}</span>
                                </p>
                              )}
                              {customerPhone && (
                                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 flex-shrink-0" />
                                  <span>{customerPhone}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td>
                          {isEquip ? (
                            <span className="badge bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                              🌱 อุปกรณ์
                            </span>
                          ) : (
                            <span className="badge bg-green-50 text-green-700 border border-green-200 text-xs">
                              🥬 ผักไฮโดร
                            </span>
                          )}
                        </td>

                        {/* Items */}
                        <td>
                          <p className="text-sm text-gray-700 max-w-[180px] truncate font-medium">
                            {order.order_items?.map(i => i.vegetable_types?.name).join(', ') || '-'}
                          </p>
                        </td>

                        {/* Pickup Date */}
                        <td>
                          <p className="text-sm font-semibold text-forest">{formatDateTh(order.pickup_date)}</p>
                          <p className="text-[11px] text-gray-400">{isEquip ? 'กำหนดส่ง' : 'วันรับ'}</p>
                        </td>

                        {/* Total */}
                        <td>
                          <p className="font-semibold text-forest text-sm">
                            ฿{Number(order.total_amount).toLocaleString()}
                          </p>
                        </td>

                        {/* Status */}
                        <td className="whitespace-nowrap">
                          <OrderStatusBadge status={order.status} isEquipment={isEquip} />
                        </td>

                        {/* Action */}
                        <td className="whitespace-nowrap">
                          <Link
                            to={`${detailBase}/${order.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-forest hover:bg-forest hover:text-white hover:border-forest transition-all shadow-sm whitespace-nowrap"
                          >
                            <span className="whitespace-nowrap">ดูรายละเอียด</span>
                            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
