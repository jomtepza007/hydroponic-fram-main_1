import { useEffect, useState } from 'react'
import { BarChart2, ShoppingBag, Package, Users, TrendingUp, ArrowRight, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import Sidebar from '../../components/layout/Sidebar'
import { getAllOrders } from '../../api/orders'
import { getResources } from '../../api/resources'
import { getTopVegetables } from '../../api/reports'
import { formatDateTh } from '../../utils/dateUtils'

const COLORS = ['#2D6A4F', '#52B788', '#95D5B2', '#B7E4C7', '#40916C']

export default function AdminDashboard() {
  const [orders, setOrders] = useState([])
  const [resources, setResources] = useState([])
  const [topVegs, setTopVegs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [ordersData, resourcesData, topVegsData] = await Promise.all([
        getAllOrders(),
        getResources(),
        getTopVegetables(5),
      ])
      setOrders(ordersData || [])
      setResources(resourcesData || [])
      setTopVegs(topVegsData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    active: orders.filter(o => ['seeding', 'growing', 'confirmed'].includes(o.status)).length,
    ready: orders.filter(o => o.status === 'ready').length,
    revenue: orders.filter(o => o.status === 'completed').reduce((s, o) => s + Number(o.total_amount), 0),
  }

  const lowStock = resources.filter(r => r.current_qty <= r.min_threshold)

  // Status distribution for pie chart
  const statusData = [
    { name: 'รอดำเนินการ', value: orders.filter(o => o.status === 'pending').length },
    { name: 'ยืนยันแล้ว', value: orders.filter(o => o.status === 'confirmed').length },
    { name: 'เพาะเมล็ด', value: orders.filter(o => o.status === 'seeding').length },
    { name: 'ลงรางปลูก', value: orders.filter(o => o.status === 'growing').length },
    { name: 'พร้อมส่งมอบ', value: orders.filter(o => o.status === 'ready').length },
  ].filter(d => d.value > 0)

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-6xl mx-auto">

          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="page-title">แดชบอร์ดผู้จัดการ</h1>
              <p className="page-subtitle">ภาพรวมระบบ HydroFarm — {formatDateTh(new Date())}</p>
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

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'ออเดอร์ทั้งหมด', value: stats.total, icon: ShoppingBag, color: 'bg-blue-50 text-blue-600', link: '/admin/orders' },
              { label: 'กำลังดำเนินการ', value: stats.active, icon: TrendingUp, color: 'bg-amber-50 text-amber-600', link: '/admin/orders' },
              { label: 'พร้อมส่งมอบ', value: stats.ready, icon: Package, color: 'bg-green-50 text-green-600', link: '/admin/orders' },
              { label: 'ยอดขาย (บาท)', value: `฿${stats.revenue.toLocaleString()}`, icon: BarChart2, color: 'bg-primary-50 text-forest', link: '/admin/reports' },
            ].map(stat => (
              <Link key={stat.label} to={stat.link} className="stat-card group hover:shadow-card-hover transition-all">
                <div className={`stat-icon ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                  <p className="text-xs text-gray-400">{stat.label}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">

            {/* Top Vegetables Bar Chart */}
            <div className="card lg:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-forest-dark">ผักที่สั่งซื้อมากที่สุด</h2>
                <Link to="/admin/reports" className="text-xs text-forest hover:underline">
                  ดูรายงาน →
                </Link>
              </div>
              {topVegs.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-300">ยังไม่มีข้อมูล</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topVegs} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #b7e4c7', fontSize: '12px' }}
                      labelStyle={{ color: '#2D6A4F', fontWeight: 600 }}
                    />
                    <Bar dataKey="total" fill="#52B788" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Status Pie Chart */}
            <div className="card lg:col-span-2">
              <h2 className="font-bold text-forest-dark mb-4">สัดส่วนสถานะออเดอร์</h2>
              {statusData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-300">ยังไม่มีข้อมูล</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%" cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Low Stock & Recent Orders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Low Stock Alert */}
            {lowStock.length > 0 && (
              <div className="card border-red-200 bg-red-50/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-red-700">⚠️ ทรัพยากรใกล้หมด</h2>
                  <Link to="/admin/resources" className="text-xs text-red-600 hover:underline">จัดการ →</Link>
                </div>
                <div className="space-y-2">
                  {lowStock.map(r => {
                    const pct = Math.round((r.current_qty / r.max_qty) * 100)
                    return (
                      <div key={r.id} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-700">{r.name}</span>
                            <span className="text-red-600 font-semibold">{pct}%</span>
                          </div>
                          <div className="w-full bg-red-100 rounded-full h-1.5">
                            <div
                              className="bg-red-500 h-1.5 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent Orders */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-forest-dark">ออเดอร์ล่าสุด</h2>
                <Link to="/admin/orders" className="text-xs text-forest hover:underline flex items-center gap-1">
                  ดูทั้งหมด <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-3">
                {orders.slice(0, 5).map(order => (
                  <div key={order.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">#{order.id.slice(0,8).toUpperCase()}</p>
                      <p className="text-xs text-gray-400">
                        {order.profiles?.full_name} • {formatDateTh(order.created_at)}
                      </p>
                    </div>
                    <span className={`badge ${
                      order.status === 'pending' ? 'badge-pending' :
                      order.status === 'ready' ? 'badge-ready' :
                      'badge-confirmed'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
