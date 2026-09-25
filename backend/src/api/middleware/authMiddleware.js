import { supabase } from '../../services/supabaseClient.js'

/**
 * ตรวจสอบ JWT Token จาก Supabase Auth
 * ดึง user และ profile (พร้อม role) แนบไปกับ req
 */
export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' })
    }

    const token = authHeader.split(' ')[1]

    // ตรวจสอบ JWT กับ Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' })
    }

    // ดึง Profile (พร้อม role)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_banned')
      .eq('id', user.id)
      .single()

    if (profile?.is_banned) {
      return res.status(403).json({ error: 'Account suspended' })
    }

    req.user = user
    req.role = profile?.role || 'customer'
    next()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
