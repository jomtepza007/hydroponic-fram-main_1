import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, ShoppingBag, AlertTriangle, CheckCircle2,
  ArrowRight, Leaf, Package, Home, Boxes, TrendingDown,
  Clock, Sparkles, AlertCircle, MapPin
} from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getAllOrders, cleanupDesyncedPlantingCycles } from '../../api/orders'
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
  const [growingAreas, setGrowingAreas] = useState([])
  const [allActiveCycles, setAllActiveCycles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      try {
        await cleanupDesyncedPlantingCycles()
      } catch (cleanErr) {
        console.warn('FarmerDashboard cleanup desynced cycles warning:', cleanErr)
      }

      const [ordersRes, stockRes, resourcesRes, cyclesRes, areasRes, activeCyclesRes] = await Promise.allSettled([
        getAllOrders(),
        getLowStockResources(),
        getResources(),
        supabase
          .from('planting_cycles')
          .select(`
            *,
            vegetable_types (name, unit),
            growing_areas (name, zone_code),
            order_items (order_id, orders (id, status))
          `)
          .in('status', ['scheduled', 'seeding', 'growing'])
          .order('planting_start_date', { ascending: true })
          .then(({ data }) => {
            return (data || []).filter(c => {
              if ((Number(c.slots_used) || 0) <= 0) return false
              if (!c.order_item_id && !c.vegetable_type_id) return false
              if (c.order_item_id && (!c.order_items || !c.order_items?.orders)) return false
              const ordStatus = c.order_items?.orders?.status
              if (ordStatus === 'completed' || ordStatus === 'delivered' || ordStatus === 'cancelled') return false
              return true
            }).slice(0, 5)
          }),
        supabase
          .from('growing_areas')
          .select('*, vegetable_types(name)')
          .eq('is_active', true)
          .order('name')
          .then(({ data }) => data || []),
        supabase
          .from('planting_cycles')
          .select('id, growing_area_id, slots_used, status, planting_start_date, expected_harvest_date, vegetable_type_id, order_item_id, order_items(order_id, orders(id, status))')
          .in('status', ['scheduled', 'seeding', 'growing'])
          .then(({ data }) => {
            return (data || []).filter(c => {
              if ((Number(c.slots_used) || 0) <= 0) return false
              if (!c.order_item_id && !c.vegetable_type_id) return false
              if (c.order_item_id && (!c.order_items || !c.order_items?.orders)) return false
              const ordStatus = c.order_items?.orders?.status
              if (ordStatus === 'completed' || ordStatus === 'delivered' || ordStatus === 'cancelled') return false
              return true
            })
          }),
      ])
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value || [])
      if (stockRes.status === 'fulfilled') setLowStock(stockRes.value || [])
      if (resourcesRes.status === 'fulfilled') setResources(resourcesRes.value || [])
      if (cyclesRes.status === 'fulfilled') setPlantingCycles(cyclesRes.value || [])
      if (areasRes.status === 'fulfilled') setGrowingAreas(areasRes.value || [])
      if (activeCyclesRes.status === 'fulfilled') setAllActiveCycles(activeCyclesRes.value || [])
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
  const waitingCycleOrders = orders.filter(o => o.status === 'waiting_cycle')

  // คำนวณความจุแปลงปลูกแต่ละโซนที่กำลังปลูกจริงวันนี้ที่ใกล้เต็ม (>= 80% หรือ >= 90%)
  const todayStr = new Date().toISOString().split('T')[0]
  const capacityAlerts = growingAreas.map(area => {
    const areaCycles = allActiveCycles.filter(c => {
      if (c.growing_area_id !== area.id) return false
      if (c.status !== 'seeding' && c.status !== 'growing') return false
      if (c.expected_harvest_date && c.expected_harvest_date < todayStr) return false
      return true
    })
    const used = areaCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
    const total = Number(area.total_slots) || 100
    const rate = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
    return {
      ...area,
      used_slots: used,
      total_slots: total,
      rate,
    }
  }).filter(a => a.rate >= 80).sort((a, b) => b.rate - a.rate)

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

          {/* New Orders Waiting Cycle Alert Banner */}
          {waitingCycleOrders.length > 0 && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-up">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
                  <Sparkles className="w-6 h-6 text-white animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-base">มีออเดอร์ใหม่รอยืนยันรอบปลูก {waitingCycleOrders.length} รายการ!</p>
                    <span className="px-2 py-0.5 rounded-full bg-white text-orange-600 text-xs font-bold animate-bounce">
                      waiting_cycle
                    </span>
                  </div>
                  <p className="text-xs text-white/90 mt-0.5">
                    มีคำสั่งซื้อใหม่ที่ยังไม่ได้สร้างรอบปลูก กรุณายืนยันรอบปลูกเพื่อให้ระบบเริ่มกระบวนการ
                  </p>
                </div>
              </div>
              <Link
                to="/farmer/schedule"
                className="btn bg-white text-orange-600 hover:bg-orange-50 font-bold px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 whitespace-nowrap self-start sm:self-auto transition-all transform hover:scale-105"
              >
                <Calendar className="w-4 h-4" />
                ไปจัดรอบปลูกทันที →
              </Link>
            </div>
          )}

          {/* Farm Capacity Near Full Alert (>= 80% / 90%) */}
          {capacityAlerts.length > 0 && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 shadow-sm animate-slide-up">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-rose-900">
                      ⚠️ แจ้งเตือนความจุแปลงปลูกใกล้เต็ม ({capacityAlerts.length} แปลงเกิน 80%)
                    </h3>
                    <p className="text-xs text-rose-700 mt-0.5">
                      พื้นที่แปลงปลูกด้านล่างนี้มีการจองพื้นที่สูง กรุณาเตรียมขยายรอบปลูกหรือเปิดแปลงปลูกใหม่
                    </p>
                  </div>
                </div>
                <Link
                  to="/farmer/schedule"
                  className="btn-sm bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-3.5 py-1.5 text-xs font-semibold shrink-0"
                >
                  ดูตารางปลูก
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {capacityAlerts.map(area => {
                  const isCritical = area.rate >= 90
                  return (
                    <div
                      key={area.id}
                      className={`p-3 rounded-xl border flex flex-col justify-between ${
                        isCritical
                          ? 'bg-red-100/60 border-red-300 text-red-900'
                          : 'bg-amber-100/60 border-amber-300 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
                          <span className="font-semibold text-xs truncate">
                            {area.name} {area.zone_code ? `(${area.zone_code})` : ''}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isCritical
                              ? 'bg-red-600 text-white animate-pulse'
                              : 'bg-amber-500 text-white'
                          }`}
                        >
                          {isCritical ? 'วิกฤต 90%+' : 'ใกล้เต็ม 80%+'}
                        </span>
                      </div>

                      <div className="w-full bg-black/10 rounded-full h-2 mb-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCritical ? 'bg-red-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, area.rate)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-600">
                        <span>จองแล้ว {area.used_slots} / {area.total_slots} ช่อง</span>
                        <span className="font-bold text-xs">{area.rate}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {/* Stat Card พิเศษ: ออเดอร์ใหม่รอยืนยันรอบปลูก (สีส้มเด่นชัด) */}
            <Link
              to="/farmer/schedule"
              className={`stat-card relative overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer ${
                waitingCycleOrders.length > 0
                  ? 'border-2 border-orange-400 bg-orange-50/60 hover:bg-orange-100/60'
                  : 'hover:border-primary-300'
              }`}
            >
              {waitingCycleOrders.length > 0 && (
                <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
                </span>
              )}
              <div className="stat-icon bg-orange-100 text-orange-600">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-orange-600">{waitingCycleOrders.length}</p>
                <p className="text-xs font-semibold text-gray-700 truncate">รอยืนยันรอบปลูก</p>
                <p className="text-[10px] text-orange-600 font-medium mt-0.5 flex items-center gap-0.5">
                  จัดรอบปลูก →
                </p>
              </div>
            </Link>

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
