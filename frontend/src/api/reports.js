import { supabase } from './supabaseClient'
import { format, subDays, startOfWeek, startOfMonth, startOfYear } from 'date-fns'

/** รายงานสรุปออเดอร์ตาม period */
export async function getOrderReport(period = 'month') {
  let startDate
  const now = new Date()

  switch (period) {
    case 'day':   startDate = format(subDays(now, 1), 'yyyy-MM-dd'); break
    case 'week':  startDate = format(startOfWeek(now), 'yyyy-MM-dd'); break
    case 'month': startDate = format(startOfMonth(now), 'yyyy-MM-dd'); break
    case 'year':  startDate = format(startOfYear(now), 'yyyy-MM-dd'); break
    default:      startDate = format(startOfMonth(now), 'yyyy-MM-dd')
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`*, order_items(quantity, price_at_order, vegetable_types(name))`)
    .gte('created_at', startDate)
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
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Admin: อัปเดต Farm Settings */
export async function updateFarmSettings(updates) {
  const { id, ...fields } = updates
  const { data, error } = await supabase
    .from('farm_settings')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
