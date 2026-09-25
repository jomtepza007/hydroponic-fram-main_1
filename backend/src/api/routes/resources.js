import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { supabase } from '../../services/supabaseClient.js'

const router = express.Router()

// GET /api/resources
router.get('/', authMiddleware, requireRole('admin', 'farmer'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('resources').select('*').order('name')
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/resources/alerts — ทรัพยากรใกล้หมด
router.get('/alerts', authMiddleware, requireRole('admin', 'farmer'), async (req, res) => {
  try {
    // ลองใช้ RPC ใน database ก่อน
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_low_stock_resources')
    if (!rpcError && rpcData) {
      return res.json(rpcData)
    }

    // Fallback: ดึงและเปรียบเทียบใน Node.js อย่างแม่นยำ
    const { data, error } = await supabase.from('resources').select('*').order('name')
    if (error) throw error
    const lowStock = (data || []).filter(r => Number(r.current_qty) <= Number(r.min_threshold))
    res.json(lowStock)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/resources — Admin เพิ่มทรัพยากรใหม่
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('resources').insert([req.body]).select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// PUT /api/resources/:id
router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('resources').update(req.body).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// POST /api/resources/:id/transactions — เพิ่ม/ใช้สต็อก (Atomic)
router.post('/:id/transactions', authMiddleware, requireRole('admin', 'farmer'), async (req, res) => {
  try {
    const { transaction_type, quantity, notes } = req.body
    const resourceId = req.params.id
    const numQty = Number(quantity)

    if (!['in', 'out', 'adjust'].includes(transaction_type) || isNaN(numQty) || numQty <= 0) {
      return res.status(400).json({ error: 'ข้อมูลประเภทหรือจำนวนไม่ถูกต้อง' })
    }

    // บันทึก transaction
    await supabase.from('resource_transactions').insert([{
      resource_id: resourceId, transaction_type, quantity: numQty, notes, created_by: req.user.id
    }])

    let updatedResource

    if (transaction_type === 'adjust') {
      // ปรับตามจริงเป็นค่าใหม่
      const { data, error } = await supabase
        .from('resources')
        .update({ current_qty: Math.max(0, numQty) })
        .eq('id', resourceId)
        .select()
        .single()
      if (error) throw error
      updatedResource = data
    } else {
      const delta = transaction_type === 'in' ? numQty : -numQty
      // พยายามปรับสต็อกแบบ Atomic ผ่าน RPC
      const { data: rpcQty, error: rpcErr } = await supabase.rpc('adjust_resource_qty', {
        r_id: resourceId,
        delta: delta,
      })

      if (!rpcErr && rpcQty !== null) {
        const { data } = await supabase.from('resources').select('*').eq('id', resourceId).single()
        updatedResource = data
      } else {
        // Fallback หากยังไม่ได้รัน SQL function
        const { data: resource } = await supabase.from('resources').select('current_qty').eq('id', resourceId).single()
        const newQty = Math.max(0, (Number(resource?.current_qty) || 0) + delta)
        const { data, error } = await supabase.from('resources').update({ current_qty: newQty }).eq('id', resourceId).select().single()
        if (error) throw error
        updatedResource = data
      }
    }

    // แจ้งเตือนถ้าสต็อกใกล้หมด
    if (updatedResource && updatedResource.current_qty <= updatedResource.min_threshold) {
      console.log(`⚠️ Resource "${updatedResource.name}" is running low: ${updatedResource.current_qty} ${updatedResource.unit}`)
    }

    res.json(updatedResource)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

export default router
