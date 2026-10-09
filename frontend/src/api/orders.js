import { supabase } from './supabaseClient'
import {
  notifyOrderStatus,
  notifyStaffNewOrder,
  notifyCustomerNewOrder,
} from './notifications'
import { removePhotoFromOrderNotes } from '../utils/orderPhotoUtils'


/** Customer: ดูออเดอร์ของตัวเอง */
export async function getMyOrders(customerId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        vegetable_types (id, name, image_url, unit, category, price_per_kg, harvest_days, slots_per_kg)
      )
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Cache flags เพื่อป้องกันการส่ง query ที่ทำให้เกิด HTTP 400/404 ใน console ซ้ำๆ เมื่อ DB ยังไม่ได้ migrate
let supportsCustomerType = null
let supportsDiscountLogs = true

/** ดูออเดอร์รายละเอียด + planting_cycles + รูปภาพ */
export async function getOrderById(orderId) {
  const makeQuery = (profileFields) => `
    *,
    profiles!orders_customer_id_fkey (${profileFields}),
    order_items (
      *,
      vegetable_types (id, name, image_url, unit, harvest_days, category, price_per_kg, slots_per_kg),
      planting_cycles (
        *,
        growing_areas (name, zone_code),
        planting_updates (*)
      )
    )
  `

  // 1. ถ้าเคยตรวจสอบแล้วว่า DB ไม่มี customer_type ให้ดึงเฉพาะฟิลด์พื้นฐานเพื่อไม่ให้เกิด HTTP 400 Bad Request
  if (supportsCustomerType === false) {
    let res = await supabase.from('orders').select(makeQuery('full_name, avatar_url, phone, email')).eq('id', orderId).single()
    if (res.error && res.error.message && res.error.message.includes('email')) {
      res = await supabase.from('orders').select(makeQuery('full_name, avatar_url, phone')).eq('id', orderId).single()
    }
    if (res.error) throw res.error
    return res.data
  }

  // 2. ลองดึงแบบมี customer_type และ email
  let res = await supabase.from('orders').select(makeQuery('full_name, avatar_url, phone, email, customer_type')).eq('id', orderId).single()

  if (!res.error) {
    supportsCustomerType = true
    return res.data
  }

  // 3. ถ้า DB ยังไม่ได้รัน migration customer_type ให้ดึงแบบไม่มี customer_type และจำสถานะไว้
  if (res.error && res.error.message && (res.error.message.includes('customer_type') || res.error.code === '42703')) {
    supportsCustomerType = false
    res = await supabase.from('orders').select(makeQuery('full_name, avatar_url, phone, email')).eq('id', orderId).single()
  }

  // 4. ถ้าไม่มีคอลัมน์ email ให้ดึงเฉพาะข้อมูลพื้นฐาน
  if (res.error && res.error.message && res.error.message.includes('email')) {
    res = await supabase.from('orders').select(makeQuery('full_name, avatar_url, phone')).eq('id', orderId).single()
  }

  if (res.error) throw res.error
  return res.data
}

/** Admin/Farmer: ดูออเดอร์ทั้งหมด */
export async function getAllOrders(filters = {}) {
  const queryWithEmail = `
    *,
    profiles!orders_customer_id_fkey (full_name, avatar_url, phone, email, customer_type),
    order_items (
      id,
      quantity,
      price_at_order,
      unit,
      vegetable_types (id, name, category, unit, image_url)
    )
  `
  const queryWithoutEmail = `
    *,
    profiles!orders_customer_id_fkey (full_name, avatar_url, phone, customer_type),
    order_items (
      id,
      quantity,
      price_at_order,
      unit,
      vegetable_types (id, name, category, unit, image_url)
    )
  `
  let query = supabase.from('orders').select(queryWithEmail).order('created_at', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)

  let { data, error } = await query
  if (error && error.message && error.message.includes('email')) {
    let fallbackQuery = supabase.from('orders').select(queryWithoutEmail).order('created_at', { ascending: false })
    if (filters.status) fallbackQuery = fallbackQuery.eq('status', filters.status)
    const fallbackRes = await fallbackQuery
    if (fallbackRes.error) throw fallbackRes.error
    return fallbackRes.data
  }
  if (error) throw error
  return data
}

/** Customer: สร้างออเดอร์ใหม่ (พร้อมตรวจสอบราคาจากฐานข้อมูลและ Rollback อัตโนมัติหากผิดพลาด) */
export async function createOrder(orderData, items) {
  // 1. ดึงข้อมูลราคาล่าสุดจากฐานข้อมูล (Server-side validation ป้องกันราคาเพี้ยนจาก localStorage)
  const itemIds = items.map(it => it.vegetable_type_id || it.id).filter(Boolean)
  let dbItemsMap = new Map()
  if (itemIds.length > 0) {
    try {
      const { data: dbVegs } = await supabase
        .from('vegetable_types')
        .select('id, name, price_per_kg, unit, category, slots_per_kg')
        .in('id', itemIds)
      if (dbVegs) {
        dbItemsMap = new Map(dbVegs.map(v => [v.id, v]))
      }
    } catch (fetchErr) {
      console.warn('Could not verify item prices from DB, using payload prices:', fetchErr)
    }
  }

  // 2. คำนวณราคาและเตรียมรายการสินค้าด้วยราคาจริงจากฐานข้อมูล
  let validatedTotal = 0
  const validatedItems = items.map(item => {
    const vegId = item.vegetable_type_id || item.id
    const dbVeg = dbItemsMap.get(vegId)
    const price = Number(dbVeg?.price_per_kg ?? item.price_per_kg ?? item.price_at_order ?? item.price ?? 0)
    const qty = Number(item.quantity || item.qty || 1)
    const subtotal = Math.round(qty * price * 100) / 100
    validatedTotal += subtotal

    return {
      vegetable_type_id: vegId,
      quantity: qty,
      price_at_order: price,
      unit: item.unit || dbVeg?.unit || 'กก.',
      slots_required: Number(item.slots_required ?? Math.ceil(qty * (dbVeg?.slots_per_kg || 4))),
    }
  })

  const validatedOrderData = {
    ...orderData,
    total_amount: Math.round(validatedTotal * 100) / 100,
  }

  // 2.5 ตรวจสอบความจุแปลงปลูกก่อนบันทึกออเดอร์ (Double defense)
  if (orderData.pickup_date) {
    const vegItems = validatedItems.filter(item => {
      const dbVeg = dbItemsMap.get(item.vegetable_type_id)
      return dbVeg?.category !== 'equipment'
    }).map(item => {
      const dbVeg = dbItemsMap.get(item.vegetable_type_id)
      return {
        id: item.vegetable_type_id,
        name: dbVeg?.name || 'ผัก',
        qty: item.quantity,
        slots_required: item.slots_required,
        slots_per_kg: dbVeg?.slots_per_kg || 4,
        harvest_days: dbVeg?.harvest_days || 35,
      }
    })

    if (vegItems.length > 0) {
      const capCheck = await checkCartCapacity(orderData.pickup_date, vegItems)
      if (capCheck && !capCheck.canAccept) {
        throw new Error(
          `ไม่สามารถสั่งซื้อได้เนื่องจาก: ${capCheck.reason || 'พื้นที่แปลงปลูกไม่เพียงพอสำหรับวันที่เลือก'}`
        )
      }
    }
  }

  // 3. สร้าง order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert([validatedOrderData])
    .select()
    .single()
  if (orderError) throw orderError

  // 4. สร้าง order_items
  const orderItemsWithId = validatedItems.map(item => ({
    ...item,
    order_id: order.id,
  }))

  const { error: itemError } = await supabase
    .from('order_items')
    .insert(orderItemsWithId)

  // หากสร้างรายการสินค้าไม่สำเร็จ ให้ Rollback ลบ order ทันทีเพื่อป้องกันออเดอร์ว่างค้าง
  if (itemError) {
    try {
      await supabase.from('orders').delete().eq('id', order.id)
    } catch (delErr) {
      console.warn('Failed to rollback order after item error:', delErr)
    }
    throw itemError
  }

  // 5. ส่งการแจ้งเตือนเมื่อสร้างออเดอร์สำเร็จ
  try {
    if (order?.id && order?.customer_id) {
      notifyCustomerNewOrder(order.id, order.customer_id)
      notifyStaffNewOrder(order.id, validatedOrderData.total_amount, '')
    }
  } catch (notifErr) {
    console.warn('Could not send new order notification:', notifErr)
  }

  return order
}

/** Farmer/Admin: อัปเดตสถานะออเดอร์ */
export async function updateOrderStatus(orderId, status, notes = '', isEquipment = false) {
  const updatePayload = { status, updated_at: new Date().toISOString() }
  if (notes) updatePayload.notes = notes

  // เมื่อกดยืนยันออเดอร์ (confirmed) คำนวณและบันทึก final_amount ให้ลูกค้าเห็นราคาหลังหักส่วนลดทันที
  if (status === 'confirmed') {
    try {
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select('quantity, price_at_order, discount_rate, discount_amount, final_price')
        .eq('order_id', orderId)

      const { data: ordData } = await supabase
        .from('orders')
        .select('order_discount_type, order_discount_value, order_discount_amount')
        .eq('id', orderId)
        .single()

      if (!itemsErr && items && items.length > 0) {
        const itemSubtotal = items.reduce((sum, item) => {
          if (item.final_price != null && !isNaN(Number(item.final_price))) {
            return sum + Number(item.final_price)
          }
          const orig = Number(item.quantity) * Number(item.price_at_order)
          const disc = item.discount_amount != null
            ? Number(item.discount_amount)
            : Math.round(orig * ((Number(item.discount_rate) || 0) / 100) * 100) / 100
          return sum + (orig - disc)
        }, 0)

        let orderDiscount = 0
        if (ordData?.order_discount_type === 'percent') {
          orderDiscount = Math.round(itemSubtotal * ((Number(ordData.order_discount_value) || 0) / 100) * 100) / 100
        } else if (ordData?.order_discount_type === 'amount') {
          orderDiscount = Math.min(itemSubtotal, Math.max(0, Number(ordData.order_discount_value) || 0))
        } else {
          orderDiscount = Number(ordData?.order_discount_amount) || 0
        }

        updatePayload.order_discount_amount = orderDiscount
        updatePayload.final_amount = Math.max(0, Math.round((itemSubtotal - orderDiscount) * 100) / 100)
      }
    } catch (finalErr) {
      console.warn('Could not pre-calculate final_amount on confirm:', finalErr)
    }
  }

  let { data, error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .select()
    .single()

  // ถ้า update ล้มเหลวเพราะยังไม่มีคอลัมน์ final_amount ให้ตัดออกแล้วอัปเดตใหม่
  if (error && (error.code === '42703' || error.message?.includes('final_amount'))) {
    delete updatePayload.final_amount
    const retry = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error

  // ตัดสต็อกอุปกรณ์อัตโนมัติเมื่อยืนยันออเดอร์ หรือเมื่อเลื่อนสถานะเป็น confirmed, ready หรือ completed
  if (['confirmed', 'ready', 'completed'].includes(status)) {
    try {
      await deductEquipmentStock(orderId)
    } catch (err) {
      console.warn('Failed to deduct equipment stock:', err)
    }
  }

  // ซิงค์สถานะ planting_cycles ให้สอดคล้องกับสถานะ order เสมอ (สำหรับผัก)
  try {
    await syncOrderPlantingCycles(orderId, status, isEquipment)
  } catch (syncErr) {
    console.warn('Failed to sync planting_cycles in updateOrderStatus:', syncErr)
  }

  // ส่งการแจ้งเตือนไปยังลูกค้าเมื่อสถานะออเดอร์เปลี่ยน
  if (data?.customer_id) {
    try {
      const isEq = Boolean(isEquipment) || (data.notes && (data.notes.includes('จัดส่งถึงบ้าน') || data.notes.includes('📦 จัดส่ง')))
      await notifyOrderStatus(orderId, data.customer_id, status, isEq)
    } catch (notifErr) {
      console.warn('Failed to send order status notification:', notifErr)
    }
  }

  return data
}

/** Sync สถานะ planting_cycles ให้ตรงกับ order ที่เกี่ยวข้อง */
export async function syncOrderPlantingCycles(orderId, orderStatus, isEquipment = false) {
  if (isEquipment || !orderId) return

  const cycleStatusMap = {
    seeding: 'seeding',
    growing: 'growing',
    ready: 'ready',
    completed: 'done',
    delivered: 'done',
    cancelled: 'cancelled',
  }

  const cycleStatus = cycleStatusMap[orderStatus]
  if (!cycleStatus) return

  try {
    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('id')
      .eq('order_id', orderId)

    if (itemsErr || !items || items.length === 0) return

    const itemIds = items.map(i => i.id)
    const todayStr = new Date().toISOString().split('T')[0]
    const updatePayload = { status: cycleStatus }

    if (cycleStatus === 'done' || orderStatus === 'ready' || orderStatus === 'completed' || orderStatus === 'delivered') {
      updatePayload.actual_harvest_date = todayStr
    }

    // เมื่อสถานะเป็น seeding (เพาะเมล็ด) หรือ growing (ลงรางปลูก)
    // ถือว่าเริ่มปลูกจริงแล้ว: ปรับ planting_start_date เป็นวันนี้ หากวันเดิมยังอยู่ในอนาคตหรือยังไม่กำหนด
    if (cycleStatus === 'seeding' || cycleStatus === 'growing') {
      const { data: currentCycles } = await supabase
        .from('planting_cycles')
        .select('id, planting_start_date')
        .in('order_item_id', itemIds)

      if (currentCycles && currentCycles.length > 0) {
        for (const cycle of currentCycles) {
          const cycleUpdate = { ...updatePayload }
          if (!cycle.planting_start_date || cycle.planting_start_date > todayStr) {
            cycleUpdate.planting_start_date = todayStr
          }
          await supabase
            .from('planting_cycles')
            .update(cycleUpdate)
            .eq('id', cycle.id)
        }
        return
      }
    }

    const { error: updateErr } = await supabase
      .from('planting_cycles')
      .update(updatePayload)
      .in('order_item_id', itemIds)

    if (updateErr) {
      console.warn('Failed to update planting_cycles for order:', orderId, updateErr)
    }
  } catch (err) {
    console.warn('syncOrderPlantingCycles error:', err)
  }
}

/**
 * ตรวจสอบและซิงค์รอบปลูก (planting_cycles) ที่ตกค้างให้ตรงกับสถานะจริงของ order
 * เช่น order เป็น completed/cancelled/ลบไปแล้ว แต่ cycle ยังค้างเป็น scheduled/seeding/growing
 */
export async function cleanupDesyncedPlantingCycles() {
  try {
    const { data: cycles, error } = await supabase
      .from('planting_cycles')
      .select(`
        id,
        status,
        slots_used,
        planting_start_date,
        vegetable_type_id,
        order_item_id,
        order_items (
          order_id,
          orders (id, status)
        )
      `)
      .in('status', ['scheduled', 'seeding', 'growing', 'ready'])

    if (error || !cycles || cycles.length === 0) return { updated: 0 }

    const doneIds = []
    const cancelIds = []
    const syncActiveCycles = []
    const todayStr = new Date().toISOString().split('T')[0]

    for (const c of cycles) {
      // กรณีรอบปลูกว่างเปล่า/ทดสอบ (ไม่มี order_item และไม่มี vegetable_type) หรือ slots_used <= 0
      if ((!c.order_item_id && !c.vegetable_type_id) || (Number(c.slots_used) || 0) <= 0) {
        cancelIds.push(c.id)
        continue
      }

      // กรณีรอบปลูกผูกกับ order_item แต่ order ถูกลบออกจากระบบไปแล้ว
      if (c.order_item_id && (!c.order_items || !c.order_items?.orders)) {
        cancelIds.push(c.id)
        continue
      }

      const orderStatus = c.order_items?.orders?.status
      if (orderStatus === 'completed' || orderStatus === 'delivered') {
        doneIds.push(c.id)
      } else if (orderStatus === 'cancelled') {
        cancelIds.push(c.id)
      } else if (orderStatus === 'seeding' || orderStatus === 'growing') {
        // หากออเดอร์อยู่ในสถานะเริ่มปลูกแล้ว (seeding หรือ growing)
        // ซิงค์สถานะรอบปลูกให้ตรง และปรับวันเริ่มปลูกให้เป็นวันนี้หากวันเดิมยังอยู่ในอนาคต
        const needStatusSync = c.status !== orderStatus
        const needStartDateSync = Boolean(c.planting_start_date && c.planting_start_date > todayStr)
        if (needStatusSync || needStartDateSync) {
          syncActiveCycles.push({
            id: c.id,
            status: orderStatus,
            planting_start_date: needStartDateSync ? todayStr : c.planting_start_date
          })
        }
      }
    }

    let updatedCount = 0

    if (doneIds.length > 0) {
      const { error: doneErr } = await supabase
        .from('planting_cycles')
        .update({ status: 'done', actual_harvest_date: todayStr })
        .in('id', doneIds)
      if (!doneErr) updatedCount += doneIds.length
    }

    if (cancelIds.length > 0) {
      const { error: cancelErr } = await supabase
        .from('planting_cycles')
        .update({ status: 'cancelled' })
        .in('id', cancelIds)
      if (!cancelErr) updatedCount += cancelIds.length
    }

    if (syncActiveCycles.length > 0) {
      for (const sc of syncActiveCycles) {
        const updatePayload = { status: sc.status }
        if (sc.planting_start_date) updatePayload.planting_start_date = sc.planting_start_date
        const { error: sErr } = await supabase
          .from('planting_cycles')
          .update(updatePayload)
          .eq('id', sc.id)
        if (!sErr) updatedCount++
      }
    }

    return { updated: updatedCount }
  } catch (err) {
    console.warn('cleanupDesyncedPlantingCycles error:', err)
    return { updated: 0, error: err }
  }
}

/** ปรับส่วนลดต่อรายการสินค้า (order_items) พร้อมบันทึกประวัติ discount_logs */
export async function applyOrderItemDiscount(orderId, orderItemId, discountRate, note = '', changedBy = null) {
  const rate = Math.max(0, Math.min(100, Number(discountRate) || 0))

  // 1. ลองเรียกผ่าน Stored Procedure apply_item_discount ก่อน (Atomic + Security Definer)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('apply_item_discount', {
      p_order_item_id: orderItemId,
      p_discount_rate: rate,
      p_note: note || null,
      p_changed_by: changedBy || null,
    })

    if (!rpcError && rpcData && rpcData.success) {
      supportsDiscountLogs = true
      return rpcData
    }
  } catch (rpcErr) {
    console.warn('RPC apply_item_discount not available or errored, using client fallback:', rpcErr)
  }

  // 2. Client fallback กรณีไม่มี RPC
  let item = null
  const { data: itemWithDisc, error: fetchErr } = await supabase
    .from('order_items')
    .select('id, quantity, price_at_order, discount_rate')
    .eq('id', orderItemId)
    .single()

  if (fetchErr) {
    const { data: baseItem, error: baseErr } = await supabase
      .from('order_items')
      .select('id, quantity, price_at_order')
      .eq('id', orderItemId)
      .single()
    if (baseErr) throw baseErr
    item = baseItem
  } else {
    item = itemWithDisc
  }

  const oldRate = Number(item.discount_rate) || 0
  const origTotal = Number(item.quantity) * Number(item.price_at_order)
  const discountAmount = Math.round(origTotal * (rate / 100) * 100) / 100
  const finalPrice = Math.round((origTotal - discountAmount) * 100) / 100

  // อัปเดต order_items
  const { data: updatedItem, error: updateErr } = await supabase
    .from('order_items')
    .update({
      discount_rate: rate,
      discount_amount: discountAmount,
      final_price: finalPrice,
    })
    .eq('id', orderItemId)
    .select()
    .single()

  if (updateErr) {
    if (updateErr.code === '42703' || updateErr.message?.includes('discount_rate')) {
      throw new Error('ฐานข้อมูล Supabase ยังไม่มีคอลัมน์ส่วนลด กรุณารันไฟล์ migration_fix_discount_and_profiles.sql ใน Supabase SQL Editor ก่อนใช้งานฟังก์ชันนี้')
    }
    throw updateErr
  }

  // บันทึก log ลง discount_logs (ถ้ามีตาราง)
  if (supportsDiscountLogs) {
    try {
      const { error: logErr } = await supabase.from('discount_logs').insert([{
        order_id: orderId,
        order_item_id: orderItemId,
        changed_by: changedBy || null,
        old_rate: oldRate,
        new_rate: rate,
        discount_amount: discountAmount,
        note: note || null,
      }])
      if (logErr && (logErr.code === 'PGRST205' || logErr.code === '42P01')) {
        supportsDiscountLogs = false
      }
    } catch (logErr) {
      supportsDiscountLogs = false
    }
  }

  // หาก order นั้น confirm แล้ว ให้ sync orders.final_amount
  try {
    const { data: ord } = await supabase
      .from('orders')
      .select('status, order_discount_type, order_discount_value, order_discount_amount')
      .eq('id', orderId)
      .single()

    if (ord && ord.status !== 'pending' && ord.status !== 'cancelled') {
      const { data: allItems } = await supabase
        .from('order_items')
        .select('quantity, price_at_order, final_price')
        .eq('order_id', orderId)

      if (allItems) {
        const itemSubtotal = allItems.reduce((acc, it) => {
          return acc + (it.final_price != null ? Number(it.final_price) : Number(it.quantity) * Number(it.price_at_order))
        }, 0)

        let orderDiscount = 0
        if (ord.order_discount_type === 'percent') {
          orderDiscount = Math.round(itemSubtotal * ((Number(ord.order_discount_value) || 0) / 100) * 100) / 100
        } else if (ord.order_discount_type === 'amount') {
          orderDiscount = Math.min(itemSubtotal, Math.max(0, Number(ord.order_discount_value) || 0))
        } else {
          orderDiscount = Number(ord.order_discount_amount) || 0
        }

        const finalAmount = Math.max(0, Math.round((itemSubtotal - orderDiscount) * 100) / 100)

        await supabase
          .from('orders')
          .update({
            order_discount_amount: orderDiscount,
            final_amount: finalAmount,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
      }
    }
  } catch (syncErr) {
    // ละเว้นหาก DB ยังไม่มีคอลัมน์ final_amount
  }

  return {
    success: true,
    discount_rate: rate,
    discount_amount: discountAmount,
    final_price: finalPrice,
    item: updatedItem,
  }
}

/** ปรับส่วนลดทั้งออเดอร์ (order-level discount: amount หรือ percent) พร้อมบันทึกประวัติ discount_logs */
export async function applyOrderDiscount(orderId, { discountType, discountValue, note = '', changedBy = null }) {
  const normType = ['percent', 'amount'].includes(discountType) ? discountType : null
  const numValue = Math.max(0, Number(discountValue) || 0)

  // 1. ลองเรียกผ่าน Stored Procedure apply_order_discount ก่อน (Atomic + Security Definer)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('apply_order_discount', {
      p_order_id: orderId,
      p_discount_type: normType,
      p_discount_value: numValue,
      p_note: note || null,
      p_changed_by: changedBy || null,
    })

    if (!rpcError && rpcData && rpcData.success) {
      supportsDiscountLogs = true
      return rpcData
    }
  } catch (rpcErr) {
    console.warn('RPC apply_order_discount not available or errored, using client fallback:', rpcErr)
  }

  // 2. Client fallback กรณีไม่มี RPC หรือ RPC ไม่พร้อม
  const { data: ord, error: ordErr } = await supabase
    .from('orders')
    .select('id, status, total_amount')
    .eq('id', orderId)
    .single()
  if (ordErr) throw ordErr

  if (!['waiting_cycle', 'pending', 'scheduling'].includes(ord.status)) {
    throw new Error('ไม่สามารถแก้ไขส่วนลดได้เนื่องจากออเดอร์ได้รับการยืนยันแล้ว')
  }

  // ดึง order_items เพื่อคำนวณ Subtotal หลังหักส่วนลดต่อรายการ
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('quantity, price_at_order, discount_rate, discount_amount, final_price')
    .eq('order_id', orderId)
  if (itemsErr) throw itemsErr

  const subtotal = (items || []).reduce((sum, it) => {
    if (it.final_price != null && !isNaN(Number(it.final_price))) {
      return sum + Number(it.final_price)
    }
    const orig = Number(it.quantity) * Number(it.price_at_order)
    const disc = it.discount_amount != null
      ? Number(it.discount_amount)
      : Math.round(orig * ((Number(it.discount_rate) || 0) / 100) * 100) / 100
    return sum + (orig - disc)
  }, 0)

  let calculatedDiscount = 0
  let storedValue = numValue

  if (normType === 'percent') {
    storedValue = Math.min(100, numValue)
    calculatedDiscount = Math.round(subtotal * (storedValue / 100) * 100) / 100
  } else if (normType === 'amount') {
    calculatedDiscount = Math.min(subtotal, numValue)
  } else {
    storedValue = 0
    calculatedDiscount = 0
  }

  const finalAmount = Math.max(0, Math.round((subtotal - calculatedDiscount) * 100) / 100)

  // อัปเดต orders
  const updatePayload = {
    order_discount_type: normType,
    order_discount_value: storedValue,
    order_discount_amount: calculatedDiscount,
    order_discount_note: note || null,
    final_amount: finalAmount,
    updated_at: new Date().toISOString(),
  }

  const { data: updatedOrder, error: updateErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .select()
    .single()

  if (updateErr) {
    if (updateErr.code === '42703' || updateErr.message?.includes('order_discount')) {
      throw new Error('ฐานข้อมูล Supabase ยังไม่มีคอลัมน์ส่วนลดระดับออเดอร์ กรุณารันไฟล์ migration_add_order_level_discount.sql ใน Supabase SQL Editor ก่อนใช้งานฟังก์ชันนี้')
    }
    throw updateErr
  }

  // บันทึก log ลง discount_logs (order_item_id = null)
  if (supportsDiscountLogs) {
    try {
      await supabase.from('discount_logs').insert([{
        order_id: orderId,
        order_item_id: null,
        changed_by: changedBy || null,
        discount_type: normType ? `order_${normType}` : 'order_clear',
        discount_value: storedValue,
        discount_amount: calculatedDiscount,
        note: note || null,
      }])
    } catch (logErr) {
      console.warn('Could not insert whole-order discount log:', logErr)
    }
  }

  return {
    success: true,
    order_discount_type: normType,
    order_discount_value: storedValue,
    order_discount_amount: calculatedDiscount,
    final_amount: finalAmount,
    order: updatedOrder,
  }
}

/** ดึงประวัติการปรับส่วนลดของออเดอร์ (discount_logs) */
export async function getOrderDiscountLogs(orderId) {
  if (!supportsDiscountLogs) {
    return []
  }

  try {
    const { data, error } = await supabase
      .from('discount_logs')
      .select(`
        *,
        profiles:changed_by (full_name, role)
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (error) {
      // ถ้าตาราง discount_logs ยังไม่ได้สร้างใน Supabase ให้จดจำไว้และไม่แสดง warning รก console
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('schema cache')) {
        supportsDiscountLogs = false
        return []
      }
      console.warn('Could not load discount_logs:', error)
      return []
    }

    supportsDiscountLogs = true
    return data || []
  } catch (err) {
    supportsDiscountLogs = false
    return []
  }
}

/** Admin: ดึงประวัติการปรับส่วนลดทั้งหมดในระบบ (Discount Audit Logs) */
export async function getAllDiscountLogs(limit = 100) {
  if (!supportsDiscountLogs) return []
  try {
    const { data, error } = await supabase
      .from('discount_logs')
      .select(`
        *,
        profiles:changed_by (full_name, role, email),
        orders:order_id (
          id, pickup_date, status, total_amount, final_amount,
          profiles:customer_id (full_name, customer_type)
        ),
        order_items:order_item_id (
          id, quantity, price_at_order,
          vegetable_types (name, unit)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('schema cache')) {
        supportsDiscountLogs = false
        return []
      }
      const fallback = await supabase
        .from('discount_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      return fallback.data || []
    }

    supportsDiscountLogs = true
    return data || []
  } catch (err) {
    console.warn('getAllDiscountLogs error:', err)
    return []
  }
}


/** ตัดสต็อก resource สำหรับ order_items ที่เป็น equipment และผูก resource_id ไว้ */
export async function deductEquipmentStock(orderId) {
  // ตรวจสอบว่าเคยตัดสต็อกสำหรับออเดอร์นี้ไปแล้วหรือไม่
  const { data: existingTx } = await supabase
    .from('resource_transactions')
    .select('id')
    .eq('related_order_id', orderId)
    .limit(1)

  if (existingTx && existingTx.length > 0) return

  // 1. ลองตัดสต็อกด้วย Stored Procedure deduct_order_equipment_stock แบบ Atomic
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('deduct_order_equipment_stock', {
      p_order_id: orderId,
    })
    if (!rpcErr && rpcRes && rpcRes.success && rpcRes.deducted_count > 0) {
      return
    }
  } catch (err) {
    console.warn('RPC deduct_order_equipment_stock failed, falling back:', err)
  }

  // 2. ดึง order_items ของ order นี้
  const { data: orderItems, error: itemsErr } = await supabase
    .from('order_items')
    .select('quantity, vegetable_type_id')
    .eq('order_id', orderId)

  if (itemsErr || !orderItems || orderItems.length === 0) return

  const vegIds = orderItems.map(i => i.vegetable_type_id).filter(Boolean)
  const { data: vegs } = await supabase
    .from('vegetable_types')
    .select('id, name, category, resource_id')
    .in('id', vegIds)

  const vegMap = new Map((vegs || []).map(v => [v.id, v]))

  for (const item of orderItems) {
    const veg = vegMap.get(item.vegetable_type_id)
    if (!veg || veg.category !== 'equipment' || !veg.resource_id) continue

    const resourceId = veg.resource_id
    const qty = Number(item.quantity) || 1
    const itemName = veg.name

    let adjusted = false
    try {
      const { data: rpcQty, error: rpcErr } = await supabase.rpc('adjust_resource_qty', {
        r_id: resourceId,
        delta: -qty,
      })
      if (!rpcErr && rpcQty !== null) {
        adjusted = true
      }
    } catch {}

    if (!adjusted) {
      const { data: res } = await supabase
        .from('resources')
        .select('current_qty')
        .eq('id', resourceId)
        .single()

      if (res) {
        await supabase
          .from('resources')
          .update({ current_qty: Math.max(0, (Number(res.current_qty) || 0) - qty) })
          .eq('id', resourceId)
      }
    }

    // บันทึก transaction log พร้อม related_order_id
    await supabase.from('resource_transactions').insert([{
      resource_id: resourceId,
      transaction_type: 'out',
      quantity: qty,
      related_order_id: orderId,
      notes: `ตัดสต็อกอัตโนมัติ: ยืนยันออเดอร์ ${orderId.slice(0, 8).toUpperCase()} (${itemName})`,
    }])
  }
}

/** Farmer: อัปโหลดรูปภาพการเจริญเติบโต */
export async function addPlantingUpdate(plantingCycleId, { status, photo_url, caption, updated_by }) {
  const { data, error } = await supabase
    .from('planting_updates')
    .insert([{ planting_cycle_id: plantingCycleId, status, photo_url, caption, updated_by }])
    .select()
    .single()
  if (error) throw error
  return data
}

/** Farmer/Admin: ลบรูปภาพอัปเดตของออเดอร์ (ลบทั้งจาก planting_updates, order.notes และ Supabase Storage) */
export async function deleteOrderPhoto(order, photo) {
  if (!order || !photo) return false

  let anySuccess = false

  // 1. ลบจาก planting_updates ถ้ามีในตาราง DB
  try {
    if (photo.id && !photo.id.startsWith('emb_') && !photo.id.startsWith('p_') && !photo.id.startsWith('upd_')) {
      const { error: idErr } = await supabase.from('planting_updates').delete().eq('id', photo.id)
      if (!idErr) anySuccess = true
    }
    if (photo.photo_url) {
      const { error: urlErr } = await supabase.from('planting_updates').delete().eq('photo_url', photo.photo_url)
      if (!urlErr) anySuccess = true
    }
  } catch (err) {
    console.warn('Delete from planting_updates note:', err)
  }

  // 2. ลบออกจาก order.notes
  try {
    const updatedNotes = removePhotoFromOrderNotes(order.notes || '', photo)
    const { error: noteErr } = await supabase
      .from('orders')
      .update({ notes: updatedNotes })
      .eq('id', order.id)

    if (noteErr) throw noteErr
    anySuccess = true
  } catch (err) {
    console.error('Failed to update order notes after deleting photo:', err)
    throw err
  }

  // 3. ลบออกจาก Supabase Storage (growth-photos bucket) ถ้าเป็นไฟล์ storage
  try {
    if (photo.photo_url && photo.photo_url.includes('growth-photos/')) {
      const path = photo.photo_url.split('growth-photos/')[1]?.split('?')[0]
      if (path) {
        await supabase.storage.from('growth-photos').remove([decodeURIComponent(path)])
      }
    }
  } catch (storageErr) {
    console.warn('Delete from storage note:', storageErr)
  }

  return anySuccess
}

/**
 * ตรวจสอบ capacity ของแปลงปลูกสำหรับรายการผักในตะกร้าทั้งหมด (Waterfall Dedicated -> Shared Allocation)
 * รองรับทั้งการตรวจสอบผักชนิดเดียวและหลายชนิดพร้อมกันแบบจำลองการจัดสรรจริง
 * @param {string} pickupDate - วันที่เก็บเกี่ยว / รับสินค้า
 * @param {Array} cartItems - รายการผัก [{ id, name, qty, slots_per_kg, slots_required, harvest_days }]
 * @param {number} fallbackSlotsNeeded - จำนวน slot สำรอง (กรณีไม่ส่ง cartItems)
 * @param {number} fallbackHarvestDays - จำนวนวันปลูกสำรอง
 */
export async function checkCartCapacity(pickupDate, cartItems = [], fallbackSlotsNeeded = 0, fallbackHarvestDays = 35) {
  if (!pickupDate) {
    return {
      total: 0,
      used: 0,
      available: 0,
      slotsNeeded: 0,
      canAccept: false,
      reason: 'กรุณาระบุวันที่รับสินค้า',
      itemBreakdown: [],
      areas: [],
    }
  }

  const items = Array.isArray(cartItems) ? cartItems.filter(Boolean) : []
  const maxDays = items.length > 0
    ? Math.max(...items.map(i => Number(i.harvest_days) || fallbackHarvestDays || 35))
    : (Number(fallbackHarvestDays) || 35)

  // 1. ดึงข้อมูลแปลงปลูกที่ active ทั้งหมดจาก จัดการพื้นที่ปลูก (growing_areas)
  const { data: allActiveAreas, error: areasError } = await supabase
    .from('growing_areas')
    .select('id, name, zone_code, total_slots, vegetable_type_id, vegetable_types(id, name)')
    .eq('is_active', true)
    .order('name')

  if (areasError) console.error('Error fetching growing_areas:', areasError)

  const activeAreas = allActiveAreas || []

  // 2. จัดกลุ่มแปลงปลูก: แปลงเฉพาะ (Dedicated) และ แปลงรวม (Shared)
  const dedicatedAreasMap = {} // vegId -> [areas]
  const dedicatedCapMap = {}   // vegId -> number
  const sharedAreas = []
  let sharedCapacity = 0

  activeAreas.forEach(a => {
    const slots = Number(a.total_slots) || 0
    if (a.vegetable_type_id) {
      if (!dedicatedAreasMap[a.vegetable_type_id]) {
        dedicatedAreasMap[a.vegetable_type_id] = []
        dedicatedCapMap[a.vegetable_type_id] = 0
      }
      dedicatedAreasMap[a.vegetable_type_id].push(a)
      dedicatedCapMap[a.vegetable_type_id] += slots
    } else {
      sharedAreas.push(a)
      sharedCapacity += slots
    }
  })

  // Fallback กรณีที่ฟาร์มยังไม่ได้สร้างแปลงปลูกในระบบเลย ให้ดึงจาก farm_settings
  if (activeAreas.length === 0) {
    const { data: settings } = await supabase
      .from('farm_settings')
      .select('total_slots')
      .single()
    const farmCap = Number(settings?.total_slots) || 0
    sharedCapacity = farmCap
    sharedAreas.push({ id: 'fallback', name: 'แปลงรวมฟาร์ม', total_slots: farmCap })
  }

  // คำนวณช่วงวันที่ผักออเดอร์นี้จะเติบโตในแปลง
  const targetEnd = new Date(pickupDate)
  const targetStart = new Date(targetEnd)
  targetStart.setDate(targetStart.getDate() - maxDays)

  // 3. ดึงออเดอร์ของลูกค้าทั้งหมดที่กำลังอยู่ในกระบวนการปลูกและทับซ้อนช่วงเวลานี้
  const { data: activeOrders, error: ordersError } = await supabase
    .from('orders')
    .select(`
      id, pickup_date, status,
      order_items (
        id, quantity, slots_required, vegetable_type_id,
        vegetable_types (id, harvest_days, slots_per_kg)
      )
    `)
    .in('status', ['waiting_cycle', 'pending', 'confirmed', 'seeding', 'growing', 'ready'])

  if (ordersError) console.error('Error fetching orders for capacity:', ordersError)

  // 4. ดึงรอบปลูก standalone ที่ไม่ได้ผูกกับ order_item_id
  const { data: standaloneCycles, error: cyclesError } = await supabase
    .from('planting_cycles')
    .select('slots_used, planting_start_date, expected_harvest_date, vegetable_type_id')
    .is('order_item_id', null)
    .not('status', 'in', '("done","cancelled")')

  if (cyclesError) console.error('Error fetching cycles for capacity:', cyclesError)

  // 5. จำลองการจัดสรร Waterfall สำหรับออเดอร์เดิมและรอบปลูกเดิมที่มีอยู่แล้ว
  const dedicatedUsedMap = {}
  let sharedUsed = 0
  let overlappingOrders = 0

  for (const order of activeOrders || []) {
    if (!order.pickup_date) continue
    const orderEnd = new Date(order.pickup_date)
    let orderOverlapped = false

    for (const item of order.order_items || []) {
      const itemDays = Number(item.vegetable_types?.harvest_days) || maxDays || 35
      const itemStart = new Date(orderEnd)
      itemStart.setDate(itemStart.getDate() - itemDays)

      if (itemStart <= targetEnd && orderEnd >= targetStart) {
        orderOverlapped = true
        const itemSlots = Number(item.slots_required) ||
          Math.ceil(Number(item.quantity) * (Number(item.vegetable_types?.slots_per_kg) || 4))
        const vId = item.vegetable_type_id
        const dedCap = (vId && dedicatedCapMap[vId]) || 0

        if (dedCap > 0) {
          const curUsed = dedicatedUsedMap[vId] || 0
          if (curUsed + itemSlots <= dedCap) {
            dedicatedUsedMap[vId] = curUsed + itemSlots
          } else {
            const room = Math.max(0, dedCap - curUsed)
            dedicatedUsedMap[vId] = dedCap
            sharedUsed += (itemSlots - room)
          }
        } else {
          sharedUsed += itemSlots
        }
      }
    }
    if (orderOverlapped) overlappingOrders++
  }

  for (const cycle of standaloneCycles || []) {
    if (!cycle.planting_start_date) continue
    const cStart = new Date(cycle.planting_start_date)
    const cEnd = cycle.expected_harvest_date
      ? new Date(cycle.expected_harvest_date)
      : new Date(cStart.getTime() + maxDays * 86400000)

    if (cStart <= targetEnd && cEnd >= targetStart) {
      const cycleSlots = Number(cycle.slots_used) || 0
      const vId = cycle.vegetable_type_id
      const dedCap = (vId && dedicatedCapMap[vId]) || 0

      if (dedCap > 0) {
        const curUsed = dedicatedUsedMap[vId] || 0
        if (curUsed + cycleSlots <= dedCap) {
          dedicatedUsedMap[vId] = curUsed + cycleSlots
        } else {
          const room = Math.max(0, dedCap - curUsed)
          dedicatedUsedMap[vId] = dedCap
          sharedUsed += (cycleSlots - room)
        }
      } else {
        sharedUsed += cycleSlots
      }
    }
  }

  // 6. จำลองการจัดสรรสำหรับสินค้าใหม่ในตะกร้า (Cart Items)
  const remainingDedicated = {}
  Object.keys(dedicatedCapMap).forEach(vId => {
    remainingDedicated[vId] = Math.max(0, (dedicatedCapMap[vId] || 0) - (dedicatedUsedMap[vId] || 0))
  })
  let remainingShared = Math.max(0, sharedCapacity - sharedUsed)

  let overallCanAccept = true
  const shortageReasons = []
  const itemBreakdown = []
  let totalSlotsNeeded = 0

  if (items.length > 0) {
    for (const item of items) {
      const vId = item.id || item.vegetable_type_id
      const needed = Number(item.slots_required) ||
        Math.ceil(Number(item.qty || 1) * (Number(item.slots_per_kg) || 4))
      totalSlotsNeeded += needed

      let unallocated = needed
      let fromDedicated = 0
      let fromShared = 0

      if (vId && (remainingDedicated[vId] || 0) > 0) {
        fromDedicated = Math.min(unallocated, remainingDedicated[vId])
        remainingDedicated[vId] -= fromDedicated
        unallocated -= fromDedicated
      }

      if (unallocated > 0) {
        if (remainingShared >= unallocated) {
          fromShared = unallocated
          remainingShared -= unallocated
          unallocated = 0
        } else {
          fromShared = remainingShared
          unallocated -= remainingShared
          remainingShared = 0
        }
      }

      const itemCanAccept = unallocated === 0
      if (!itemCanAccept) {
        overallCanAccept = false
        shortageReasons.push(`${item.name || 'ผัก'}: พื้นที่แปลงปลูกไม่พอ (ต้องการ ${needed} ช่อง, ขาดอีก ${unallocated} ช่อง)`)
      }

      const dedAreas = (vId && dedicatedAreasMap[vId]) || []
      const dedName = dedAreas.map(a => a.name + (a.zone_code && a.zone_code !== a.name ? ` (${a.zone_code})` : '')).join(', ')

      itemBreakdown.push({
        id: vId,
        name: item.name || 'ผัก',
        qty: item.qty || 1,
        slotsNeeded: needed,
        fromDedicated,
        fromShared,
        shortage: unallocated,
        canAccept: itemCanAccept,
        dedicatedAreaName: dedName,
        hasDedicated: dedAreas.length > 0,
        dedicatedTotal: dedAreas.reduce((s, a) => s + (Number(a.total_slots) || 0), 0),
        dedicatedAvailBefore: Math.max(0, (dedicatedCapMap[vId] || 0) - (dedicatedUsedMap[vId] || 0)),
      })
    }
  } else {
    totalSlotsNeeded = Number(fallbackSlotsNeeded) || 0
    if (totalSlotsNeeded > 0 && remainingShared < totalSlotsNeeded) {
      overallCanAccept = false
      shortageReasons.push(`พื้นที่แปลงปลูกไม่พอ (ต้องการ ${totalSlotsNeeded} ช่อง, ว่าง ${remainingShared} ช่อง)`)
    }
    remainingShared = Math.max(0, remainingShared - totalSlotsNeeded)
  }

  // 7. คำนวณสรุปความจุสำหรับแสดงผล
  const targetItemVids = items.map(i => i.id || i.vegetable_type_id).filter(Boolean)
  let relevantDedicatedCap = 0
  let relevantDedicatedUsed = 0
  let relevantDedicatedAvail = 0

  if (targetItemVids.length > 0) {
    targetItemVids.forEach(vId => {
      relevantDedicatedCap += dedicatedCapMap[vId] || 0
      relevantDedicatedUsed += dedicatedUsedMap[vId] || 0
      relevantDedicatedAvail += Math.max(0, (dedicatedCapMap[vId] || 0) - (dedicatedUsedMap[vId] || 0))
    })
  } else {
    Object.keys(dedicatedCapMap).forEach(vId => {
      relevantDedicatedCap += dedicatedCapMap[vId] || 0
      relevantDedicatedUsed += dedicatedUsedMap[vId] || 0
      relevantDedicatedAvail += Math.max(0, (dedicatedCapMap[vId] || 0) - (dedicatedUsedMap[vId] || 0))
    })
  }

  const initialAvailableShared = Math.max(0, sharedCapacity - sharedUsed)
  const totalCapacity = relevantDedicatedCap + sharedCapacity
  const totalUsed = relevantDedicatedUsed + sharedUsed
  const totalAvailable = relevantDedicatedAvail + initialAvailableShared

  const dedicatedAreaNames = []
  targetItemVids.forEach(vId => {
    const list = dedicatedAreasMap[vId] || []
    list.forEach(a => {
      const name = a.name + (a.zone_code && a.zone_code !== a.name ? ` (${a.zone_code})` : '')
      if (!dedicatedAreaNames.includes(name)) dedicatedAreaNames.push(name)
    })
  })
  const dedicatedAreaName = dedicatedAreaNames.join(', ')
  const sharedAreaName = sharedAreas.map(a => a.name + (a.zone_code && a.zone_code !== a.name ? ` (${a.zone_code})` : '')).join(', ')

  let areaDisplayName = 'แปลงปลูก'
  if (dedicatedAreaName && sharedAreaName) {
    areaDisplayName = `แปลงเฉพาะ (${dedicatedAreaName}) + แปลงรวม (${sharedAreaName})`
  } else if (dedicatedAreaName) {
    areaDisplayName = `แปลงเฉพาะ (${dedicatedAreaName})`
  } else if (sharedAreaName) {
    areaDisplayName = `แปลงรวม (${sharedAreaName})`
  }

  let reason = 'พื้นที่แปลงปลูกมีเพียงพอ'
  if (totalCapacity === 0) {
    reason = 'ยังไม่มีแปลงปลูกที่เปิดใช้งานสำหรับผักชนิดนี้'
  } else if (totalAvailable <= 0) {
    reason = 'พื้นที่แปลงปลูกเต็มแล้วในวันที่เลือก'
  } else if (!overallCanAccept) {
    reason = shortageReasons.join(', ')
  }

  const canAccept = totalCapacity > 0 && overallCanAccept && totalAvailable >= totalSlotsNeeded

  return {
    total: totalCapacity,
    used: totalUsed,
    available: totalAvailable,
    slotsNeeded: totalSlotsNeeded,
    canAccept,
    reason,
    occupancyRate: totalCapacity > 0 ? Math.min(100, Math.round((totalUsed / totalCapacity) * 100)) : 100,
    activeOrdersCount: overlappingOrders,
    targetStartDate: targetStart.toISOString().split('T')[0],
    targetEndDate: pickupDate,
    itemBreakdown,
    dedicatedCapacity: relevantDedicatedCap,
    dedicatedUsed: relevantDedicatedUsed,
    availableDedicated: relevantDedicatedAvail,
    sharedCapacity,
    sharedUsed,
    availableShared: initialAvailableShared,
    remainingSharedAfterCart: remainingShared,
    hasDedicated: relevantDedicatedCap > 0,
    hasShared: sharedCapacity > 0,
    dedicatedAreaName,
    sharedAreaName,
    areaName: areaDisplayName,
    areas: [...allActiveAreas],
  }
}

/** Wrapper เพื่อความเข้ากันได้ย้อนหลัง 100% กับฟังก์ชันเดิม */
export async function checkFarmCapacity(pickupDate, slotsNeeded = 0, harvestDays = 35, vegetableTypeId = null) {
  const items = vegetableTypeId
    ? [{
        id: Array.isArray(vegetableTypeId) ? vegetableTypeId[0] : vegetableTypeId,
        slots_required: slotsNeeded,
        harvest_days: harvestDays,
        qty: 1,
      }]
    : []
  return checkCartCapacity(pickupDate, items, slotsNeeded, harvestDays)
}

/** ดึงข้อมูลการใช้พื้นที่ปลูกจริงของฟาร์ม ณ วันนี้ (สำหรับ Dashboards) */
export async function getCurrentFarmOccupancy() {
  const today = new Date().toISOString().split('T')[0]
  return checkFarmCapacity(today, 0, 1)
}
