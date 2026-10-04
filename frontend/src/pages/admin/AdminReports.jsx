import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import {
  Download, FileSpreadsheet, Users, Tag, History, Search,
  ArrowUpRight, Filter, RefreshCw, Calendar, TrendingUp, ChevronDown,
  CheckCircle2, XCircle, ShoppingBag, ShieldAlert, Sparkles, DollarSign,
  Activity, ArrowRight, Sprout, Clock, Layers, Award, BarChart3
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
import { getCustomerTypeConfig } from '../../utils/customerTypeUtils'
import toast from 'react-hot-toast'

const PERIODS = [
  { value: 'day', label: 'รายวัน' },
  { value: 'week', label: 'รายสัปดาห์' },
  { value: 'month', label: 'รายเดือน' },
  { value: 'year', label: 'รายปี' },
]

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10)
      const monthIdx = parseInt(parts[1], 10) - 1
      const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
      return `${day} ${months[monthIdx] || ''}`
    }
    const d = new Date(dateStr)
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
    return `${d.getDate()} ${months[d.getMonth()] || ''}`
  } catch {
    return dateStr
  }
}

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
      if (!date) return
      if (!map[date]) {
        map[date] = {
          date,
          label: formatShortDate(date),
          orders: 0,
          revenue: 0,
        }
      }
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
  const avgOrderValue = completed > 0 ? totalRevenue / completed : 0

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

      <main className="ml-64 flex-1 p-5 lg:p-7">
        <div className="w-full space-y-6">

          {/* Top Executive Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-gray-100 p-6 rounded-2xl shadow-xs">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-50 text-forest border border-primary-200">
                  <BarChart3 className="w-3.5 h-3.5" />
                  ศูนย์วิเคราะห์ข้อมูล & ส่งออกรายงาน
                </span>
                <span className="text-xs text-gray-400">• วันนี้ {formatDateTh(new Date())}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-forest-dark tracking-tight">
                รายงานและสถิติภาพรวมฟาร์ม
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                วิเคราะห์สถิติยอดขาย ปริมาณการผลิต ประวัติส่วนลด และการส่งออกข้อมูล Excel / CSV
              </p>
            </div>

            {/* Export Dropdown Menu */}
            <div className="relative flex items-center gap-2 flex-wrap" ref={exportRef}>
              <button
                type="button"
                id="btn-export-reports"
                disabled={exporting}
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest text-white text-xs font-bold hover:bg-forest-dark transition-all shadow-sm shadow-forest/20 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>ส่งออกรายงาน (Export Excel / CSV)</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-2.5 z-50 animate-slide-up">
                  <div className="px-4 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                    <span>รายงานยอดขาย & ออเดอร์</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">แนะนำ</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportSales('xlsx')}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-primary-50 hover:text-forest flex items-center gap-3 transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-xs flex items-center gap-1.5">
                        <span>ยอดขาย & ออเดอร์ (Excel .xlsx)</span>
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 font-semibold px-1 rounded border border-emerald-200">สวยงาม</span>
                      </p>
                      <p className="text-[11px] text-gray-400">คอลัมน์กว้างพอดี วันที่ไม่เป็น ##### เบอร์ไม่เพี้ยน</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSales('csv')}
                    className="w-full px-4 py-2 text-left text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-800 flex items-center gap-3 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-0.5" />
                    <div>
                      <p className="font-medium">ยอดขาย & ออเดอร์ (ไฟล์ .CSV)</p>
                      <p className="text-[10px] text-gray-400">มีสูตร text formula ป้องกัน Excel ทำลายข้อมูล</p>
                    </div>
                  </button>

                  <div className="border-t border-gray-100 my-2"></div>

                  <div className="px-4 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    รายงานลูกค้าและส่วนลด
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportCustomers('xlsx')}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-primary-50 hover:text-forest flex items-center gap-3 transition-colors"
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
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-primary-50 hover:text-forest flex items-center gap-3 transition-colors"
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

          {/* Navigation Segmented Control */}
          <div className="bg-gray-100/70 p-1.5 rounded-2xl inline-flex gap-1.5 border border-gray-200/50 shadow-2xs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'overview'
                  ? 'bg-white text-forest shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-forest" />
              <span>สรุปยอดขายและกราฟ (Sales & Analytics)</span>
            </button>
            <button
              onClick={() => setActiveTab('discounts')}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'discounts'
                  ? 'bg-white text-forest shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Tag className="w-4 h-4 text-amber-600" />
              <span>ประวัติส่วนลด (Discount Audit Logs)</span>
              {discountLogs.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold">
                  {discountLogs.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: OVERVIEW & CHARTS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">

              {/* Period Selector Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-forest" />
                  <span className="text-xs font-bold text-gray-700">เลือกช่วงเวลาในการวิเคราะห์:</span>
                  <span className="text-xs text-gray-400">
                    ({PERIODS.find(p => p.value === period)?.label || 'รายเดือน'})
                  </span>
                </div>
                <div className="flex gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200/60">
                  {PERIODS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPeriod(p.value)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all
                        ${period === p.value
                          ? 'bg-forest text-white shadow-xs'
                          : 'text-gray-600 hover:bg-white hover:text-gray-800'
                        }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary 4 Elevated Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Total Revenue */}
                <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-100/60 to-transparent rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500">ยอดขายรวม (สำเร็จ)</span>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                    ฿{totalRevenue.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>เฉลี่ย ฿{Math.round(avgOrderValue).toLocaleString()} / ออเดอร์</span>
                  </div>
                </div>

                {/* Total Orders */}
                <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-100/60 to-transparent rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500">ออเดอร์ทั้งหมดในงวด</span>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                    {orders.length} <span className="text-sm font-semibold text-gray-400">รายการ</span>
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-blue-700 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>ช่วง {PERIODS.find(p => p.value === period)?.label || 'ช่วงเวลา'}</span>
                  </div>
                </div>

                {/* Completed Orders */}
                <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-teal-100/60 to-transparent rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500">ออเดอร์เสร็จสิ้นสมบูรณ์</span>
                    <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                    {completed} <span className="text-sm font-semibold text-gray-400">รายการ</span>
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-teal-700 font-medium">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>สำเร็จ {orders.length > 0 ? Math.round((completed / orders.length) * 100) : 0}% ของคำสั่งซื้อ</span>
                  </div>
                </div>

                {/* Cancelled Orders */}
                <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-rose-100/60 to-transparent rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500">ออเดอร์ที่ถูกยกเลิก</span>
                    <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                      <XCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black text-rose-600 tracking-tight">
                    {cancelled} <span className="text-sm font-semibold text-gray-400">รายการ</span>
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-700 font-medium">
                    <span>ยกเลิก {orders.length > 0 ? Math.round((cancelled / orders.length) * 100) : 0}% ของทั้งหมด</span>
                  </div>
                </div>

              </div>

              {/* Main Charts: Revenue Area & Order Volume Bars */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Revenue Trend AreaChart */}
                <div className="card bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-extrabold text-forest-dark text-base flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        แนวโน้มรายรับตามช่วงเวลา (Revenue Trend)
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">ยอดขายสุทธิที่เกิดขึ้นในแต่ละวัน (บาท)</p>
                    </div>
                    <span className="text-xs font-black text-forest bg-primary-50 px-2.5 py-1 rounded-lg border border-primary-200">
                      รวม ฿{totalRevenue.toLocaleString()}
                    </span>
                  </div>

                  {loading ? (
                    <div className="h-64 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
                  ) : chartData.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-gray-300">
                      <Calendar className="w-10 h-10 mb-2 text-gray-200" />
                      <p className="text-xs text-gray-400">ไม่มีข้อมูลยอดขายในช่วงเวลานี้</p>
                    </div>
                  ) : (
                    <div className="h-64 w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                          <defs>
                            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: '#64748B', fontWeight: 500 }}
                            axisLine={{ stroke: '#e2e8f0' }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: '#64748B' }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={v => `฿${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: '12px',
                              border: '1px solid #d1fae5',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                              fontSize: '12px',
                              padding: '8px 12px'
                            }}
                            formatter={(v) => [`฿${Number(v).toLocaleString()}`, 'รายรับ']}
                            labelStyle={{ color: '#2D6A4F', fontWeight: 700 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#10B981"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#revenueGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Orders Volume BarChart */}
                <div className="card bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-extrabold text-forest-dark text-base flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-blue-600" />
                        จำนวนออเดอร์ตามช่วงเวลา (Order Volume)
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">ปริมาณคำสั่งซื้อที่เข้ามาในระบบ</p>
                    </div>
                    <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      รวม {orders.length} ออเดอร์
                    </span>
                  </div>

                  {loading ? (
                    <div className="h-64 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
                  ) : chartData.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-gray-300">
                      <ShoppingBag className="w-10 h-10 mb-2 text-gray-200" />
                      <p className="text-xs text-gray-400">ไม่มีข้อมูลออเดอร์ในช่วงเวลานี้</p>
                    </div>
                  ) : (
                    <div className="h-64 w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <defs>
                            <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3B82F6" stopOpacity={1} />
                              <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.8} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: '#64748B', fontWeight: 500 }}
                            axisLine={{ stroke: '#e2e8f0' }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: '#64748B' }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: '12px',
                              border: '1px solid #bfdbfe',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                              fontSize: '12px',
                              padding: '8px 12px'
                            }}
                            formatter={(v) => [`${v} รายการ`, 'จำนวนออเดอร์']}
                            labelStyle={{ color: '#1E40AF', fontWeight: 700 }}
                          />
                          <Bar
                            dataKey="orders"
                            fill="url(#orderGrad)"
                            radius={[8, 8, 0, 0]}
                            maxBarSize={45}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

              </div>

              {/* Full Width: Top Selling Vegetables Analytics */}
              <div className="card bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div>
                    <h2 className="font-extrabold text-forest-dark text-base flex items-center gap-2">
                      <Sprout className="w-5 h-5 text-emerald-600" />
                      ผักที่ได้รับความนิยมและมียอดสั่งซื้อสูงสุด (Top Vegetable Demand)
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      แสดงอันดับชนิดผักที่ลูกค้าสั่งซื้อมากที่สุดพร้อมปริมาณต้นรวม
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">
                    จัดอันดับ {topVegs.length} รายการแรก
                  </span>
                </div>

                {loading ? (
                  <div className="h-64 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
                ) : topVegs.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <Sprout className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p>ยังไม่มีข้อมูลสถิติการสั่งซื้อผัก</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    {/* Horizontal Bar Chart */}
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topVegs}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                        >
                          <defs>
                            <linearGradient id="topVegGrad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#2D6A4F" />
                              <stop offset="100%" stopColor="#52B788" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                          <YAxis
                            dataKey="name"
                            type="category"
                            tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                            width={90}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: '12px',
                              border: '1px solid #d1fae5',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                              fontSize: '12px',
                            }}
                            formatter={(v) => [`${v} ต้น`, 'ปริมาณที่สั่ง']}
                          />
                          <Bar
                            dataKey="total"
                            fill="url(#topVegGrad)"
                            radius={[0, 8, 8, 0]}
                            maxBarSize={22}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Top List Badges Grid */}
                    <div className="space-y-2.5">
                      {topVegs.map((veg, index) => {
                        const maxQty = topVegs[0]?.total || 1
                        const pct = Math.round((veg.total / maxQty) * 100)

                        return (
                          <div
                            key={veg.name}
                            className="p-3 rounded-xl bg-gray-50/80 border border-gray-100 hover:bg-white hover:shadow-xs transition-all flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                index === 0 ? 'bg-amber-400 text-white shadow-xs' :
                                index === 1 ? 'bg-gray-300 text-gray-700' :
                                index === 2 ? 'bg-amber-600 text-white' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {index + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-gray-800 text-xs truncate">{veg.name}</p>
                                <div className="w-28 bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                                  <div
                                    className="bg-forest h-1.5 rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="font-extrabold text-forest text-sm">{veg.total}</span>
                              <span className="text-[11px] text-gray-400 ml-1">ต้น</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: DISCOUNT AUDIT LOGS */}
          {activeTab === 'discounts' && (
            <div className="space-y-6">

              {/* Discount Logs Highlight Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-100/60 to-transparent rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500">บันทึกการปรับลดราคาทั้งหมด</span>
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                      <Tag className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                    {discountLogs.length} <span className="text-sm font-semibold text-gray-400">รายการ</span>
                  </p>
                  <p className="text-xs text-amber-700 font-medium mt-1">Audit Trail ตรวจสอบได้ทุกรายการ</p>
                </div>

                <div className="relative overflow-hidden bg-white border border-gray-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-100/60 to-transparent rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500">มูลค่าส่วนลดรวมที่อนุมัติ</span>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-2xl lg:text-3xl font-black text-forest tracking-tight">
                    ฿{totalDiscountAmountAll.toLocaleString()}
                  </p>
                  <p className="text-xs text-emerald-700 font-medium mt-1">คำนวณจากทุกออเดอร์ในประวัติ</p>
                </div>

                <div className="bg-gradient-to-br from-forest to-forest-dark text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-mint-100 mb-1">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                      <span>รายงานตรวจสอบบัญชี (Audit Export)</span>
                    </div>
                    <p className="text-xs text-white/80">
                      ดาวน์โหลดข้อมูลประวัติการปรับส่วนลดทุกรายการในรูปแบบไฟล์ Excel จัดระเบียบครบถ้วน
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportDiscounts('xlsx')}
                    className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-forest-dark hover:bg-emerald-50 font-bold text-xs shadow-md transition-all hover:scale-[1.02]"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>ดาวน์โหลดประวัติส่วนลด (.xlsx)</span>
                  </button>
                </div>

              </div>

              {/* Search & Actions Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={e => setLogSearchQuery(e.target.value)}
                    placeholder="ค้นหารหัสออเดอร์, ชื่อลูกค้า, หรือผู้ปรับส่วนลด..."
                    className="input pl-10 text-xs w-full py-2.5 rounded-xl"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadDiscountLogs}
                    disabled={loadingLogs}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-2xs"
                    title="โหลดข้อมูลใหม่"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin text-forest' : 'text-gray-500'}`} />
                    <span>รีเฟรช</span>
                  </button>
                  <span className="text-xs font-bold text-gray-400 px-2">
                    แสดง {filteredDiscountLogs.length} รายการ
                  </span>
                </div>
              </div>

              {/* Discount Logs Table */}
              <div className="table-wrapper">
                <table className="table min-w-[950px] w-full text-xs">
                  <thead>
                    <tr>
                      <th className="whitespace-nowrap">วัน-เวลา</th>
                      <th className="whitespace-nowrap">ออเดอร์</th>
                      <th className="whitespace-nowrap min-w-[150px]">ลูกค้า / ประเภท</th>
                      <th className="min-w-[120px]">สินค้า</th>
                      <th className="whitespace-nowrap">ผู้ปรับส่วนลด</th>
                      <th className="whitespace-nowrap text-center">การปรับลด (%)</th>
                      <th className="whitespace-nowrap">มูลค่าส่วนลด</th>
                      <th className="min-w-[140px]">หมายเหตุ / เหตุผล</th>
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
                        const typeCfg = getCustomerTypeConfig(log.orders?.profiles?.customer_type)
                        const itemName = log.order_items?.vegetable_types?.name || 'สินค้า'
                        const changerName = log.profiles?.full_name || log.profiles?.email?.split('@')[0] || 'เจ้าหน้าที่'
                        const changerRole = log.profiles?.role || 'staff'
                        const discVal = Number(log.discount_amount) || 0

                        return (
                          <tr key={log.id} className="hover:bg-primary-50/40 transition-colors">
                            <td className="whitespace-nowrap text-gray-500">
                              {formatDateTh(log.created_at)}
                            </td>
                            <td className="whitespace-nowrap">
                              <span className="font-bold text-forest">
                                {orderShort}
                              </span>
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-gray-800">{customerName}</span>
                                <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-bold border ${typeCfg.badgeClass}`}>
                                  <span>{typeCfg.emoji}</span>
                                  <span>{typeCfg.label}</span>
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap font-medium text-gray-700">
                              {itemName}
                            </td>
                            <td className="whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-gray-800">{changerName}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  changerRole === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {changerRole}
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap text-center">
                              <span className="font-semibold text-gray-400">{log.old_rate || 0}%</span>
                              <span className="mx-1 text-gray-300">→</span>
                              <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                                {log.new_rate || 0}%
                              </span>
                            </td>
                            <td className="whitespace-nowrap font-bold text-emerald-700">
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
