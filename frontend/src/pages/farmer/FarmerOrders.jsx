import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search, User, Phone, Package, Leaf, Mail } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getAllOrders } from '../../api/orders'
import {
  formatDateTh,
  isEquipmentOrder,
  getCustomerDisplayName,
  getCustomerPhone,
  getCustomerEmail,
} from '../../utils/dateUtils'

const STATUS_FILTERS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รอดำเนินการ' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'seeding', label: 'เพาะเมล็ด' },
  { value: 'growing', label: 'ลงรางปลูก' },
  { value: 'ready', label: 'พร้อมส่งมอบ/รอจัดส่ง' },
  { value: 'completed', label: 'เสร็จสิ้น/จัดส่งแล้ว' },
]

const CATEGORY_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'vegetable', label: '🥬 ผักไฮโดรโปนิก' },
  { value: 'equipment', label: '🌱 อุปกรณ์ & ชุดปลูก' },
]

export default function FarmerOrders() {
  const [orders, setOrders] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadOrders()
  }, [])

  useEffect(() => {
    let result = orders

    // Filter by status
    if (statusFilter) {
      result = result.filter(o => o.status === statusFilter)
    }

    // Filter by category
    if (categoryFilter === 'equipment') {
      result = result.filter(o => isEquipmentOrder(o))
    } else if (categoryFilter === 'vegetable') {
      result = result.filter(o => !isEquipmentOrder(o))
    }

    // Search by customer name, order ID, or product name
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(o => {
        const idMatch = o.id.toLowerCase().includes(q)
        const nameMatch = getCustomerDisplayName(o).toLowerCase().includes(q)
        const phoneMatch = getCustomerPhone(o).toLowerCase().includes(q)
        const itemsMatch = o.order_items?.some(i =>
          i.vegetable_types?.name?.toLowerCase().includes(q)
        )
        return idMatch || nameMatch || phoneMatch || itemsMatch
      })
    }

    setFiltered(result)
  }, [orders, statusFilter, categoryFilter, searchTerm])

  async function loadOrders() {
    try {
      const data = await getAllOrders()
      setOrders(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Counts for category badges
  const vegCount = orders.filter(o => !isEquipmentOrder(o)).length
  const equipCount = orders.filter(o => isEquipmentOrder(o)).length

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="page-title">รายการออเดอร์</h1>
              <p className="page-subtitle">จัดการและติดตามออเดอร์ผักและอุปกรณ์ทั้งหมด</p>
            </div>
            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า, เลขออเดอร์..."
                className="input pl-9 text-sm"
              />
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200 pb-3">
            {CATEGORY_FILTERS.map(cat => {
              const count =
                cat.value === 'all' ? orders.length : cat.value === 'vegetable' ? vegCount : equipCount
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
          <div className="flex gap-1.5 flex-wrap mb-6">
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

          {/* Table */}
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>ออเดอร์</th>
                  <th>ลูกค้า</th>
                  <th>หมวดหมู่</th>
                  <th>รายการสินค้า</th>
                  <th>วันรับ/จัดส่ง</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10">
                      <div className="spinner w-8 h-8 mx-auto" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>ไม่พบออเดอร์ตามเงื่อนไขที่เลือก</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(order => {
                    const isEquip = isEquipmentOrder(order)
                    const customerEmail = getCustomerEmail(order)
                    let customerName = getCustomerDisplayName(order)

                    // ถ้าชื่อลูกค้ายังเป็นค่า default หรือชื่อย่อ แต่มี email ให้แสดงชื่อตาม email (ชื่อก่อน @)
                    if ((customerName === 'ลูกค้าทั่วไป' || customerName.startsWith('ลูกค้า (')) && customerEmail) {
                      customerName = customerEmail.split('@')[0]
                    }

                    const customerPhone = getCustomerPhone(order)

                    return (
                      <tr key={order.id} className="hover:bg-primary-50/40 transition-colors">
                        {/* Order ID */}
                        <td>
                          <p className="font-bold text-gray-800 text-sm">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-400">{formatDateTh(order.created_at)}</p>
                        </td>

                        {/* Customer Name */}
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
                              <p className="font-semibold text-gray-800 text-sm truncate max-w-[170px]" title={customerName}>
                                {customerName}
                              </p>
                              {customerEmail && (
                                <p className="text-xs text-emerald-700 font-medium flex items-center gap-1 truncate max-w-[170px]" title={customerEmail}>
                                  <Mail className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                  <span className="truncate">{customerEmail}</span>
                                </p>
                              )}
                              {customerPhone ? (
                                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                  <span>{customerPhone}</span>
                                </p>
                              ) : (
                                !customerEmail && <p className="text-[11px] text-gray-300">ลูกค้าสมาชิก</p>
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

                        {/* Order Items */}
                        <td>
                          <p className="text-sm text-gray-700 max-w-[200px] truncate font-medium">
                            {order.order_items?.map(i => i.vegetable_types?.name).join(', ') || '-'}
                          </p>
                          <p className="text-xs text-gray-400">
                            รวม ฿{Number(order.total_amount).toLocaleString()}
                          </p>
                        </td>

                        {/* Pickup / Delivery Date */}
                        <td>
                          <p className="text-sm font-semibold text-forest">
                            {formatDateTh(order.pickup_date)}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {isEquip ? 'กำหนดส่งพัสดุ' : 'วันรับสินค้า'}
                          </p>
                        </td>

                        {/* Status */}
                        <td>
                          <OrderStatusBadge status={order.status} isEquipment={isEquip} />
                        </td>

                        {/* Action Link */}
                        <td>
                          <Link
                            to={`/farmer/orders/${order.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-forest hover:bg-forest hover:text-white hover:border-forest transition-all shadow-sm"
                          >
                            จัดการ <ChevronRight className="w-3.5 h-3.5" />
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
