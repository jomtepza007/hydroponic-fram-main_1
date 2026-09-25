import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import Sidebar from '../../components/layout/Sidebar'
import { getOrderReport, getTopVegetables } from '../../api/reports'

const PERIODS = [
  { value: 'day', label: 'รายวัน' },
  { value: 'week', label: 'รายสัปดาห์' },
  { value: 'month', label: 'รายเดือน' },
  { value: 'year', label: 'รายปี' },
]

export default function AdminReports() {
  const [period, setPeriod] = useState('month')
  const [orders, setOrders] = useState([])
  const [topVegs, setTopVegs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true)
    try {
      const [ordersData, vegsData] = await Promise.all([
        getOrderReport(period),
        getTopVegetables(8),
      ])
      setOrders(ordersData || [])
      setTopVegs(vegsData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Group orders by date for chart
  const chartData = (() => {
    const map = {}
    orders.forEach(o => {
      const date = o.created_at?.split('T')[0] || ''
      if (!map[date]) map[date] = { date, orders: 0, revenue: 0 }
      map[date].orders++
      map[date].revenue += Number(o.total_amount) || 0
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  })()

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0)
  const completed = orders.filter(o => o.status === 'completed').length
  const cancelled = orders.filter(o => o.status === 'cancelled').length

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="page-title">รายงานสรุปผล</h1>
              <p className="page-subtitle">วิเคราะห์ข้อมูลออเดอร์และการผลิต</p>
            </div>

            {/* Period Selector */}
            <div className="flex gap-2">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                    ${period === p.value ? 'bg-forest text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-primary-50'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'ออเดอร์ทั้งหมด', value: orders.length, color: 'text-forest' },
              { label: 'เสร็จสิ้น', value: completed, color: 'text-green-600' },
              { label: 'ยกเลิก', value: cancelled, color: 'text-red-500' },
              { label: 'ยอดขายรวม', value: `฿${totalRevenue.toLocaleString()}`, color: 'text-forest' },
            ].map(s => (
              <div key={s.label} className="card text-center">
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-sm text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Orders Over Time */}
            <div className="card">
              <h2 className="font-bold text-forest-dark mb-4">ออเดอร์ตามช่วงเวลา</h2>
              {loading ? (
                <div className="h-64 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    <Bar dataKey="orders" name="ออเดอร์" fill="#52B788" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue Over Time */}
            <div className="card">
              <h2 className="font-bold text-forest-dark mb-4">รายรับตามช่วงเวลา (บาท)</h2>
              {loading ? (
                <div className="h-64 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={v => [`฿${v.toLocaleString()}`, 'รายรับ']} />
                    <Bar dataKey="revenue" name="รายรับ" fill="#2D6A4F" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top Vegetables */}
            <div className="card lg:col-span-2">
              <h2 className="font-bold text-forest-dark mb-4">ผักที่สั่งซื้อมากที่สุด</h2>
              {loading ? (
                <div className="h-64 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topVegs} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    <Bar dataKey="total" name="ปริมาณ" fill="#95D5B2" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
