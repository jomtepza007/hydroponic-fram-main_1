import * as XLSX from 'xlsx'
import { getCustomerDisplayName, getCustomerPhone } from './dateUtils.js'

/**
 * ทำความสะอาดข้อความหมายเหตุ (Notes):
 * 1. ตัดแท็กรูปภาพ <!--PHOTOS:...--> ที่เก็บ Base64 ขนาดใหญ่ออก (เพื่อป้องกันปัญหา Text length must not exceed 32767 characters ใน Excel)
 * 2. ลบ base64 data URLs และการขึ้นบรรทัดใหม่
 * 3. จำกัดความยาวไม่ให้เกินข้อจำกัดของ Excel
 */
export function cleanNoteText(text) {
  if (!text) return '-'
  let str = String(text)

  // 1. ตรวจสอบว่ามีรูปภาพแนบมาหรือไม่
  const hasPhotos = str.includes('<!--PHOTOS:')
  const photosCount = (str.match(/data:image/g) || []).length || (hasPhotos ? 1 : 0)

  // 2. ตัดแท็กรูปภาพ <!--PHOTOS:[\s\S]*?--> ออกทั้งหมด
  str = str.replace(/<!--PHOTOS:[\s\S]*?-->/g, '').trim()

  // 3. ตัด data URLs เผื่อมีตกค้าง
  str = str.replace(/data:image\/[a-zA-Z]+;base64,[^"'\s]+/g, '')

  // 4. จัดรูปแบบบรรทัด
  str = str
    .replace(/\r/g, '')
    .replace(/:\s*\n\s*/g, ': ') // เช่น "ผู้สั่งซื้อ:\n jompop" -> "ผู้สั่งซื้อ: jompop"
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' | ')

  if (hasPhotos) {
    str = str ? `${str} | [แนบรูปอัปเดตการปลูก ${photosCount} รูป]` : `[แนบรูปอัปเดตการปลูก ${photosCount} รูป]`
  }

  // 5. ป้องกันความยาวเกินขีดจำกัดของ Excel (32,767 ตัวอักษร)
  if (str.length > 5000) {
    str = str.slice(0, 5000) + '... (เนื้อหาถูกตัดให้พอดีกับเซลล์)'
  }

  return str || '-'
}

/**
 * ป้องกันเซลล์ใดๆ มีความยาวเกินขีดจำกัด 32,767 ตัวอักษรของ Microsoft Excel
 */
function sanitizeCellForExcel(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') {
    // ป้องกัน Base64 หรือข้อความยาวเกินลิมิต 32,767 ตัวอักษรของ Excel
    if (val.includes('data:image')) {
      val = val.replace(/data:image\/[a-zA-Z]+;base64,[^"'\s]+/g, '[รูปภาพ]')
    }
    if (val.length > 30000) {
      return val.slice(0, 30000) + '... (ตัดทอนเนื่องจากเกินขีดจำกัด Excel)'
    }
    return val
  }
  return val
}

/**
 * แปลงวัน-เวลาสำหรับ Excel / CSV ให้เปิดแล้วถูกต้อง ไม่เพี้ยน
 * รูปแบบ: YYYY-MM-DD HH:mm:ss (เวลาประเทศไทย UTC+7 / Asia/Bangkok)
 * - ป้องกันปัญหาปี ค.ศ. กลายเป็นปี 1483 ใน Excel ภาษาไทย
 * - ป้องกันปัญหาตัวอักษรเดือนไทยกลายเป็นเครื่องหมายคำถาม '??'
 * - แสดงเวลาสั่งซื้อครบถ้วน (ชั่วโมง:นาที:วินาที) สำหรับงานบัญชีและตรวจสอบ
 */
export function formatDateTimeCSV(isoString) {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return String(isoString)

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    return formatter.format(d).replace(', ', ' ')
  } catch {
    return String(isoString)
  }
}

/**
 * แปลงวันที่สำหรับ Excel / CSV (เช่น วันรับสินค้า / วันนัดหมาย) ให้ไม่เพี้ยน
 * รูปแบบ: YYYY-MM-DD (เช่น 2026-10-15)
 * - สกัดปี-เดือน-วัน โดยตรงเพื่อป้องกันปัญหา Timezone Rollback (วันที่ถอยหลัง 1 วัน)
 */
export function formatDateCSV(dateString) {
  if (!dateString) return '-'
  try {
    const str = String(dateString).trim()
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`
    }
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return str

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(d)
  } catch {
    return String(dateString)
  }
}

/**
 * ดึงวันที่ปัจจุบันของประเทศไทยสำหรับตั้งชื่อไฟล์ (YYYY-MM-DD)
 */
export function getTodayDateStr() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

/**
 * ฟังก์ชันดาวน์โหลดไฟล์ CSV พร้อม UTF-8 BOM สำหรับเปิดใน Excel ให้ภาษาไทยแสดงผลถูกต้อง
 */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * ฟังก์ชันดาวน์โหลดไฟล์ Excel (.xlsx) ด้วย SheetJS
 */
export function downloadExcel(workbook, filename) {
  XLSX.writeFile(workbook, filename)
}

/**
 * Escape ข้อความสำหรับ CSV ทั่วไป
 */
function escapeCSV(val) {
  if (val === null || val === undefined) return '""'
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

/**
 * ฟอร์แมตเบอร์โทรศัพท์สำหรับ CSV ให้ Excel คงเลข 0 นำหน้า และไม่แสดงเป็น 9.5E+09
 */
function formatPhoneCSV(phone) {
  if (!phone || phone === '-') return '""'
  const clean = String(phone).replace(/[^\d+]/g, '')
  return clean ? `="${clean}"` : `"${phone}"`
}

const statusMap = {
  waiting_cycle: 'รอสร้างรอบปลูก',
  pending: 'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  seeding: 'เพาะเมล็ด',
  growing: 'กำลังปลูก',
  ready: 'พร้อมส่งมอบ',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
}

const roleMap = {
  customer: 'ลูกค้า (Customer)',
  farmer: 'เกษตรกร (Farmer)',
  admin: 'ผู้ดูแลระบบ (Admin)',
}

// =====================================================================
// 1. EXPORT รายงานยอดขายและรายการคำสั่งซื้อ (SALES & ORDERS)
// =====================================================================

const orderHeaders = [
  'ลำดับ',
  'รหัสคำสั่งซื้อ',
  'วันที่สั่งซื้อ (วัน-เวลา)',
  'กำหนดวันรับ/จัดส่ง',
  'ชื่อลูกค้า',
  'ประเภทลูกค้า',
  'เบอร์โทรศัพท์',
  'รายการสินค้า',
  'จำนวนรายการ',
  'ราคาปกติ (บาท)',
  'ส่วนลดรวม (บาท)',
  'ยอดชำระสุทธิ (บาท)',
  'สถานะคำสั่งซื้อ',
  'ประเภทออเดอร์',
  'หมายเหตุ',
]

/**
 * 1.1 Export ออเดอร์เป็น Excel (.xlsx) - จัดความกว้างคอลัมน์ให้อ่านง่าย ไม่มี ##### ไม่มี 9.5E+09
 */
export function exportOrdersToExcel(orders = [], customFilename = '') {
  let totalOriginalSum = 0
  let totalDiscountSum = 0
  let totalFinalSum = 0

  const dataRows = orders.map((o, index) => {
    const origAmount = Number(o.total_amount) || 0
    const finalAmount = o.final_amount != null ? Number(o.final_amount) : origAmount
    const discountAmount = Math.max(0, origAmount - finalAmount)

    if (o.status !== 'cancelled') {
      totalOriginalSum += origAmount
      totalDiscountSum += discountAmount
      totalFinalSum += finalAmount
    }

    const itemsSummary = (o.order_items || [])
      .map(it => {
        const name = it.vegetable_types?.name || 'สินค้า'
        const qty = it.quantity || 1
        const unit = it.vegetable_types?.unit || 'กก.'
        const rate = Number(it.discount_rate) > 0 ? ` (ลด ${it.discount_rate}%)` : ''
        return `${name} x ${qty} ${unit}${rate}`
      })
      .join(' | ')

    const isEquipment = (o.order_items || []).some(
      it => it.vegetable_types?.category === 'equipment' || it.category === 'equipment'
    ) || (o.notes && (o.notes.includes('จัดส่ง') || o.notes.includes('พัสดุ')))

    const customerName = getCustomerDisplayName(o)
    const customerType = o.profiles?.customer_type || 'ทั่วไป'
    const phone = getCustomerPhone(o) || '-'
    const noteCleaned = cleanNoteText(o.notes)

    return [
      index + 1,
      `#${o.id.slice(0, 8).toUpperCase()}`,
      formatDateTimeCSV(o.created_at),
      formatDateCSV(o.pickup_date),
      customerName,
      customerType,
      phone,
      itemsSummary,
      o.order_items?.length || 0,
      origAmount,
      discountAmount,
      finalAmount,
      statusMap[o.status] || o.status,
      isEquipment ? 'อุปกรณ์ปลูก' : 'ผักไฮโดรโปนิกส์',
      noteCleaned,
    ]
  })

  // สรุปยอดรวมท้ายตาราง
  const summaryRow = [
    'รวมยอดสุทธิ (ไม่รวมยกเลิก)',
    `จำนวน ${orders.filter(o => o.status !== 'cancelled').length} ออเดอร์`,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    totalOriginalSum,
    totalDiscountSum,
    totalFinalSum,
    '',
    '',
    '',
  ]

  const allRows = [orderHeaders, ...dataRows, summaryRow].map(row => row.map(sanitizeCellForExcel))
  const ws = XLSX.utils.aoa_to_sheet(allRows)

  // กำหนดความกว้างคอลัมน์ให้อ่านง่าย ไม่โดนบีบ และวันที่ไม่แสดง #####
  ws['!cols'] = [
    { wch: 8 },  // ลำดับ
    { wch: 15 }, // รหัสคำสั่งซื้อ
    { wch: 22 }, // วันที่สั่งซื้อ
    { wch: 16 }, // กำหนดวันรับ/จัดส่ง
    { wch: 24 }, // ชื่อลูกค้า
    { wch: 14 }, // ประเภทลูกค้า
    { wch: 16 }, // เบอร์โทรศัพท์
    { wch: 34 }, // รายการสินค้า
    { wch: 13 }, // จำนวนรายการ
    { wch: 16 }, // ราคาปกติ
    { wch: 16 }, // ส่วนลดรวม
    { wch: 18 }, // ยอดชำระสุทธิ
    { wch: 16 }, // สถานะคำสั่งซื้อ
    { wch: 16 }, // ประเภทออเดอร์
    { wch: 50 }, // หมายเหตุ
  ]

  // บังคับประเภทเซลล์ให้ถูกต้อง (เบอร์โทร = Text, ตัวเลขเงิน = Currency)
  for (let r = 1; r <= dataRows.length; r++) {
    const idCell = XLSX.utils.encode_cell({ r, c: 1 })
    if (ws[idCell]) ws[idCell].t = 's'

    const phoneCell = XLSX.utils.encode_cell({ r, c: 6 })
    if (ws[phoneCell]) {
      ws[phoneCell].t = 's'
      ws[phoneCell].z = '@'
    }

    for (let c of [9, 10, 11]) {
      const numCell = XLSX.utils.encode_cell({ r, c })
      if (ws[numCell] && typeof ws[numCell].v === 'number') {
        ws[numCell].z = '#,##0.00'
      }
    }
  }

  // ตัวเลขแถวสรุปยอด
  const sumIdx = dataRows.length + 1
  for (let c of [9, 10, 11]) {
    const sumCell = XLSX.utils.encode_cell({ r: sumIdx, c })
    if (ws[sumCell] && typeof ws[sumCell].v === 'number') {
      ws[sumCell].z = '#,##0.00'
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'รายงานยอดขายและออเดอร์')
  downloadExcel(wb, customFilename || `hydrofarm_sales_orders_${getTodayDateStr()}.xlsx`)
}

/**
 * 1.2 Export ออเดอร์เป็น CSV (.csv) - มีสูตร text formula ป้องกัน Excel แสดง ##### หรือ 9.5E+09
 */
export function exportOrdersToCSV(orders = [], customFilename = '') {
  let totalOriginalSum = 0
  let totalDiscountSum = 0
  let totalFinalSum = 0

  const rows = orders.map((o, index) => {
    const origAmount = Number(o.total_amount) || 0
    const finalAmount = o.final_amount != null ? Number(o.final_amount) : origAmount
    const discountAmount = Math.max(0, origAmount - finalAmount)

    if (o.status !== 'cancelled') {
      totalOriginalSum += origAmount
      totalDiscountSum += discountAmount
      totalFinalSum += finalAmount
    }

    const itemsSummary = (o.order_items || [])
      .map(it => {
        const name = it.vegetable_types?.name || 'สินค้า'
        const qty = it.quantity || 1
        const unit = it.vegetable_types?.unit || 'กก.'
        const rate = Number(it.discount_rate) > 0 ? ` (ลด ${it.discount_rate}%)` : ''
        return `${name} x ${qty} ${unit}${rate}`
      })
      .join(' | ')

    const isEquipment = (o.order_items || []).some(
      it => it.vegetable_types?.category === 'equipment' || it.category === 'equipment'
    ) || (o.notes && (o.notes.includes('จัดส่ง') || o.notes.includes('พัสดุ')))

    const customerName = getCustomerDisplayName(o)
    const customerType = o.profiles?.customer_type || 'ทั่วไป'
    const phone = getCustomerPhone(o) || '-'
    const noteCleaned = cleanNoteText(o.notes)

    // ป้องกัน Excel ทำลายข้อมูลใน CSV:
    // วันที่และเบอร์โทรใช้รูปแบบสูตร ="..." เพื่อให้ Excel มองเป็น Text 100% ไม่บีบเป็น ##### หรือ 9.5E+09
    const orderIdEscaped = `="#${o.id.slice(0, 8).toUpperCase()}"`
    const orderDateEscaped = `="${formatDateTimeCSV(o.created_at)}"`
    const pickupDateEscaped = `="${formatDateCSV(o.pickup_date)}"`
    const phoneEscaped = formatPhoneCSV(phone)

    return [
      index + 1,
      orderIdEscaped,
      orderDateEscaped,
      pickupDateEscaped,
      escapeCSV(customerName),
      escapeCSV(customerType),
      phoneEscaped,
      escapeCSV(itemsSummary),
      o.order_items?.length || 0,
      origAmount.toFixed(2),
      discountAmount.toFixed(2),
      finalAmount.toFixed(2),
      escapeCSV(statusMap[o.status] || o.status),
      escapeCSV(isEquipment ? 'อุปกรณ์ปลูก' : 'ผักไฮโดรโปนิกส์'),
      escapeCSV(noteCleaned),
    ].join(',')
  })

  // สรุปยอดรวมท้ายตาราง
  const summaryRow = [
    'รวมยอดสุทธิ (ไม่รวมยกเลิก)',
    `"จำนวน ${orders.filter(o => o.status !== 'cancelled').length} ออเดอร์"`,
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    totalOriginalSum.toFixed(2),
    totalDiscountSum.toFixed(2),
    totalFinalSum.toFixed(2),
    '""',
    '""',
    '""',
  ].join(',')

  const csvContent = [orderHeaders.map(escapeCSV).join(','), ...rows, summaryRow].join('\r\n')
  downloadCSV(csvContent, customFilename || `hydrofarm_sales_orders_${getTodayDateStr()}.csv`)
}

// =====================================================================
// 2. EXPORT รายชื่อลูกค้า (CUSTOMERS)
// =====================================================================

const customerHeaders = [
  'ลำดับ',
  'รหัสผู้ใช้',
  'ชื่อ-นามสกุล',
  'อีเมล',
  'เบอร์โทรศัพท์',
  'ประเภทลูกค้า',
  'บทบาท (Role)',
  'สถานะบัญชี',
  'วันที่สมัครสมาชิก (วัน-เวลา)',
]

/**
 * 2.1 Export ลูกค้าเป็น Excel (.xlsx)
 */
export function exportCustomersToExcel(users = []) {
  const dataRows = users.map((u, index) => {
    return [
      index + 1,
      u.id ? `#${u.id.slice(0, 8).toUpperCase()}` : '-',
      u.full_name || 'ไม่ระบุชื่อ',
      u.email || '-',
      u.phone || '-',
      u.customer_type || 'ทั่วไป',
      roleMap[u.role] || u.role,
      u.is_banned ? 'ถูกระงับ (Banned)' : 'ปกติ (Active)',
      formatDateTimeCSV(u.created_at),
    ]
  })

  const allRows = [customerHeaders, ...dataRows].map(row => row.map(sanitizeCellForExcel))
  const ws = XLSX.utils.aoa_to_sheet(allRows)

  ws['!cols'] = [
    { wch: 8 },  // ลำดับ
    { wch: 14 }, // รหัสผู้ใช้
    { wch: 24 }, // ชื่อ-นามสกุล
    { wch: 28 }, // อีเมล
    { wch: 16 }, // เบอร์โทร
    { wch: 14 }, // ประเภทลูกค้า
    { wch: 16 }, // บทบาท
    { wch: 16 }, // สถานะบัญชี
    { wch: 22 }, // วันที่สมัครสมาชิก
  ]

  for (let r = 1; r <= dataRows.length; r++) {
    const phoneCell = XLSX.utils.encode_cell({ r, c: 4 })
    if (ws[phoneCell]) {
      ws[phoneCell].t = 's'
      ws[phoneCell].z = '@'
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'รายชื่อลูกค้า')
  downloadExcel(wb, `hydrofarm_customers_${getTodayDateStr()}.xlsx`)
}

/**
 * 2.2 Export ลูกค้าเป็น CSV (.csv)
 */
export function exportCustomersToCSV(users = []) {
  const rows = users.map((u, index) => {
    const userIdEscaped = u.id ? `="#${u.id.slice(0, 8).toUpperCase()}"` : '""'
    const phoneEscaped = formatPhoneCSV(u.phone)
    const createdAtEscaped = `="${formatDateTimeCSV(u.created_at)}"`

    return [
      index + 1,
      userIdEscaped,
      escapeCSV(u.full_name || 'ไม่ระบุชื่อ'),
      escapeCSV(u.email || '-'),
      phoneEscaped,
      escapeCSV(u.customer_type || 'ทั่วไป'),
      escapeCSV(roleMap[u.role] || u.role),
      escapeCSV(u.is_banned ? 'ถูกระงับ (Banned)' : 'ปกติ (Active)'),
      createdAtEscaped,
    ].join(',')
  })

  const csvContent = [customerHeaders.map(escapeCSV).join(','), ...rows].join('\r\n')
  downloadCSV(csvContent, `hydrofarm_customers_${getTodayDateStr()}.csv`)
}

// =====================================================================
// 3. EXPORT ประวัติการปรับส่วนลด (DISCOUNT AUDIT LOGS)
// =====================================================================

const discountHeaders = [
  'ลำดับ',
  'วัน-เวลาที่ปรับส่วนลด',
  'รหัสออเดอร์',
  'ลูกค้า',
  'ประเภทลูกค้า',
  'รายการสินค้า',
  'ผู้ปรับส่วนลด',
  'บทบาทผู้ปรับ',
  'ส่วนลดเดิม (%)',
  'ส่วนลดใหม่ (%)',
  'มูลค่าส่วนลด (บาท)',
  'หมายเหตุ / เหตุผล',
]

/**
 * 3.1 Export ประวัติส่วนลดเป็น Excel (.xlsx)
 */
export function exportDiscountLogsToExcel(logs = []) {
  let totalDiscountValue = 0

  const dataRows = logs.map((log, index) => {
    const discAmount = Number(log.discount_amount) || 0
    totalDiscountValue += discAmount

    const orderId = log.order_id ? `#${log.order_id.slice(0, 8).toUpperCase()}` : '-'
    const customer = log.orders?.profiles?.full_name || 'ลูกค้าทั่วไป'
    const customerType = log.orders?.profiles?.customer_type || 'ทั่วไป'
    const itemName = log.order_items?.vegetable_types?.name || 'รายการสินค้า'
    const itemQty = log.order_items?.quantity ? `(${log.order_items.quantity} ${log.order_items.vegetable_types?.unit || 'กก.'})` : ''
    const changer = log.profiles?.full_name || log.profiles?.email?.split('@')[0] || 'ผู้ดูแลระบบ'
    const changerRole = log.profiles?.role === 'admin' ? 'Admin' : log.profiles?.role === 'farmer' ? 'Farmer' : '-'
    const noteCleaned = cleanNoteText(log.note)

    return [
      index + 1,
      formatDateTimeCSV(log.created_at),
      orderId,
      customer,
      customerType,
      `${itemName} ${itemQty}`.trim(),
      changer,
      changerRole,
      log.old_rate || 0,
      log.new_rate || 0,
      discAmount,
      noteCleaned,
    ]
  })

  const summaryRow = [
    'รวมมูลค่าส่วนลดทั้งหมด',
    `จำนวน ${logs.length} รายการ`,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    totalDiscountValue,
    '',
  ]

  const allRows = [discountHeaders, ...dataRows, summaryRow].map(row => row.map(sanitizeCellForExcel))
  const ws = XLSX.utils.aoa_to_sheet(allRows)

  ws['!cols'] = [
    { wch: 8 },  // ลำดับ
    { wch: 22 }, // วัน-เวลาที่ปรับส่วนลด
    { wch: 14 }, // รหัสออเดอร์
    { wch: 22 }, // ลูกค้า
    { wch: 14 }, // ประเภทลูกค้า
    { wch: 26 }, // รายการสินค้า
    { wch: 20 }, // ผู้ปรับ
    { wch: 14 }, // บทบาท
    { wch: 14 }, // ส่วนลดเดิม
    { wch: 14 }, // ส่วนลดใหม่
    { wch: 18 }, // มูลค่าส่วนลด
    { wch: 40 }, // หมายเหตุ
  ]

  for (let r = 1; r <= dataRows.length; r++) {
    const numCell = XLSX.utils.encode_cell({ r, c: 10 })
    if (ws[numCell] && typeof ws[numCell].v === 'number') {
      ws[numCell].z = '#,##0.00'
    }
  }

  const sumIdx = dataRows.length + 1
  const sumCell = XLSX.utils.encode_cell({ r: sumIdx, c: 10 })
  if (ws[sumCell] && typeof ws[sumCell].v === 'number') {
    ws[sumCell].z = '#,##0.00'
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ประวัติส่วนลด')
  downloadExcel(wb, `hydrofarm_discount_audit_logs_${getTodayDateStr()}.xlsx`)
}

/**
 * 3.2 Export ประวัติส่วนลดเป็น CSV (.csv)
 */
export function exportDiscountLogsToCSV(logs = []) {
  let totalDiscountValue = 0

  const rows = logs.map((log, index) => {
    const discAmount = Number(log.discount_amount) || 0
    totalDiscountValue += discAmount

    const orderId = log.order_id ? `#${log.order_id.slice(0, 8).toUpperCase()}` : '-'
    const customer = log.orders?.profiles?.full_name || 'ลูกค้าทั่วไป'
    const customerType = log.orders?.profiles?.customer_type || 'ทั่วไป'
    const itemName = log.order_items?.vegetable_types?.name || 'รายการสินค้า'
    const itemQty = log.order_items?.quantity ? `(${log.order_items.quantity} ${log.order_items.vegetable_types?.unit || 'กก.'})` : ''
    const changer = log.profiles?.full_name || log.profiles?.email?.split('@')[0] || 'ผู้ดูแลระบบ'
    const changerRole = log.profiles?.role === 'admin' ? 'Admin' : log.profiles?.role === 'farmer' ? 'Farmer' : '-'
    const noteCleaned = cleanNoteText(log.note)

    return [
      index + 1,
      `="${formatDateTimeCSV(log.created_at)}"`,
      `="${orderId}"`,
      escapeCSV(customer),
      escapeCSV(customerType),
      escapeCSV(`${itemName} ${itemQty}`.trim()),
      escapeCSV(changer),
      escapeCSV(changerRole),
      `${log.old_rate || 0}%`,
      `${log.new_rate || 0}%`,
      discAmount.toFixed(2),
      escapeCSV(noteCleaned),
    ].join(',')
  })

  const summaryRow = [
    'รวมมูลค่าส่วนลดทั้งหมด',
    `"จำนวน ${logs.length} รายการ"`,
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    totalDiscountValue.toFixed(2),
    '""',
  ].join(',')

  const csvContent = [discountHeaders.map(escapeCSV).join(','), ...rows, summaryRow].join('\r\n')
  downloadCSV(csvContent, `hydrofarm_discount_audit_logs_${getTodayDateStr()}.csv`)
}
