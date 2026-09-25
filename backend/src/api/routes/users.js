import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { supabase } from '../../services/supabaseClient.js'

const router = express.Router()

// GET /api/users — Admin
router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/users/:id/role — Admin
router.put('/:id/role', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body
    if (!['admin', 'farmer', 'customer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }
    // ป้องกัน Admin ลดสิทธิ์ตัวเอง
    if (req.user.id === req.params.id && role !== 'admin') {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยน Role ของตัวเองออกจาก Admin ได้' })
    }
    const { data, error } = await supabase.from('profiles').update({ role }).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// PUT /api/users/:id/ban — Admin
router.put('/:id/ban', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { is_banned } = req.body
    // ป้องกัน Admin แบนบัญชีตัวเอง
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'ไม่สามารถระงับบัญชีของตัวเองได้' })
    }
    const { data, error } = await supabase.from('profiles').update({ is_banned: Boolean(is_banned) }).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

export default router
