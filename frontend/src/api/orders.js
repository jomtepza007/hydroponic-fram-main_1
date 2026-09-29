import { supabase } from './supabaseClient'

/** Customer: ดูออเดอร์ของตัวเอง */
export async function getMyOrders(customerId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        vegetable_types (name, image_url, unit, category)
      )
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** ดูออเดอร์รายละเอียด + planting_cycles + รูปภาพ */
export async function getOrderById(orderId) {
  const queryWithEmail = `
    *,
    profiles!orders_customer_id_fkey (full_name, avatar_url, phone, email, customer_type),
    order_items (
      *,
      vegetable_types (name, image_url, unit, harvest_days, category),
      planting_cycles (
        *,
        growing_areas (name, zone_code),
        planting_updates (*)
      )
    )
  `
  const queryWithoutEmail = `
    *,
    profiles!orders_customer_id_fkey (full_name, avatar_url, phone, customer_type),
    order_items (
      *,
      vegetable_types (name, image_url, unit, harvest_days, category),
      planting_cycles (
        *,
        growing_areas (name, zone_code),
        planting_updates (*)
      )
    )
  `
  let { data, error } = await supabase.from('orders').select(queryWithEmail).eq('id', orderId).single()
  if (error && error.message && error.message.includes('email')) {
    const fallback = await supabase.from('orders').select(queryWithoutEmail).eq('id', orderId).single()
    if (fallback.error) throw fallback.error
    return fallback.data
  }
  if (error) throw error
  return data
}

/** Admin/Farmer: ดูออเดอร์ทั้งหมด */
export async function getAllOrders(filters = {}) {
  const queryWithEmail = `
    *,
    profiles!orders_customer_id_fkey (full_name, avatar_url, phone, email),
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
    profiles!orders_customer_id_fkey (full_name, avatar_url, phone),
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

/** Customer: สร้างออเดอร์ใหม่ */
export async function createOrder(orderData, items) {
  // สร้าง order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert([orderData])
    .select()
    .single()
  if (orderError) throw orderError

  // สร้าง order_items
  const orderItems = items.map(item => ({
    ...item,
    order_id: order.id,
  }))
  const { error: itemError } = await supabase
    .from('order_items')
    .insert(orderItems)
  if (itemError) throw itemError

  return order
}

/** Farmer/Admin: อัปเดตสถานะออเดอร์ */
export async function updateOrderStatus(orderId, status, notes = '') {
  const updatePayload = { status, updated_at: new Date().toISOString() }
  if (notes) updatePayload.notes = notes

  // เมื่อกดยืนยันออเดอร์ (confirmed) คำนวณและบันทึก final_amount ให้ลูกค้าเห็นราคาหลังหักส่วนลดทันที
  if (status === 'confirmed') {
    try {
      const { data: items } = await supabase
        .from('order_items')
        .select('quantity, price_at_order, discount_rate, discount_amount, final_price')
        .eq('order_id', orderId)

      if (items && items.length > 0) {
        const finalSum = items.reduce((sum, item) => {
          if (item.final_price != null && !isNaN(Number(item.final_price))) {
            return sum + Number(item.final_price)
          }
          const orig = Number(item.quantity) * Number(item.price_at_order)
          const disc = item.discount_amount != null
            ? Number(item.discount_amount)
            : Math.round(orig * ((Number(item.discount_rate) || 0) / 100) * 100) / 100
          return sum + (orig - disc)
        }, 0)

        updatePayload.final_amount = Math.round(finalSum * 100) / 100
      }
    } catch (finalErr) {
      console.warn('Could not pre-calculate final_amount on confirm:', finalErr)
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .select()
    .single()
  if (error) throw error

  // ตัดสต็อกอุปกรณ์อัตโนมัติเมื่อยืนยันออเดอร์ หรือเมื่อเลื่อนสถานะเป็น confirmed, ready หรือ completed
  if (['confirmed', 'ready', 'completed'].includes(status)) {
    try {
      await deductEquipmentStock(orderId)
    } catch (err) {
      console.warn('Failed to deduct equipment stock:', err)
    }
  }

  return data
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
      return rpcData
    }
  } catch (rpcErr) {
    console.warn('RPC apply_item_discount not available or errored, using client fallback:', rpcErr)
  }

  // 2. Client fallback กรณีไม่มี RPC
  const { data: item, error: fetchErr } = await supabase
    .from('order_items')
    .select('id, quantity, price_at_order, discount_rate')
    .eq('id', orderItemId)
    .single()

  if (fetchErr) throw fetchErr

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

  if (updateErr) throw updateErr

  // บันทึก log ลง discount_logs
  try {
    await supabase.from('discount_logs').insert([{
      order_id: orderId,
      order_item_id: orderItemId,
      changed_by: changedBy || null,
      old_rate: oldRate,
      new_rate: rate,
      discount_amount: discountAmount,
      note: note || null,
    }])
  } catch (logErr) {
    console.warn('Could not record discount_log fallback:', logErr)
  }

  // หาก order นั้น confirm แล้ว ให้ sync orders.final_amount
  try {
    const { data: ord } = await supabase.from('orders').select('status').eq('id', orderId).single()
    if (ord && ord.status !== 'pending' && ord.status !== 'cancelled') {
      const { data: allItems } = await supabase
        .from('order_items')
        .select('quantity, price_at_order, final_price')
        .eq('order_id', orderId)

      if (allItems) {
        const orderFinal = allItems.reduce((acc, it) => {
          return acc + (it.final_price != null ? Number(it.final_price) : Number(it.quantity) * Number(it.price_at_order))
        }, 0)

        await supabase
          .from('orders')
          .update({ final_amount: Math.round(orderFinal * 100) / 100, updated_at: new Date().toISOString() })
          .eq('id', orderId)
      }
    }
  } catch (syncErr) {
    console.warn('Could not sync orders.final_amount:', syncErr)
  }

  return {
    success: true,
    discount_rate: rate,
    discount_amount: discountAmount,
    final_price: finalPrice,
    item: updatedItem,
  }
}

/** ดึงประวัติการปรับส่วนลดของออเดอร์ (discount_logs) */
export async function getOrderDiscountLogs(orderId) {
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
      console.warn('Could not load discount_logs:', error)
      return []
    }
    return data || []
  } catch (err) {
    console.warn('Error fetching discount_logs:', err)
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

/** ตรวจสอบ capacity ของแปลงปลูกตามชนิดผักและการใช้งานจริงของออเดอร์ลูกค้า (อ้างอิงจาก จัดการพื้นที่ปลูก growing_areas) */
export async function checkFarmCapacity(pickupDate, slotsNeeded = 0, harvestDays = 35, vegetableTypeId = null) {
  const needed = Number(slotsNeeded) || 0
  const days = Number(harvestDays) || 35

  const typeIds = Array.isArray(vegetableTypeId)
    ? vegetableTypeId.filter(Boolean)
    : vegetableTypeId ? [vegetableTypeId] : []

  // 1. ดึงข้อมูลแปลงปลูกที่ active ทั้งหมดจาก จัดการพื้นที่ปลูก (growing_areas)
  const { data: allActiveAreas, error: areasError } = await supabase
    .from('growing_areas')
    .select('id, name, zone_code, total_slots, vegetable_type_id, vegetable_types(id, name)')
    .eq('is_active', true)
    .order('name')

  if (areasError) console.error('Error fetching growing_areas:', areasError)

  let relevantAreas = []

  if (allActiveAreas && allActiveAreas.length > 0) {
    if (typeIds.length > 0) {
      // แปลงที่ผูกกับผักชนิดที่เลือกโดยเฉพาะ
      const specific = allActiveAreas.filter(a => typeIds.includes(a.vegetable_type_id))
      if (specific.length > 0) {
        relevantAreas = specific
      } else {
        // ถ้าไม่มีแปลงเฉพาะของผักชนิดนี้ ให้ใช้แปลงทั่วไป (vegetable_type_id is null) หรือทุกแปลงที่ active
        const general = allActiveAreas.filter(a => !a.vegetable_type_id)
        relevantAreas = general.length > 0 ? general : allActiveAreas
      }
    } else {
      // ถ้าไม่ได้ระบุชนิดผัก ให้ใช้ทุกแปลงปลูกที่ active ใน จัดการพื้นที่ปลูก
      relevantAreas = allActiveAreas
    }
  }

  let totalSlots = 0
  let areaName = ''

  if (relevantAreas.length > 0) {
    totalSlots = relevantAreas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0)
    areaName = relevantAreas.map(a => a.name + (a.zone_code && a.zone_code !== a.name ? ` (${a.zone_code})` : '')).join(', ')
  } else {
    // กรณีที่ยังไม่ได้สร้างพื้นที่ปลูกใน จัดการพื้นที่ปลูก เลย ให้ fallback ไปที่ farm_settings
    const { data: settings } = await supabase
      .from('farm_settings')
      .select('total_slots')
      .single()
    totalSlots = settings?.total_slots || 0
    areaName = 'แปลงรวม'
  }

  // คำนวณช่วงวันที่ผักออเดอร์นี้จะเติบโตในแปลง
  const targetEnd = new Date(pickupDate)
  const targetStart = new Date(targetEnd)
  targetStart.setDate(targetStart.getDate() - days)

  // 3. ดึงออเดอร์ของลูกค้าทั้งหมดที่กำลังอยู่ในกระบวนการปลูก
  const { data: activeOrders, error: ordersError } = await supabase
    .from('orders')
    .select(`
      id, pickup_date, status,
      order_items (
        id, quantity, slots_required, vegetable_type_id,
        vegetable_types (id, harvest_days, slots_per_kg)
      )
    `)
    .in('status', ['pending', 'confirmed', 'seeding', 'growing', 'ready'])

  if (ordersError) throw ordersError

  let usedSlots = 0
  let overlappingOrders = 0

  for (const order of activeOrders || []) {
    if (!order.pickup_date) continue
    const orderEnd = new Date(order.pickup_date)
    let orderOverlapped = false

    for (const item of order.order_items || []) {
      // หากมีการระบุ typeIds ให้คำนวณเฉพาะออเดอร์ที่ปลูกผักในกลุ่มนี้
      if (typeIds.length > 0 && item.vegetable_type_id && !typeIds.includes(item.vegetable_type_id)) {
        continue
      }

      const itemDays = item.vegetable_types?.harvest_days || days || 35
      const itemStart = new Date(orderEnd)
      itemStart.setDate(itemStart.getDate() - itemDays)

      // ตรวจสอบการทับซ้อนของช่วงเวลาปลูก (Interval Overlap)
      if (itemStart <= targetEnd && orderEnd >= targetStart) {
        const itemSlots = Number(item.slots_required) ||
          Math.ceil(Number(item.quantity) * (item.vegetable_types?.slots_per_kg || 4))
        usedSlots += itemSlots
        orderOverlapped = true
      }
    }
    if (orderOverlapped) overlappingOrders++
  }

  // 4. รวมรอบปลูก standalone
  let cycleQuery = supabase
    .from('planting_cycles')
    .select('slots_used, planting_start_date, expected_harvest_date, vegetable_type_id')
    .is('order_item_id', null)
    .not('status', 'in', '("done","cancelled")')

  if (typeIds.length > 0) {
    cycleQuery = cycleQuery.in('vegetable_type_id', typeIds)
  }

  const { data: standaloneCycles } = await cycleQuery
  for (const cycle of standaloneCycles || []) {
    if (!cycle.planting_start_date) continue
    const cStart = new Date(cycle.planting_start_date)
    const cEnd = cycle.expected_harvest_date
      ? new Date(cycle.expected_harvest_date)
      : new Date(cStart.getTime() + days * 86400000)

    if (cStart <= targetEnd && cEnd >= targetStart) {
      usedSlots += Number(cycle.slots_used) || 0
    }
  }

  const available = Math.max(0, totalSlots - usedSlots)
  const canAccept = totalSlots > 0 && available >= needed && available > 0

  return {
    total: totalSlots,
    used: usedSlots,
    available,
    slotsNeeded: needed,
    canAccept,
    occupancyRate: totalSlots > 0 ? Math.min(100, Math.round((usedSlots / totalSlots) * 100)) : 100,
    activeOrdersCount: overlappingOrders,
    targetStartDate: targetStart.toISOString().split('T')[0],
    targetEndDate: pickupDate,
    areaName: areaName || 'แปลงปลูก',
    areas: relevantAreas,
  }
}

/** ดึงข้อมูลการใช้พื้นที่ปลูกจริงของฟาร์ม ณ วันนี้ (สำหรับ Dashboards) */
export async function getCurrentFarmOccupancy() {
  const today = new Date().toISOString().split('T')[0]
  return checkFarmCapacity(today, 0, 1)
}
