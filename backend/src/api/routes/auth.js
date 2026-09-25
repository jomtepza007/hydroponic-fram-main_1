import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { supabase } from '../../services/supabaseClient.js'

const router = express.Router()

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single()
    if (error) throw error
    res.json({ user: req.user, profile: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
