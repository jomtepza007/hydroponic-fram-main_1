import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { supabase } from '../../services/supabaseClient.js'

const router = express.Router()

// GET /api/reports/orders?period=month
router.get('/orders', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { period = 'month' } = req.query
    const now = new Date()
    let startDate

    switch (period) {
      case 'day':   startDate = new Date(now - 24 * 60 * 60 * 1000); break
      case 'week':  startDate = new Date(now - 7 * 24 * 60 * 60 * 1000); break
      case 'year':  startDate = new Date(now.getFullYear(), 0, 1); break
      default:      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(quantity, price_at_order, vegetable_types(name))')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/reports/vegetables — ผักที่สั่งซื้อมากที่สุด
router.get('/vegetables', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10
    // ลองใช้ RPC ที่คำนวณฝั่ง Database โดยตรง
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_top_vegetables', { limit_count: limit })
    if (!rpcError && rpcData) {
      return res.json(rpcData)
    }

    // Fallback: ดึงและ aggregate
    const { data, error } = await supabase
      .from('order_items')
      .select('quantity, vegetable_types(name, image_url)')
    if (error) throw error

    const map = {}
    data.forEach(item => {
      const name = item.vegetable_types?.name
      if (!name) return
      map[name] = (map[name] || 0) + Number(item.quantity)
    })

    const result = Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit)

    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
