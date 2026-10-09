import { Calendar, X, AlertTriangle, Clock } from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  addDays,
} from 'date-fns'

/**
 * ฟังก์ชันกรองออเดอร์ตามเงื่อนไขวันที่
 * @param {Array} orders - รายการออเดอร์
 * @param {Object} filterOptions
 * @param {'pickup'|'created'} filterOptions.dateType - ประเภทวันที่ (วันรับสินค้า หรือ วันสั่งซื้อ)
 * @param {string} filterOptions.datePreset - ปุ่มลัด ('all', 'today', 'tomorrow', 'this_week', 'last_7_days', 'this_month', 'last_month', 'overdue', 'custom')
 * @param {string} filterOptions.startDate - วันที่เริ่มต้น YYYY-MM-DD
 * @param {string} filterOptions.endDate - วันที่สิ้นสุด YYYY-MM-DD
 */
export function filterOrdersByDate(
  orders,
  { dateType = 'pickup', datePreset = 'all', startDate = '', endDate = '' }
) {
  if (!orders || orders.length === 0) return []
  if (datePreset === 'all' && !startDate && !endDate) return orders

  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')

  return orders.filter(order => {
    // 1. ดึงวันที่เป้าหมายตามประเภทวันที่เลือก
    let targetDateStr = null
    if (dateType === 'pickup') {
      targetDateStr = order.pickup_date || null
    } else {
      targetDateStr = order.created_at
        ? format(new Date(order.created_at), 'yyyy-MM-dd')
        : null
    }

    if (!targetDateStr) return false

    // 2. ตรวจสอบตาม Preset
    if (datePreset === 'today') {
      return targetDateStr === todayStr
    }

    if (datePreset === 'tomorrow') {
      const tmStr = format(addDays(now, 1), 'yyyy-MM-dd')
      return targetDateStr === tmStr
    }

    if (datePreset === 'this_week') {
      // 7 วันข้างหน้า (สำหรับวันรับสินค้า)
      const weekEndStr = format(addDays(now, 7), 'yyyy-MM-dd')
      return targetDateStr >= todayStr && targetDateStr <= weekEndStr
    }

    if (datePreset === 'last_7_days') {
      // 7 วันย้อนหลัง (สำหรับดูประวัติหรือวันสั่งซื้อ)
      const weekStartStr = format(subDays(now, 7), 'yyyy-MM-dd')
      return targetDateStr >= weekStartStr && targetDateStr <= todayStr
    }

    if (datePreset === 'overdue') {
      // เลยกำหนด: วันที่น้อยกว่าวันนี้ และยังไม่จบงาน/ยกเลิก
      return (
        targetDateStr < todayStr &&
        order.status !== 'completed' &&
        order.status !== 'cancelled'
      )
    }

    if (datePreset === 'this_month') {
      const mStartStr = format(startOfMonth(now), 'yyyy-MM-dd')
      const mEndStr = format(endOfMonth(now), 'yyyy-MM-dd')
      return targetDateStr >= mStartStr && targetDateStr <= mEndStr
    }

    if (datePreset === 'last_month') {
      const lastM = subMonths(now, 1)
      const lmStartStr = format(startOfMonth(lastM), 'yyyy-MM-dd')
      const lmEndStr = format(endOfMonth(lastM), 'yyyy-MM-dd')
      return targetDateStr >= lmStartStr && targetDateStr <= lmEndStr
    }

    if (datePreset === 'custom' || startDate || endDate) {
      if (startDate && targetDateStr < startDate) return false
      if (endDate && targetDateStr > endDate) return false
      return true
    }

    return true
  })
}

/**
 * คอมโพเนนต์แถบตัวกรองวันที่สำหรับออเดอร์
 */
export default function OrderDateFilter({
  dateType,
  onDateTypeChange,
  datePreset,
  onDatePresetChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onReset,
  isHistory = false,
  totalFilteredCount = null,
}) {
  const isFilterActive =
    datePreset !== 'all' || Boolean(startDate) || Boolean(endDate)

  // ปุ่ม Preset ด่วนตามบริบท (Active Orders vs History)
  const activePresets = [
    { value: 'all', label: 'ทั้งหมด' },
    ...(isHistory
      ? [
          { value: 'this_month', label: 'เดือนนี้' },
          { value: 'last_month', label: 'เดือนที่แล้ว' },
          { value: 'last_7_days', label: '7 วันล่าสุด' },
          { value: 'today', label: 'วันนี้' },
        ]
      : [
          { value: 'today', label: 'วันนี้' },
          { value: 'tomorrow', label: 'พรุ่งนี้' },
          { value: 'this_week', label: 'สัปดาห์นี้ (7 วัน)' },
          { value: 'this_month', label: 'เดือนนี้' },
          ...(dateType === 'pickup'
            ? [{ value: 'overdue', label: '⚠️ เลยกำหนด', isOverdue: true }]
            : []),
        ]),
  ]

  return (
    <div className="bg-white border border-gray-200/90 rounded-2xl p-3.5 mb-5 shadow-2xs">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* ฝั่งซ้าย: ประเภทวันที่ + ปุ่มลัด */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Dropdown เลือกประเภทวันที่ */}
          <div className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-gray-700">
            <Calendar className="w-3.5 h-3.5 text-forest flex-shrink-0" />
            <select
              value={dateType}
              onChange={e => onDateTypeChange(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-semibold text-gray-800 cursor-pointer pr-1"
            >
              <option value="pickup">📅 วันรับสินค้า</option>
              <option value="created">🛒 วันที่สั่งซื้อ</option>
            </select>
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          {/* ปุ่มลัดช่วงเวลา Preset */}
          <div className="flex items-center gap-1 flex-wrap">
            {activePresets.map(p => {
              const active = datePreset === p.value && !startDate && !endDate
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    onDatePresetChange(p.value)
                    onStartDateChange('')
                    onEndDateChange('')
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    active
                      ? 'bg-forest text-white shadow-2xs'
                      : p.isOverdue
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ฝั่งขวา: ระบุช่วงวันที่เอง (Date Range) + ปุ่มล้างตัวกรอง */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs text-gray-600">
            <span className="text-[11px] text-gray-400 font-medium">จาก</span>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                onStartDateChange(e.target.value)
                onDatePresetChange('custom')
              }}
              className="bg-transparent border-none outline-none text-xs text-gray-800 cursor-pointer"
            />
            <span className="text-[11px] text-gray-400 font-medium">ถึง</span>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                onEndDateChange(e.target.value)
                onDatePresetChange('custom')
              }}
              className="bg-transparent border-none outline-none text-xs text-gray-800 cursor-pointer"
            />
          </div>

          {/* ปุ่มล้างตัวกรอง */}
          {isFilterActive && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors"
              title="ล้างตัวกรองวันที่กลับเป็นทั้งหมด"
            >
              <X className="w-3.5 h-3.5" />
              <span>ล้างตัวกรอง</span>
            </button>
          )}

          {/* แสดงจำนวนรายการที่พบ (ถ้าส่งค่ามา) */}
          {totalFilteredCount !== null && (
            <span className="text-xs text-gray-400 px-1">
              (พบ {totalFilteredCount} รายการ)
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
