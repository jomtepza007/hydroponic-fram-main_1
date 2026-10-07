import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import {
  ShoppingBag, Package, Users, TrendingUp, ArrowRight, Home,
  Sparkles, AlertTriangle, Layers, Sprout, DollarSign,
  ArrowUpRight, BarChart3, CheckCircle2, RefreshCw, Warehouse,
  Activity, Clock, Calendar, ShieldCheck, Mail, Phone, ChevronRight,
  TrendingDown
} from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getAllOrders } from '../../api/orders'
import { getResources } from '../../api/resources'
import { getTopVegetables } from '../../api/reports'
import { supabase } from '../../api/supabaseClient'
import { formatDateTh, isEquipmentOrder } from '../../utils/dateUtils'
import { getCustomerTypeConfig } from '../../utils/customerTypeUtils'

// Color palette for charts
const STATUS_COLORS = {
  waiting_cycle: '#F59E0B',
  pending: '#94A3B8',
  confirmed: '#14B8A6',
  seeding: '#EAB308',
  growing: '#3B82F6',
  ready: '#10B981',
  completed: '#059669',
  cancelled: '#EF4444',
}

const STATUS_LABELS = {
  waiting_cycle: 'รอสร้างรอบปลูก',
  pending: 'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  seeding: 'เพาะเมล็ด',
  growing: 'ลงรางปลูก',
  ready: 'พร้อมส่งมอบ',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
}

function isCycleActiveToday(c, today) {
  if (c.status !== 'seeding' && c.status !== 'growing') return false
  if (c.planting_start_date && c.planting_start_date > today) return false
  if (c.expected_harvest_date && c.expected_harvest_date < today) return false
  return true
}

function isCycleUpcoming(c, today) {
  if (c.status === 'scheduled') return true
  if (c.planting_start_date && c.planting_start_date > today) return true
  return false
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState([])
  const [resources, setResources] = useState([])
  const [topVegs, setTopVegs] = useState([])
  const [growingAreas, setGrowingAreas] = useState([])
  const [plantingCycles, setPlantingCycles] = useState([])
  const [usersCount, setUsersCount] = useState(0)
  const [orgCount, setOrgCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData(isManual = false) {
    if (isManual) setRefreshing(true)
    try {
      const [
        ordersRes,
        resourcesRes,
        topVegsRes,
        areasRes,
        usersRes,
        cyclesRes,
      ] = await Promise.allSettled([
        getAllOrders(),
        getResources(),
        getTopVegetables(5),
        supabase.from('growing_areas').select('*, vegetable_types(name)').order('name'),
        supabase.from('profiles').select('id, customer_type'),
        supabase.from('planting_cycles').select('growing_area_id, slots_used, status, planting_start_date, expected_harvest_date').in('status', ['scheduled', 'seeding', 'growing']),
      ])

      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value || [])
      if (resourcesRes.status === 'fulfilled') setResources(resourcesRes.value || [])
      if (topVegsRes.status === 'fulfilled') setTopVegs(topVegsRes.value || [])
      if (areasRes.status === 'fulfilled') setGrowingAreas(areasRes.value.data || [])
      if (cyclesRes.status === 'fulfilled') setPlantingCycles(cyclesRes.value.data || [])
      if (usersRes.status === 'fulfilled') {
        const uList = usersRes.value.data || []
        setUsersCount(uList.length)
        setOrgCount(uList.filter(u => u.customer_type === 'org' || u.customer_type === 'enterprise').length)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Calculated Metrics
  const stats = {
    total: orders.length,
    waitingCycle: orders.filter(o => o.status === 'waiting_cycle').length,
    pending: orders.filter(o => o.status === 'pending').length,
    active: orders.filter(o => ['waiting_cycle', 'pending', 'seeding', 'growing', 'confirmed'].includes(o.status)).length,
    ready: orders.filter(o => o.status === 'ready').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: orders
      .filter(o => o.status === 'completed')
      .reduce((s, o) => s + (o.final_amount != null ? Number(o.final_amount) : Number(o.total_amount) || 0), 0),
  }

  // Low Stock Items (< 30% or <= min_threshold)
  const lowStock = resources.filter(r => r.current_qty <= r.min_threshold)

  // Status Distribution for Donut Chart
  const statusData = Object.keys(STATUS_LABELS).map(key => {
    const count = orders.filter(o => o.status === key).length
    return {
      key,
      name: STATUS_LABELS[key],
      value: count,
      color: STATUS_COLORS[key] || '#94A3B8',
    }
  }).filter(d => d.value > 0)

  // Growing Area Capacity calculations from actual active planting cycles today
  const todayStr = new Date().toISOString().split('T')[0]
  const totalCapacitySlots = growingAreas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0)
  const usedCapacitySlots = growingAreas.reduce((sum, a) => {
    const areaCycles = plantingCycles.filter(c => c.growing_area_id === a.id && isCycleActiveToday(c, todayStr))
    return sum + areaCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
  }, 0)
  const upcomingCapacitySlots = growingAreas.reduce((sum, a) => {
    const areaCycles = plantingCycles.filter(c => c.growing_area_id === a.id && isCycleUpcoming(c, todayStr))
    return sum + areaCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
  }, 0)
  const farmOccupancyRate = totalCapacitySlots > 0
    ? Math.min(100, Math.round((usedCapacitySlots / totalCapacitySlots) * 100))
    : 0

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-5 lg:p-7">
        <div className="w-full space-y-6">

          {/* Top Executive Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-gray-100 p-6 rounded-2xl shadow-xs">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-50 text-forest border border-primary-200">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  HydroFarm Management OS
                </span>
                <span className="text-xs text-gray-400">• วันนี้ {formatDateTh(new Date())}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-forest-dark tracking-tight">
                แดชบอร์ดภาพรวมผู้ดูแลระบบ
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                ติดตามยอดขาย สถานะออเดอร์ คลังทรัพยากร และแปลงปลูกแบบเรียลไทม์
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-xs disabled:opacity-50"
                title="รีเฟรชข้อมูลล่าสุด"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-forest' : 'text-gray-500'}`} />
                <span>รีเฟรช</span>
              </button>

              <Link
                to="/admin/reports"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-forest text-white text-xs font-semibold hover:bg-forest-dark transition-all shadow-sm shadow-forest/20"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>รายงานการเงิน</span>
              </Link>

              <Link
                to="/"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-primary-50 hover:text-forest hover:border-forest/30 transition-all shadow-xs"
              >
                <Home className="w-3.5 h-3.5" />
                <span>หน้าหลักเว็บ</span>
              </Link>
            </div>
          </div>

          {/* Urgent Alert Banners */}
          {stats.waitingCycle > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all animate-fadeIn">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 backdrop-blur-sm shadow-2xs">
                  <Sparkles className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm md:text-base">
                      มีออเดอร์ใหม่รอสร้างรอบปลูก {stats.waitingCycle} รายการ
                    </p>
                    <span className="px-2 py-0.5 rounded-full bg-white text-amber-700 text-[11px] font-extrabold shadow-2xs">
                      รอสร้างรอบปลูก
                    </span>
                  </div>
                  <p className="text-xs text-white/90 mt-0.5">
                    ลูกค้าชำระเงินเรียบร้อยแล้ว กำลังรอจัดคิวลงแปลงปลูกเพื่อเริ่มต้นกระบวนการเพาะเมล็ด
                  </p>
                </div>
              </div>
              <Link
                to="/admin/orders?status=waiting_cycle"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-amber-700 hover:bg-amber-50 font-bold text-xs shadow-sm transition-all whitespace-nowrap self-start sm:self-auto hover:scale-105"
              >
                <span>จัดการรอบปลูกทันที</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {lowStock.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 text-rose-600">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-rose-900">
                    แจ้งเตือนคลัง: ทรัพยากร {lowStock.length} รายการ ต่ำกว่าเกณฑ์ขั้นต่ำ
                  </p>
                  <p className="text-[11px] text-rose-600">
                    {lowStock.map(r => r.name).slice(0, 3).join(', ')}
                    {lowStock.length > 3 ? ` และอีก ${lowStock.length - 3} รายการ` : ''}
                  </p>
                </div>
              </div>
              <Link
                to="/admin/resources"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors whitespace-nowrap self-start sm:self-auto shadow-2xs"
              >
                <span>เติมสต็อก</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* Primary 4 KPI Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Total Revenue */}
            <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-100/60 to-transparent rounded-bl-full pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500">ยอดขายสำเร็จสุทธิ</span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                ฿{stats.revenue.toLocaleString()}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>เสร็จสิ้น {stats.completed} ออเดอร์</span>
              </div>
              <Link to="/admin/reports" className="absolute inset-0 z-10" />
            </div>

            {/* Active In-Progress Orders */}
            <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-100/60 to-transparent rounded-bl-full pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500">กำลังดำเนินการ (Active)</span>
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                  <Activity className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                {stats.active} <span className="text-sm font-semibold text-gray-400">ออเดอร์</span>
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-blue-700 font-medium">
                <Clock className="w-3.5 h-3.5" />
                <span>รอคิว {stats.waitingCycle} • รอดำเนินการ {stats.pending}</span>
              </div>
              <Link to="/admin/orders" className="absolute inset-0 z-10" />
            </div>

            {/* Ready for Pickup / Dispatch */}
            <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-teal-100/60 to-transparent rounded-bl-full pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500">พร้อมส่งมอบ / รอจัดส่ง</span>
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                {stats.ready} <span className="text-sm font-semibold text-gray-400">ออเดอร์</span>
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-teal-700 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{stats.ready > 0 ? '🟢 รอการส่งมอบให้ลูกค้า' : 'จัดส่งครบถ้วนแล้ว'}</span>
              </div>
              <Link to="/admin/orders" className="absolute inset-0 z-10" />
            </div>

            {/* Total Customers */}
            <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-100/60 to-transparent rounded-bl-full pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500">บัญชีลูกค้าทั้งหมด</span>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                {usersCount} <span className="text-sm font-semibold text-gray-400">บัญชี</span>
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-indigo-700 font-medium">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>องค์กร {orgCount} • สมาชิกทั่วไป {Math.max(0, usersCount - orgCount)}</span>
              </div>
              <Link to="/admin/users" className="absolute inset-0 z-10" />
            </div>

          </div>

          {/* Quick Action Navigation Pills */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              ทางลัดการจัดการฟาร์ม (Quick Actions)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { label: 'จัดการออเดอร์', icon: ShoppingBag, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100', link: '/admin/orders' },
                { label: 'สินค้า & ผัก', icon: Sprout, color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100', link: '/admin/vegetables' },
                { label: 'แปลงปลูก & โซน', icon: Layers, color: 'text-teal-600 bg-teal-50 hover:bg-teal-100', link: '/admin/growing-areas' },
                { label: 'คลังวัตถุดิบ & ปุ๋ย', icon: Warehouse, color: 'text-amber-600 bg-amber-50 hover:bg-amber-100', link: '/admin/resources' },
                { label: 'จัดการผู้ใช้ & ส่วนลด', icon: Users, color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100', link: '/admin/users' },
                { label: 'รายงาน & วิเคราะห์', icon: BarChart3, color: 'text-purple-600 bg-purple-50 hover:bg-purple-100', link: '/admin/reports' },
              ].map(item => (
                <Link
                  key={item.label}
                  to={item.link}
                  className={`flex items-center gap-2 p-3 rounded-xl border border-gray-100/80 transition-all font-semibold text-xs text-gray-700 shadow-2xs hover:shadow-xs hover:-translate-y-0.5`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Visual Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Top Vegetables Bar Chart (3 cols) */}
            <div className="card lg:col-span-3 bg-white border border-gray-100 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-extrabold text-forest-dark text-base flex items-center gap-2">
                      <Sprout className="w-4 h-4 text-emerald-600" />
                      ผักที่มียอดสั่งซื้อสูงสุด (Top Vegetables)
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">สรุปยอดจำนวนต้นที่ถูกจองและจัดส่ง</p>
                  </div>
                  <Link
                    to="/admin/reports"
                    className="inline-flex items-center gap-1 text-xs font-bold text-forest hover:text-forest-dark bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-200 transition-colors"
                  >
                    <span>ดูรายงานละเอียด</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {topVegs.length === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center text-gray-300">
                    <Sprout className="w-10 h-10 mb-2 text-gray-200" />
                    <p className="text-sm text-gray-400">ยังไม่มีข้อมูลการสั่งซื้อผัก</p>
                  </div>
                ) : (
                  <div className="h-60 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topVegs} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2D6A4F" stopOpacity={1} />
                            <stop offset="100%" stopColor="#52B788" stopOpacity={0.8} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11, fill: '#64748B', fontWeight: 500 }}
                          axisLine={{ stroke: '#e2e8f0' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748B' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(45, 106, 79, 0.05)' }}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #d1fae5',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                            fontSize: '12px',
                            padding: '8px 12px',
                          }}
                          formatter={(val) => [`${val} ต้น`, 'ยอดสั่งซื้อ']}
                          labelStyle={{ color: '#2D6A4F', fontWeight: 700 }}
                        />
                        <Bar
                          dataKey="total"
                          fill="url(#barGradient)"
                          radius={[8, 8, 0, 0]}
                          maxBarSize={45}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Bottom Rank Summary Pills */}
              {topVegs.length > 0 && (
                <div className="flex items-center gap-2 pt-4 border-t border-gray-100 mt-2 flex-wrap">
                  <span className="text-[11px] font-bold text-gray-400">อันดับยอดนิยม:</span>
                  {topVegs.slice(0, 3).map((item, idx) => (
                    <span
                      key={item.name}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 font-medium"
                    >
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-gray-300 text-gray-700' : 'bg-amber-600 text-white'
                      }`}>
                        {idx + 1}
                      </span>
                      <span>{item.name}</span>
                      <strong className="text-forest font-bold">{item.total} ต้น</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Order Pipeline Donut Chart (2 cols) */}
            <div className="card lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-extrabold text-forest-dark text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-600" />
                    สถานะออเดอร์ในระบบ
                  </h2>
                  <span className="text-xs font-bold text-gray-400">
                    รวม {stats.total} รายการ
                  </span>
                </div>

                {statusData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-gray-300">
                    ยังไม่มีข้อมูลออเดอร์
                  </div>
                ) : (
                  <div className="relative h-52 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {statusData.map((entry) => (
                            <Cell key={entry.key} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            fontSize: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                          }}
                          formatter={(value, name) => [`${value} รายการ (${Math.round((value / stats.total) * 100)}%)`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-2xl font-black text-forest-dark">{stats.total}</p>
                      <p className="text-[10px] uppercase font-bold text-gray-400">ออเดอร์ทั้งหมด</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Legend Pills */}
              <div className="grid grid-cols-2 gap-1.5 pt-3 border-t border-gray-100">
                {statusData.map(item => (
                  <div key={item.key} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-gray-600 truncate">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-800 ml-1.5">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Operational Feeds: Recent Orders & Farm Health */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Recent Orders Feed (3 cols) */}
            <div className="card lg:col-span-3 bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-extrabold text-forest-dark text-base flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-forest" />
                    ออเดอร์ล่าสุดที่เข้ามา (Recent Orders)
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">รายการคำสั่งซื้อ 5 ออเดอร์ล่าสุด</p>
                </div>
                <Link
                  to="/admin/orders"
                  className="inline-flex items-center gap-1 text-xs font-bold text-forest hover:text-forest-dark"
                >
                  <span>ดูออเดอร์ทั้งหมด ({orders.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {orders.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>ยังไม่มีคำสั่งซื้อในระบบ</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {orders.slice(0, 5).map(o => {
                    const customerName = o.profiles?.full_name || 'ลูกค้าทั่วไป'
                    const typeCfg = getCustomerTypeConfig(o.profiles?.customer_type)
                    const isEq = isEquipmentOrder(o)
                    const finalPrice = o.final_amount != null ? Number(o.final_amount) : Number(o.total_amount)

                    return (
                      <div
                        key={o.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/70 px-2 rounded-xl transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-primary-50 text-forest font-bold flex items-center justify-center flex-shrink-0 text-xs shadow-2xs mt-0.5">
                            {customerName.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-gray-800 text-sm">
                                #{o.id.slice(0, 8).toUpperCase()}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="font-semibold text-gray-700 text-xs truncate max-w-[130px]">
                                {customerName}
                              </span>
                              <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-bold border ${typeCfg.badgeClass}`}>
                                <span>{typeCfg.emoji}</span>
                                <span>{typeCfg.label}</span>
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate max-w-[280px] mt-0.5">
                              {o.order_items?.map(i => i.vegetable_types?.name).join(', ') || (isEq ? 'อุปกรณ์ & ชุดปลูก' : 'ผักไฮโดรโปนิกส์')}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              สั่งซื้อ: {formatDateTh(o.created_at)} • รับสินค้า: {formatDateTh(o.pickup_date)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:self-center justify-between sm:justify-end">
                          <div className="text-right">
                            <p className="text-sm font-bold text-forest">
                              ฿{finalPrice.toLocaleString()}
                            </p>
                            {o.final_amount != null && Number(o.final_amount) < Number(o.total_amount) && (
                              <span className="text-[10px] text-emerald-600 font-semibold block">
                                ลดแล้ว
                              </span>
                            )}
                          </div>

                          <OrderStatusBadge status={o.status} isEquipment={isEq} />

                          <Link
                            to={`/farmer/orders/${o.id}`}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-forest hover:border-forest hover:bg-primary-50 transition-all shadow-2xs"
                            title="ดูรายละเอียดออเดอร์"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Farm Resources & Growing Area Health (2 cols) */}
            <div className="card lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-6 shadow-xs flex flex-col justify-between gap-6">

              {/* Farm Capacity Overview */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-extrabold text-forest-dark text-base flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-600" />
                      ความจุแปลงปลูกทั้งหมด
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">อัตราการใช้งานช่องปลูกในฟาร์ม</p>
                  </div>
                  <Link
                    to="/admin/growing-areas"
                    className="text-xs font-bold text-forest hover:underline"
                  >
                    จัดการแปลง →
                  </Link>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-600">อัตราการใช้งานแปลง</span>
                    <span className={`text-xs font-extrabold ${
                      farmOccupancyRate >= 90 ? 'text-red-600' : farmOccupancyRate >= 70 ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {farmOccupancyRate}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        farmOccupancyRate >= 90 ? 'bg-red-500' : farmOccupancyRate >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${farmOccupancyRate}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
                    <span>ใช้ไป <strong className="text-gray-800 font-bold">{usedCapacitySlots.toLocaleString()}</strong> ช่อง</span>
                    <span>ว่าง <strong className="text-forest font-bold">{Math.max(0, totalCapacitySlots - usedCapacitySlots).toLocaleString()}</strong> ช่อง</span>
                    <span className="font-bold text-gray-700">ทั้งหมด {totalCapacitySlots.toLocaleString()} ช่อง</span>
                  </div>

                  {/* Individual Growing Areas breakdown */}
                  {growingAreas.length > 0 && (
                    <div className="space-y-2.5 mt-3 pt-3 border-t border-gray-200/70">
                      {growingAreas.map(a => {
                        const aTotal = Number(a.total_slots) || 0
                        const aCycles = plantingCycles.filter(c => c.growing_area_id === a.id)
                        const aActiveCycles = aCycles.filter(c => isCycleActiveToday(c, todayStr))
                        const aUpcomingCycles = aCycles.filter(c => isCycleUpcoming(c, todayStr))

                        const aUsed = aActiveCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
                        const aUpcoming = aUpcomingCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
                        const aOccupancy = aTotal > 0 ? Math.min(100, Math.round((aUsed / aTotal) * 100)) : 0

                        return (
                          <div key={a.id} className="text-xs">
                            <div className="flex items-center justify-between text-gray-700 mb-1 gap-1">
                              <span className="font-medium flex items-center gap-1.5 truncate max-w-[150px]">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  aOccupancy >= 90 ? 'bg-red-500' : aOccupancy >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`} />
                                แปลง {a.name}{a.zone_code && a.zone_code !== a.name ? ` (${a.zone_code})` : ''}
                                {a.vegetable_types?.name && (
                                  <span className="text-[10px] text-gray-400">· {a.vegetable_types.name}</span>
                                )}
                              </span>
                              <span className="text-[11px] text-gray-500 flex-shrink-0 flex items-center gap-1.5">
                                <span>
                                  {aUsed} / {aTotal} ช่อง <strong className="text-forest ml-0.5">({aOccupancy}%)</strong>
                                </span>
                                {aUpcoming > 0 && (
                                  <span
                                    className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
                                    title={`ยอดจองล่วงหน้า ${aUpcoming} ช่อง`}
                                  >
                                    จองล่วงหน้า {aUpcoming} ช่อง
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200/80 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                  aOccupancy >= 90 ? 'bg-red-500' : aOccupancy >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${aOccupancy}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Resource Inventory Health */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-extrabold text-forest-dark text-base flex items-center gap-2">
                      <Warehouse className="w-4 h-4 text-amber-600" />
                      สถานะคลังทรัพยากร & ปุ๋ย
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">ระดับคงเหลือเทียบกับจุดสั่งซื้อ</p>
                  </div>
                  <Link
                    to="/admin/resources"
                    className="text-xs font-bold text-forest hover:underline"
                  >
                    ดูคลัง →
                  </Link>
                </div>

                {resources.length === 0 ? (
                  <div className="py-6 text-center text-gray-400 text-xs">ยังไม่มีข้อมูลทรัพยากร</div>
                ) : (
                  <div className="space-y-3">
                    {resources.slice(0, 4).map(r => {
                      const max = Number(r.max_qty) || 100
                      const curr = Number(r.current_qty) || 0
                      const pct = Math.min(100, Math.round((curr / max) * 100))
                      const isLow = curr <= Number(r.min_threshold)

                      return (
                        <div key={r.id} className="text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-700 truncate max-w-[160px]">{r.name}</span>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className={isLow ? 'text-red-600' : 'text-gray-700'}>
                                {curr.toLocaleString()} {r.unit}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                isLow ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {pct}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                isLow ? 'bg-red-500' : pct < 50 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      </main>
    </div>
  )
}
