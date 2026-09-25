import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { supabase } from '../../services/supabaseClient.js'

const router = express.Router()

// GET /api/vegetables — ทุกคนเข้าถึงได้
router.get('/', async (req, res) => {
  try {
    const { category } = req.query
    let query = supabase.from('vegetable_types').select('*').eq('is_active', true).order('name')
    if (category) query = query.eq('category', category)
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/vegetables/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vegetable_types').select('*').eq('id', req.params.id).single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(404).json({ error: 'Not found' }) }
})

// POST /api/vegetables — Admin เท่านั้น
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('vegetable_types').insert([req.body]).select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// PUT /api/vegetables/:id — Admin เท่านั้น
router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('vegetable_types').update(req.body).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// DELETE /api/vegetables/:id — Admin (soft delete)
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { error } = await supabase.from('vegetable_types').update({ is_active: false }).eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

export default router
