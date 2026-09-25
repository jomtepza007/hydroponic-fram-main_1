import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, ShoppingBag, AlertTriangle, CheckCircle2,
  ArrowRight, Leaf, Package, Home, Boxes, TrendingDown
} from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getAllOrders } from '../../api/orders'
import { getResources, getLowStockResources } from '../../api/resources'
import { supabase } from '../../api/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { formatDateTh } from '../../utils/dateUtils'

export default function FarmerDashboard() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [resources, setResources] = useState([])
  const [plantingCycles, setPlantingCycles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [ordersRes, stockRes, resourcesRes, cyclesRes] = await Promise.allSettled([
        getAllOrders(),
        getLowStockResources(),
        getResources(),
        supabase
          .from('planting_cycles')
          .select(`
            *,
            vegetable_types (name, unit),
            growing_areas (name, zone_code)
          `)
          .in('status', ['scheduled', 'seeding', 'growing'])
          .order('planting_start_date', { ascending: true })
          .limit(5)
          .then(({ data }) => data || []),
      ])
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value || [])
      if (stockRes.status === 'fulfilled') setLowStock(stockRes.value || [])
      if (resourcesRes.status === 'fulfilled') setResources(resourcesRes.value || [])
      if (cyclesRes.status === 'fulfilled') setPlantingCycles(cyclesRes.value || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const activeOrders = orders.filter(o =>
    ['confirmed', 'seeding', 'growing'].includes(o.status)
  )
  const readyOrders = orders.filter(o => o.status === 'ready')

  // สต็อกปกติ (ไม่ใกล้หมด)
  const okStock = resources.filter(r => r.current_qty > r.min_threshold)

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="page-title">แดชบอร์ดเกษตรกร</h1>
              <p className="page-subtitle">วันนี้ {formatDateTh(new Date())}</p>
            </div>
            <Link
              to="/"
              id="btn-back-home"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-primary-50 hover:text-forest hover:border-primary-300 transition-all shadow-sm"
            >
              <Home className="w-4 h-4" />
              กลับหน้าหลัก
            </Link>
          </div>

          {/* Low Stock Alert */}
          {lowStock.length > 0 && (
            <div className="alert-warning mb-6 animate-fade-in">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">⚠️ ทรัพยากรใกล้หมด {lowStock.length} รายการ</p>
                <p className="text-sm mt-0.5">
                  {lowStock.map(r => r.name).join(', ')} — กรุณาเติมสต็อก
                </p>
              </div>
              <Link to="/farmer/resources" className="ml-auto btn-sm btn-outline shrink-0">
                จัดการสต็อก
              </Link>
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'กำลังดำเนินการ', value: activeOrders.length, icon: Leaf, color: 'bg-blue-50 text-blue-600' },
              { label: 'พร้อมส่งมอบ', value: readyOrders.length, icon: CheckCircle2, color: 'bg-green-50 text-green-600' },
              { label: 'รอบปลูกที่ดำเนินการ', value: plantingCycles.length, icon: Calendar, color: 'bg-amber-50 text-amber-600' },
              { label: 'สต็อกใกล้หมด', value: lowStock.length, icon: AlertTriangle, color: 'bg-red-50 text-red-500' },
            ].map(stat => (
              <div key={stat.label} className="stat-card">
                <div className={`stat-icon ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                  <p className="text-xs text-gray-400">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Row 1: ออเดอร์ + รอบปลูก */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* ออเดอร์กำลังดำเนินการ */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-forest-dark">ออเดอร์ที่กำลังดำเนินการ</h2>
                <Link to="/farmer/orders" className="text-xs text-forest hover:underline flex items-center gap-1">
                  ดูทั้งหมด <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {loading ? (
                <div className="spinner w-6 h-6 mx-auto" />
              ) : activeOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-300">
                  <Package className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">ไม่มีออเดอร์ที่กำลังดำเนินการ</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeOrders.slice(0, 5).map(order => (
                    <Link
                      key={order.id}
                      to={`/farmer/orders/${order.id}`}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-primary-50 transition-colors group"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-700">#{order.id.slice(0,8).toUpperCase()}</p>
                        <p className="text-xs text-gray-400">รับ {formatDateTh(order.pickup_date)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <OrderStatusBadge status={order.status} />
                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-forest" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* ตารางปลูกที่กำลังดำเนินการ */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-forest-dark">ตารางปลูกที่กำลังดำเนินการ</h2>
                <Link to="/farmer/schedule" className="text-xs text-forest hover:underline flex items-center gap-1">
                  ดูทั้งหมด <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {loading ? (
                <div className="spinner w-6 h-6 mx-auto" />
              ) : plantingCycles.length === 0 ? (
                <div className="text-center py-8 text-gray-300">
                  <Calendar className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">ไม่มีรอบปลูกที่กำลังดำเนินการ</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {plantingCycles.map(cycle => (
                    <div
                      key={cycle.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 border border-amber-100"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-700">
                          {cycle.vegetable_types?.name || '—'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {cycle.growing_areas?.name || '—'}
                          {cycle.planting_start_date && ` · เริ่ม ${formatDateTh(cycle.planting_start_date)}`}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium
                        ${cycle.status === 'growing' ? 'bg-green-100 text-green-700' :
                          cycle.status === 'seeding' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'}`}>
                        {cycle.status === 'scheduled' ? 'กำหนดการ' :
                         cycle.status === 'seeding' ? 'เพาะเมล็ด' :
                         cycle.status === 'growing' ? 'กำลังปลูก' : cycle.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: พร้อมส่งมอบ + สต็อกทรัพยากร */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* พร้อมส่งมอบ */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-forest-dark">พร้อมส่งมอบ 🎉</h2>
                <Link to="/farmer/orders" className="text-xs text-forest hover:underline flex items-center gap-1">
                  ดูทั้งหมด <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {loading ? (
                <div className="spinner w-6 h-6 mx-auto" />
              ) : readyOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-300">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">ไม่มีออเดอร์พร้อมส่งมอบ</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {readyOrders.slice(0, 5).map(order => (
                    <Link
                      key={order.id}
                      to={`/farmer/orders/${order.id}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-green-50 hover:bg-green-100 transition-colors group"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-700">#{order.id.slice(0,8).toUpperCase()}</p>
                        <p className="text-xs text-gray-400">รับ {formatDateTh(order.pickup_date)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <OrderStatusBadge status="ready" />
                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-forest" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* สต็อกทรัพยากร */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-forest-dark">สต็อกทรัพยากร</h2>
                <Link to="/farmer/resources" className="text-xs text-forest hover:underline flex items-center gap-1">
                  จัดการ <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {loading ? (
                <div className="spinner w-6 h-6 mx-auto" />
              ) : resources.length === 0 ? (
                <div className="text-center py-8 text-gray-300">
                  <Boxes className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">ไม่มีข้อมูลทรัพยากร</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {resources.slice(0, 6).map(r => {
                    const pct = r.max_qty > 0 ? Math.min(100, (r.current_qty / r.max_qty) * 100) : 0
                    const isLow = r.current_qty <= r.min_threshold
                    return (
                      <div key={r.id} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {isLow && <TrendingDown className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                            <p className={`text-sm font-medium ${isLow ? 'text-red-600' : 'text-gray-700'}`}>
                              {r.name}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">
                            {r.current_qty} / {r.max_qty} {r.unit}
                          </p>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isLow ? 'bg-red-400' : pct > 50 ? 'bg-forest' : 'bg-amber-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                  {resources.length > 6 && (
                    <p className="text-xs text-gray-400 text-center pt-1">
                      และอีก {resources.length - 6} รายการ
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
