import { addDays, format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'

/**
 * คำนวณวันเริ่มปลูกย้อนหลัง (Backward Scheduling)
 * @param {string} pickupDate  - วันที่ลูกค้าต้องการรับสินค้า (YYYY-MM-DD)
 * @param {number} harvestDays - จำนวนวันปลูกจนเก็บเกี่ยว
 * @returns {{ plantingStart, germinationEnd, transferDate, expectedHarvest }}
 */
export function calculatePlantingSchedule(pickupDate, harvestDays, germinationDays = 7) {
  const harvest = parseISO(pickupDate)
  const plantingStart = addDays(harvest, -harvestDays)
  const germinationEnd = addDays(plantingStart, germinationDays)

  return {
    plantingStart: format(plantingStart, 'yyyy-MM-dd'),
    germinationEnd: format(germinationEnd, 'yyyy-MM-dd'),
    transferDate: format(germinationEnd, 'yyyy-MM-dd'),
    expectedHarvest: pickupDate,
  }
}

/**
 * แสดงวันที่เป็นภาษาไทย
 * @param {string|Date} date
 * @param {string} fmt - รูปแบบ (default: 'd MMMM yyyy')
 */
export function formatDateTh(date, fmt = 'd MMMM yyyy') {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: th })
}

/**
 * แปลงวันที่เป็น format สำหรับ input[type="date"]
 */
export function toInputDate(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

/**
 * วันที่ขั้นต่ำสำหรับ pickup (harvest_days + 1 วันจากวันนี้)
 */
export function getMinPickupDate(harvestDays) {
  return format(addDays(new Date(), harvestDays + 1), 'yyyy-MM-dd')
}

/** แปลง status เป็นข้อความภาษาไทย (ผัก / ค่าเริ่มต้น) */
export const ORDER_STATUS_LABELS = {
  pending:   'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  seeding:   'เพาะเมล็ด',
  growing:   'ลงรางปลูก',
  ready:     'พร้อมส่งมอบ',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
}

/** แปลง status เป็น badge class */
export const ORDER_STATUS_CLASSES = {
  pending:   'badge-pending',
  confirmed: 'badge-confirmed',
  seeding:   'badge-seeding',
  growing:   'badge-growing',
  ready:     'badge-ready',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

/** ลำดับ status ผัก */
export const STATUS_FLOW = ['pending', 'confirmed', 'seeding', 'growing', 'ready', 'completed']

/** ลำดับ status หมวดหมู่อุปกรณ์และชุดปลูก (รอดำเนินการ -> ยืนยันแล้ว -> รอจัดส่ง -> จัดส่งแล้ว) */
export const EQUIPMENT_STATUS_FLOW = ['pending', 'confirmed', 'ready', 'completed']

/** แปลง status สำหรับหมวดหมู่อุปกรณ์ */
export const EQUIPMENT_STATUS_LABELS = {
  pending:   'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  ready:     'รอจัดส่ง',
  completed: 'จัดส่งแล้ว',
  cancelled: 'ยกเลิก',
}

export const EQUIPMENT_STATUS_CLASSES = {
  pending:   'badge-pending',
  confirmed: 'badge-confirmed',
  ready:     'badge-seeding',
  completed: 'badge-ready',
  cancelled: 'badge-cancelled',
}

/** ตรวจสอบว่าออเดอร์เป็นหมวดหมู่อุปกรณ์หรือไม่ */
export function isEquipmentOrder(order) {
  if (!order) return false
  if (order.order_items && order.order_items.length > 0) {
    const hasEquipment = order.order_items.some(
      item => item.vegetable_types?.category === 'equipment' || item.category === 'equipment'
    )
    const hasVegetable = order.order_items.some(
      item => item.vegetable_types?.category === 'vegetable' || item.category === 'vegetable'
    )
    if (hasEquipment && !hasVegetable) return true
    if (hasEquipment) return true
  }
  if (order.notes && (order.notes.includes('จัดส่งถึงบ้าน') || order.notes.includes('📦 จัดส่ง'))) {
    return true
  }
  return false
}

/** status ถัดไป */
export function getNextStatus(currentStatus, isEquipment = false) {
  const flow = isEquipment ? EQUIPMENT_STATUS_FLOW : STATUS_FLOW
  const idx = flow.indexOf(currentStatus)
  return idx >= 0 && idx < flow.length - 1
    ? flow[idx + 1]
    : null
}

/** ดึงชื่อลูกค้าเพื่อแสดงผล (รองรับชื่อโปรไฟล์, อีเมล, ข้อมูลในโน้ต) */
export function getCustomerDisplayName(order) {
  // 1. ถ้ามี full_name ใน profiles และไม่ใช่ค่า default
  if (
    order?.profiles?.full_name?.trim() &&
    order.profiles.full_name.trim() !== 'ลูกค้าทั่วไป' &&
    order.profiles.full_name.trim() !== 'ลูกค้า'
  ) {
    return order.profiles.full_name.trim()
  }

  // 2. ถ้ามี email ใน profiles
  if (order?.profiles?.email?.trim()) {
    return order.profiles.email.split('@')[0]
  }

  // 3. ตรวจสอบใน notes (ผู้สั่งซื้อ / ผู้รับ / ลูกค้า / อีเมล)
  if (order?.notes) {
    const nameMatch = order.notes.match(/(?:ผู้สั่งซื้อ|ผู้รับ|ลูกค้า|ชื่อ):\s*([^\n\r]+)/)
    if (nameMatch && nameMatch[1]?.trim() && nameMatch[1].trim() !== 'ลูกค้าทั่วไป') {
      return nameMatch[1].trim()
    }

    const emailLabelMatch = order.notes.match(/(?:อีเมล|email):\s*([^\n\r]+)/i)
    if (emailLabelMatch && emailLabelMatch[1]?.trim()) {
      return emailLabelMatch[1].trim().split('@')[0]
    }

    const rawEmailMatch = order.notes.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
    if (rawEmailMatch && rawEmailMatch[1]) {
      return rawEmailMatch[1].split('@')[0]
    }
  }

  // 4. ถ้ามีเบอร์โทรศัพท์
  if (order?.profiles?.phone) {
    return `ลูกค้า (${order.profiles.phone})`
  }

  // 5. ถ้ามี customer_id ให้แสดงรหัสย่อของลูกค้าเพื่อให้แยกแยะได้
  if (order?.customer_id) {
    return `ลูกค้า (${order.customer_id.slice(0, 6).toUpperCase()})`
  }

  return 'ลูกค้าทั่วไป'
}

/** ดึงอีเมลลูกค้าเพื่อแสดงผล */
export function getCustomerEmail(order) {
  if (order?.profiles?.email?.trim()) {
    return order.profiles.email.trim()
  }
  if (order?.notes) {
    const match = order.notes.match(/(?:อีเมล|email):\s*([^\n\r]+)/i)
    if (match && match[1]?.trim()) {
      return match[1].trim()
    }
    const rawMatch = order.notes.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
    if (rawMatch && rawMatch[1]) {
      return rawMatch[1].trim()
    }
  }
  return ''
}

/** ดึงเบอร์โทรศัพท์ลูกค้า */
export function getCustomerPhone(order) {
  if (order?.profiles?.phone) {
    return order.profiles.phone
  }
  if (order?.notes) {
    const match = order.notes.match(/(?:โทร|เบอร์โทร|phone):\s*([^\n\r]+)/i)
    if (match && match[1]?.trim()) {
      return match[1].trim()
    }
  }
  return ''
}
