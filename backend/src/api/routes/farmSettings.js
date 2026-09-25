import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { supabase } from '../../services/supabaseClient.js'

const router = express.Router()

// GET /api/farm/settings
router.get('/settings', async (req, res) => {
  try {
    const { data, error } = await supabase.from('farm_settings').select('*').single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/farm/settings — Admin
router.put('/settings', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('farm_settings')
      .update({ ...req.body, updated_at: new Date().toISOString(), updated_by: req.user.id })
      .select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// GET /api/farm/areas
router.get('/areas', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('growing_areas')
      .select('*, profiles(full_name)')
      .order('name')
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/farm/areas — Admin
router.post('/areas', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('growing_areas').insert([req.body]).select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// PUT /api/farm/areas/:id — Admin
router.put('/areas/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('growing_areas').update(req.body).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

export default router
