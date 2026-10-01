import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  Download, FileSpreadsheet, Users, Tag, History, Search,
  ArrowUpRight, Filter, RefreshCw, Calendar, TrendingUp, ChevronDown,
  CheckCircle2, XCircle, ShoppingBag, ShieldAlert, Sparkles
} from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { getOrderReport, getTopVegetables } from '../../api/reports'
import { getAllDiscountLogs } from '../../api/orders'
import { supabase } from '../../api/supabaseClient'
import {
  exportOrdersToExcel,
  exportOrdersToCSV,
  exportCustomersToExcel,
  exportCustomersToCSV,
  exportDiscountLogsToExcel,
  exportDiscountLogsToCSV,
} from '../../utils/csvExport'
import { formatDateTh } from '../../utils/dateUtils'
import toast from 'react-hot-toast'

const PERIODS = [
  { value: 'day', label: 'รายวัน' },
  { value: 'week', label: 'รายสัปดาห์' },
  { value: 'month', label: 'รายเดือน' },
  { value: 'year', label: 'รายปี' },
]

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'discounts'
  const [period, setPeriod] = useState('month')
  const [orders, setOrders] = useState([])
  const [topVegs, setTopVegs] = useState([])
  const [loading, setLoading] = useState(true)

  // ประวัติส่วนลด (Discount Audit Logs)
  const [discountLogs, setDiscountLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logSearchQuery, setLogSearchQuery] = useState('')

  // เมนู Export Dropdown
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportRef = useRef(null)

  useEffect(() => {
    loadData()
  }, [period])

  useEffect(() => {
    if (activeTab === 'discounts' && discountLogs.length === 0) {
      loadDiscountLogs()
    }
  }, [activeTab])

  // ปิดเมนู Export เมื่อคลิกข้างนอก
  useEffect(() => {
    function handleClickOutside(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  async function loadDiscountLogs() {
    setLoadingLogs(true)
    try {
      const logs = await getAllDiscountLogs(150)
      setDiscountLogs(logs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingLogs(false)
    }
  }

  // --- ฟังก์ชัน Export แต่ละประเภท (รองรับทั้ง Excel .xlsx และ CSV) ---
  async function handleExportSales(format = 'xlsx') {
    setExporting(true)
    setShowExportMenu(false)
    try {
      toast.loading(`กำลังรวบรวมข้อมูลยอดขาย (${format.toUpperCase()})...`, { id: 'export-sales' })
      const { data: allOrders, error } = await supabase
        .from('orders')
        .select(`
          *,
          profiles:customer_id (full_name, phone, email, customer_type),
          order_items (
            *,
            vegetable_types (name, unit, category)
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (format === 'csv') {
        exportOrdersToCSV(allOrders || [])
        toast.success('ส่งออกรายงานยอดขาย (.csv) เรียบร้อย ✅', { id: 'export-sales' })
      } else {
        exportOrdersToExcel(allOrders || [])
        toast.success('ส่งออกรายงานยอดขาย (.xlsx) เรียบร้อย ✅', { id: 'export-sales' })
      }
    } catch (err) {
      console.error(err)
      toast.error('เกิดข้อผิดพลาดในการส่งออกข้อมูล', { id: 'export-sales' })
    } finally {
      setExporting(false)
    }
  }

  async function handleExportCustomers(format = 'xlsx') {
    setExporting(true)
    setShowExportMenu(false)
    try {
      toast.loading(`กำลังรวบรวมรายชื่อลูกค้า (${format.toUpperCase()})...`, { id: 'export-cust' })
      const { data: customers, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (format === 'csv') {
        exportCustomersToCSV(customers || [])
        toast.success('ส่งออกรายชื่อลูกค้า (.csv) เรียบร้อย ✅', { id: 'export-cust' })
      } else {
        exportCustomersToExcel(customers || [])
        toast.success('ส่งออกรายชื่อลูกค้า (.xlsx) เรียบร้อย ✅', { id: 'export-cust' })
      }
    } catch (err) {
      console.error(err)
      toast.error('เกิดข้อผิดพลาดในการส่งออกรายชื่อลูกค้า', { id: 'export-cust' })
    } finally {
      setExporting(false)
    }
  }

  async function handleExportDiscounts(format = 'xlsx') {
    setExporting(true)
    setShowExportMenu(false)
    try {
      toast.loading(`กำลังรวบรวมประวัติส่วนลด (${format.toUpperCase()})...`, { id: 'export-disc' })
      let logsToExport = discountLogs
      if (logsToExport.length === 0) {
        logsToExport = await getAllDiscountLogs(300)
        setDiscountLogs(logsToExport)
      }
      if (format === 'csv') {
        exportDiscountLogsToCSV(logsToExport || [])
        toast.success('ส่งออกประวัติการปรับส่วนลด (.csv) เรียบร้อย ✅', { id: 'export-disc' })
      } else {
        exportDiscountLogsToExcel(logsToExport || [])
        toast.success('ส่งออกประวัติการปรับส่วนลด (.xlsx) เรียบร้อย ✅', { id: 'export-disc' })
      }
    } catch (err) {
      console.error(err)
      toast.error('เกิดข้อผิดพลาดในการส่งออกประวัติส่วนลด', { id: 'export-disc' })
    } finally {
      setExporting(false)
    }
  }

  // Group orders by date for chart (ยอดขายรายวันนับเฉพาะออเดอร์ที่ไม่ถูกยกเลิก และใช้ราคาหลังหักส่วนลด)
  const chartData = (() => {
    const map = {}
    orders.forEach(o => {
      const date = o.created_at?.split('T')[0] || ''
      if (!map[date]) map[date] = { date, orders: 0, revenue: 0 }
      map[date].orders++
      if (o.status !== 'cancelled') {
        const amt = o.final_amount != null ? Number(o.final_amount) : (Number(o.total_amount) || 0)
        map[date].revenue += amt
      }
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  })()

  // คำนวณยอดขายรวมเฉพาะออเดอร์ที่เสร็จสิ้น (completed)
  const totalRevenue = orders
    .filter(o => o.status === 'completed')
    .reduce((s, o) => s + (o.final_amount != null ? Number(o.final_amount) : (Number(o.total_amount) || 0)), 0)
  const completed = orders.filter(o => o.status === 'completed').length
  const cancelled = orders.filter(o => o.status === 'cancelled').length

  // กรอง Discount Audit Logs ตามค้นหา
  const filteredDiscountLogs = discountLogs.filter(log => {
    if (!logSearchQuery.trim()) return true
    const q = logSearchQuery.toLowerCase()
    const orderMatch = log.order_id?.toLowerCase().includes(q)
    const customerMatch = log.orders?.profiles?.full_name?.toLowerCase().includes(q)
    const changerMatch = log.profiles?.full_name?.toLowerCase().includes(q) || log.profiles?.email?.toLowerCase().includes(q)
    const noteMatch = log.note?.toLowerCase().includes(q)
    const itemMatch = log.order_items?.vegetable_types?.name?.toLowerCase().includes(q)
    return orderMatch || customerMatch || changerMatch || noteMatch || itemMatch
  })

  const totalDiscountAmountAll = discountLogs.reduce((sum, l) => sum + (Number(l.discount_amount) || 0), 0)

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="page-title">รายงานและสถิติฟาร์ม</h1>
              <p className="page-subtitle">วิเคราะห์ข้อมูลยอดขาย ผลการผลิต และตรวจสอบบัญชีส่วนลด</p>
            </div>

            {/* Export Dropdown Menu */}
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                id="btn-export-reports"
                disabled={exporting}
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="btn-primary flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>ส่งออกรายงาน (Export Excel / CSV)</span>
                <ChevronDown className="w-4 h-4 ml-1" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-slide-up">
                  <div className="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                    <span>รายงานยอดขาย & ออเดอร์</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-bold">แนะนำ</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportSales('xlsx')}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-primary-50 hover:text-forest flex items-center gap-2.5 transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-xs flex items-center gap-1.5">
                        <span>ยอดขาย & ออเดอร์ (Excel .xlsx)</span>
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 font-semibold px-1 rounded border border-emerald-200">จัดระเบียบสวยงาม</span>
                      </p>
                      <p className="text-[11px] text-gray-400">คอลัมน์กว้างพอดี วันที่ไม่เป็น ##### เบอร์ไม่เพี้ยน</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSales('csv')}
                    className="w-full px-4 py-2 text-left text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-800 flex items-center gap-2.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-0.5" />
                    <div>
                      <p className="font-medium">ยอดขาย & ออเดอร์ (ไฟล์ .CSV)</p>
                      <p className="text-[10px] text-gray-400">มีสูตร text formula ป้องกัน Excel ทำลายข้อมูล</p>
                    </div>
                  </button>

                  <div className="border-t border-gray-100 my-1.5"></div>

                  <div className="px-3 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    รายงานลูกค้าและส่วนลด
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportCustomers('xlsx')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-primary-50 hover:text-forest flex items-center gap-2.5 transition-colors"
                  >
                    <Users className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-xs">รายชื่อลูกค้าทั้งหมด (Excel .xlsx)</p>
                      <p className="text-[11px] text-gray-400">ชื่อ, เบอร์โทร, ประเภทลูกค้า</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportDiscounts('xlsx')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-primary-50 hover:text-forest flex items-center gap-2.5 transition-colors"
                  >
                    <Tag className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-xs">ประวัติการปรับส่วนลด Audit (Excel .xlsx)</p>
                      <p className="text-[11px] text-gray-400">ผู้ปรับ, วันเวลา, มูลค่าส่วนลด</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-200 mb-6 gap-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'overview'
                  ? 'border-forest text-forest'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              สรุปยอดขายและกราฟ (Sales & Analytics)
            </button>
            <button
              onClick={() => setActiveTab('discounts')}
              className={`pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'discounts'
                  ? 'border-forest text-forest'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Tag className="w-4 h-4" />
              ประวัติส่วนลด (Discount Audit Logs)
              {discountLogs.length > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                  {discountLogs.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: OVERVIEW & CHARTS */}
          {activeTab === 'overview' && (
            <div>
              {/* Period Selector */}
              <div className="flex items-center justify-between mb-6 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                <span className="text-sm font-semibold text-gray-600">เลือกช่วงเวลาในการวิเคราะห์:</span>
                <div className="flex gap-2">
                  {PERIODS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPeriod(p.value)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all
                        ${period === p.value ? 'bg-forest text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
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
                  { label: 'ยอดขายรวม (เสร็จสิ้น)', value: `฿${totalRevenue.toLocaleString()}`, color: 'text-forest font-black' },
                ].map(s => (
                  <div key={s.label} className="card text-center">
                    <p className={`text-2xl lg:text-3xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{s.label}</p>
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
                        <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} formatter={v => [`฿${Number(v).toLocaleString()}`, 'รายรับ']} />
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
          )}

          {/* TAB 2: DISCOUNT AUDIT LOGS */}
          {activeTab === 'discounts' && (
            <div>
              {/* Discount Logs Header Stats & Search */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="card flex items-center gap-3.5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200">
                  <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                    <Tag className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{discountLogs.length}</p>
                    <p className="text-xs text-gray-500">บันทึกการให้ส่วนลดทั้งหมด</p>
                  </div>
                </div>

                <div className="card flex items-center gap-3.5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
                  <div className="w-12 h-12 rounded-xl bg-forest text-white flex items-center justify-center font-bold">
                    ฿
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-forest">฿{totalDiscountAmountAll.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">มูลค่าส่วนลดรวมที่อนุมัติ</p>
                  </div>
                </div>

                <div className="card flex flex-col justify-center">
                  <p className="text-xs font-semibold text-gray-500 mb-2">ส่งออกประวัติส่วนลด (Audit Excel):</p>
                  <button
                    type="button"
                    onClick={() => handleExportDiscounts('xlsx')}
                    className="btn-sm bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-2 font-semibold flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    ดาวน์โหลดประวัติส่วนลด (.xlsx)
                  </button>
                </div>
              </div>

              {/* Search & Actions Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={e => setLogSearchQuery(e.target.value)}
                    placeholder="ค้นหารหัสออเดอร์, ชื่อลูกค้า, หรือผู้ปรับส่วนลด..."
                    className="input pl-9 text-xs w-full py-2"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadDiscountLogs}
                    disabled={loadingLogs}
                    className="btn-sm bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl px-3 py-2 text-xs flex items-center gap-1.5"
                    title="โหลดข้อมูลใหม่"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                    รีเฟรช
                  </button>
                  <span className="text-xs text-gray-400">
                    แสดง {filteredDiscountLogs.length} รายการ
                  </span>
                </div>
              </div>

              {/* Discount Logs Table */}
              <div className="table-wrapper">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>วัน-เวลา</th>
                      <th>ออเดอร์</th>
                      <th>ลูกค้า / ประเภท</th>
                      <th>สินค้า</th>
                      <th>ผู้ปรับส่วนลด</th>
                      <th>การปรับลด (%)</th>
                      <th>มูลค่าส่วนลด</th>
                      <th>หมายเหตุ / เหตุผล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingLogs ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12">
                          <div className="spinner w-8 h-8 mx-auto" />
                          <p className="text-xs text-gray-400 mt-2">กำลังโหลดประวัติส่วนลด...</p>
                        </td>
                      </tr>
                    ) : filteredDiscountLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-gray-400">
                          <Tag className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                          <p className="font-semibold text-gray-500">ไม่พบบันทึกการให้ส่วนลด</p>
                          <p className="text-[11px] mt-0.5 text-gray-400">
                            {logSearchQuery ? 'ไม่พบข้อมูลที่ตรงกับคำค้นหา' : 'ยังไม่มีการปรับลดราคาในระบบ'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredDiscountLogs.map(log => {
                        const orderShort = log.order_id ? `#${log.order_id.slice(0, 8).toUpperCase()}` : '-'
                        const customerName = log.orders?.profiles?.full_name || 'ลูกค้าทั่วไป'
                        const customerType = log.orders?.profiles?.customer_type || 'ทั่วไป'
                        const itemName = log.order_items?.vegetable_types?.name || 'สินค้า'
                        const changerName = log.profiles?.full_name || log.profiles?.email?.split('@')[0] || 'เจ้าหน้าที่'
                        const changerRole = log.profiles?.role || 'staff'
                        const discVal = Number(log.discount_amount) || 0

                        return (
                          <tr key={log.id} className="hover:bg-primary-50/40 transition-colors">
                            <td className="whitespace-nowrap text-gray-500">
                              {formatDateTh(log.created_at)}
                            </td>
                            <td>
                              <span className="font-bold text-forest hover:underline">
                                {orderShort}
                              </span>
                            </td>
                            <td>
                              <p className="font-semibold text-gray-800">{customerName}</p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                {customerType}
                              </span>
                            </td>
                            <td>
                              <span className="font-medium text-gray-700">{itemName}</span>
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-gray-800">{changerName}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  changerRole === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {changerRole}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className="font-semibold text-gray-500">{log.old_rate || 0}%</span>
                              <span className="mx-1 text-gray-400">→</span>
                              <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                {log.new_rate || 0}%
                              </span>
                            </td>
                            <td className="font-bold text-emerald-700 whitespace-nowrap">
                              {discVal > 0 ? `-฿${discVal.toLocaleString()}` : '฿0.00'}
                            </td>
                            <td className="text-gray-500 max-w-xs truncate" title={log.note || ''}>
                              {log.note || '-'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
