import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { supabase } from '../../services/supabaseClient.js'

const router = express.Router()

// GET /api/orders — Admin ดูทั้งหมด
router.get('/', authMiddleware, requireRole('admin', 'farmer'), async (req, res) => {
  try {
    const { status } = req.query
    let query = supabase
      .from('orders')
      .select(`*, profiles!orders_customer_id_fkey(full_name, avatar_url), order_items(*, vegetable_types(name))`)
      .order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/orders/my — Customer ดูของตัวเอง
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`*, order_items(*, vegetable_types(name, image_url, unit))`)
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** ฟังก์ชันคำนวณพื้นที่ปลูกจริงที่ถูกจองตามออเดอร์ลูกค้าและแปลงปลูกของผักชนิดนั้น */
async function getActualFarmCapacity(pickupDate, slotsNeeded = 0, harvestDays = 35, vegetableTypeId = null) {
  const needed = Number(slotsNeeded) || 0
  const days = Number(harvestDays) || 35

  // 1. ดึงแปลงปลูกที่ผูกกับผักชนิดนี้โดยเฉพาะ
  let totalSlots = 0
  let areaName = ''

  if (vegetableTypeId) {
    const { data: specificAreas } = await supabase
      .from('growing_areas')
      .select('id, name, total_slots, vegetable_type_id')
      .eq('is_active', true)
      .eq('vegetable_type_id', vegetableTypeId)

    if (specificAreas && specificAreas.length > 0) {
      totalSlots = specificAreas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0)
      areaName = specificAreas.map(a => a.name).join(', ')
    }
  }

  if (!totalSlots || totalSlots <= 0) {
    const { data: generalAreas } = await supabase
      .from('growing_areas')
      .select('id, name, total_slots')
      .eq('is_active', true)
      .is('vegetable_type_id', null)

    if (generalAreas && generalAreas.length > 0) {
      totalSlots = generalAreas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0)
      areaName = 'แปลงรวมทั่วไป'
    } else {
      const { data: settings } = await supabase.from('farm_settings').select('total_slots').single()
      totalSlots = settings?.total_slots || 0
      areaName = 'ฟาร์มโดยรวม'
    }
  }

  const targetEnd = new Date(pickupDate)
  const targetStart = new Date(targetEnd)
  targetStart.setDate(targetStart.getDate() - days)

  const { data: activeOrders } = await supabase
    .from('orders')
    .select(`
      id, pickup_date, status,
      order_items (
        id, quantity, slots_required, vegetable_type_id,
        vegetable_types (harvest_days, slots_per_kg)
      )
    `)
    .in('status', ['pending', 'confirmed', 'seeding', 'growing', 'ready'])

  let usedSlots = 0
  let overlappingOrders = 0

  for (const order of activeOrders || []) {
    if (!order.pickup_date) continue
    const orderEnd = new Date(order.pickup_date)
    let orderOverlapped = false

    for (const item of order.order_items || []) {
      if (vegetableTypeId && item.vegetable_type_id && item.vegetable_type_id !== vegetableTypeId) {
        continue
      }

      const itemDays = item.vegetable_types?.harvest_days || days || 35
      const itemStart = new Date(orderEnd)
      itemStart.setDate(itemStart.getDate() - itemDays)

      if (itemStart <= targetEnd && orderEnd >= targetStart) {
        const itemSlots = Number(item.slots_required) ||
          Math.ceil(Number(item.quantity) * (item.vegetable_types?.slots_per_kg || 4))
        usedSlots += itemSlots
        orderOverlapped = true
      }
    }
    if (orderOverlapped) overlappingOrders++
  }

  let cycleQuery = supabase
    .from('planting_cycles')
    .select('slots_used, planting_start_date, expected_harvest_date, vegetable_type_id')
    .is('order_item_id', null)
    .not('status', 'in', '("done","cancelled")')

  if (vegetableTypeId) {
    cycleQuery = cycleQuery.eq('vegetable_type_id', vegetableTypeId)
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
  }
}

// GET /api/orders/capacity?date=YYYY-MM-DD — ตรวจสอบ capacity ที่เหลือจริงตามออเดอร์
router.get('/capacity', async (req, res) => {
  try {
    const { date, slots_needed, harvest_days, vegetable_type_id } = req.query
    if (!date) return res.status(400).json({ error: 'Pickup date is required' })

    const capacity = await getActualFarmCapacity(date, slots_needed, harvest_days, vegetable_type_id)
    res.json(capacity)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/orders/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`*, profiles!orders_customer_id_fkey(full_name, avatar_url, phone),
               order_items(*, vegetable_types(name, image_url, unit, harvest_days),
               planting_cycles(*, growing_areas(name, zone_code, hydro_system),
               planting_updates(*)))`)
      .eq('id', req.params.id)
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(404).json({ error: 'Not found' }) }
})

// POST /api/orders — Customer สร้างออเดอร์ (พร้อม server-side capacity check หักลบพื้นที่จริง)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { order, items } = req.body
    if (!order || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'ข้อมูลคำสั่งซื้อไม่ถูกต้อง' })
    }

    order.customer_id = req.user.id

    // คำนวณ slots ที่ต้องการทั้งหมด
    const totalSlotsNeeded = items.reduce((sum, item) => sum + (Number(item.slots_required) || 0), 0)

    if (totalSlotsNeeded > 0 && order.pickup_date) {
      const maxHarvestDays = Math.max(...items.map(i => Number(i.vegetable_types?.harvest_days) || 35))
      const capacity = await getActualFarmCapacity(order.pickup_date, totalSlotsNeeded, maxHarvestDays)

      if (!capacity.canAccept) {
        return res.status(400).json({
          error: `พื้นที่ฟาร์มไม่เพียงพอในวันที่เลือก (ว่างจริง ${capacity.available} ช่อง, ต้องการ ${totalSlotsNeeded} ช่อง)`
        })
      }
    }

    const { data: newOrder, error: orderError } = await supabase
      .from('orders').insert([order]).select().single()
    if (orderError) throw orderError

    const orderItems = items.map(item => ({ ...item, order_id: newOrder.id }))
    const { error: itemError } = await supabase.from('order_items').insert(orderItems)
    if (itemError) throw itemError

    res.status(201).json(newOrder)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// PUT /api/orders/:id/status — Farmer/Admin อัปเดตสถานะ
router.put('/:id/status', authMiddleware, requireRole('admin', 'farmer'), async (req, res) => {
  try {
    const { status, notes } = req.body
    if (!status) {
      return res.status(400).json({ error: 'Status is required' })
    }

    const updatePayload = { status, updated_at: new Date().toISOString() }
    if (notes !== undefined) {
      updatePayload.notes = notes
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select().single()
    if (error) throw error

    // Sync สถานะ planting_cycles ให้สอดคล้องกัน
    const cycleStatusMap = {
      seeding: 'seeding',
      growing: 'growing',
      ready: 'ready',
      completed: 'done',
      cancelled: 'cancelled',
    }
    const targetCycleStatus = cycleStatusMap[status]
    if (targetCycleStatus) {
      const { data: orderDetails } = await supabase
        .from('order_items')
        .select('id, planting_cycles(id)')
        .eq('order_id', req.params.id)

      const cycleIds = (orderDetails || [])
        .flatMap(item => item.planting_cycles?.map(c => c.id) || [])
        .filter(Boolean)

      if (cycleIds.length > 0) {
        await supabase
          .from('planting_cycles')
          .update({ status: targetCycleStatus })
          .in('id', cycleIds)
      }
    }

    // สร้าง notification ให้ Customer เมื่อสินค้าพร้อมส่งมอบ
    if (status === 'ready') {
      await supabase.from('notifications').insert([{
        user_id: data.customer_id,
        title: 'ผักของคุณพร้อมส่งมอบแล้ว! 🥬',
        message: `ออเดอร์ #${data.id.slice(0, 8).toUpperCase()} พร้อมรับได้แล้ว`,
        type: 'ready',
        related_id: data.id,
      }])
    }

    // ตัดสต็อกอุปกรณ์อัตโนมัติหากเป็นออเดอร์อุปกรณ์
    if (['confirmed', 'ready', 'completed'].includes(status)) {
      try {
        await supabase.rpc('deduct_order_equipment_stock', { p_order_id: req.params.id })
      } catch (e) {
        console.warn('Backend equipment stock deduction fallback:', e)
      }
    }

    res.json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

export default router
