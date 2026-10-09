import { supabase } from './supabaseClient'
import {
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  parseISO,
} from 'date-fns'

/** รายงานสรุปออเดอร์ตาม period และวันที่ที่ระบุ */
export async function getOrderReport(period = 'month', options = {}) {
  const now = new Date()
  let startDate
  let endDate

  if (period === 'day') {
    const targetDate = options.selectedDate || format(now, 'yyyy-MM-dd')
    const [y, m, d] = targetDate.split('-').map(Number)
    startDate = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
    endDate = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
  } else if (period === 'week') {
    const baseDate = options.selectedDate ? parseISO(options.selectedDate) : now
    const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
    startDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0).toISOString()
    endDate = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59, 999).toISOString()
  } else if (period === 'month') {
    let year, month
    if (options.selectedMonth) {
      const [y, m] = options.selectedMonth.split('-').map(Number)
      year = y
      month = m - 1
    } else {
      year = now.getFullYear()
      month = now.getMonth()
    }
    startDate = new Date(year, month, 1, 0, 0, 0, 0).toISOString()
    endDate = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString()
  } else if (period === 'year') {
    const targetYear = Number(options.selectedYear) || now.getFullYear()
    startDate = new Date(targetYear, 0, 1, 0, 0, 0, 0).toISOString()
    endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999).toISOString()
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString()
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      profiles:customer_id (full_name, phone, email, customer_type),
      order_items (
        *,
        vegetable_types (name, unit, category)
      )
    `)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

/** รายงานผักที่สั่งซื้อมากที่สุด */
export async function getTopVegetables(limit = 10) {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_top_vegetables', { limit_count: limit })
    if (!rpcError && rpcData) return rpcData
  } catch {
    // Fallback เมื่อ RPC ยังไม่ได้ deploy
  }

  const { data, error } = await supabase
    .from('order_items')
    .select(`quantity, vegetable_types(name, image_url)`)
    .limit(1000)
  if (error) throw error

  // Aggregate client-side
  const map = {}
  data.forEach(item => {
    const name = item.vegetable_types?.name
    if (!name) return
    map[name] = (map[name] || 0) + Number(item.quantity)
  })

  return Object.entries(map)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

/** ดึง Farm Settings */
export async function getFarmSettings() {
  const { data, error } = await supabase
    .from('farm_settings')
    .select('*, profiles:updated_by (full_name, email)')
    .single()
  if (error) {
    // Fallback if profiles foreign key relation has issue
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('farm_settings')
      .select('*')
      .single()
    if (fallbackError) throw fallbackError
    return fallbackData
  }
  return data
}

/** Admin: อัปเดต Farm Settings */
export async function updateFarmSettings(updates, userId = null) {
  const { id, profiles, ...fields } = updates
  const payload = {
    ...fields,
    updated_at: new Date().toISOString(),
    ...(userId ? { updated_by: userId } : {}),
  }
  const { data, error } = await supabase
    .from('farm_settings')
    .update(payload)
    .eq('id', id)
    .select('*, profiles:updated_by (full_name, email)')
    .single()
  if (error) {
    // Fallback simple update if relation select issues
    const { data: fbData, error: fbError } = await supabase
      .from('farm_settings')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (fbError) throw fbError
    return fbData
  }
  return data
}
