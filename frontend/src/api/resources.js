import { supabase } from './supabaseClient'

/** ดูสต็อกทรัพยากรทั้งหมด */
export async function getResources() {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

/** ดูทรัพยากรที่ใกล้หมด (ต่ำกว่าหรือเท่ากับ min_threshold) */
export async function getLowStockResources() {
  try {
    // ลองใช้ RPC จาก Database ก่อน
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_low_stock_resources')
    if (!rpcError && rpcData) return rpcData
  } catch {
    // Fallback เมื่อ RPC ยังไม่ได้ deploy
  }

  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .order('name')
  if (error) throw error

  return (data || []).filter(r => Number(r.current_qty) <= Number(r.min_threshold))
}

/** เพิ่ม/ลด สต็อก (transaction) — Atomic */
export async function addResourceTransaction(resourceId, { transaction_type, quantity, notes, created_by }) {
  const numQty = Number(quantity)

  // บันทึก transaction log
  const { error: txError } = await supabase
    .from('resource_transactions')
    .insert([{ resource_id: resourceId, transaction_type, quantity: numQty, notes, created_by }])
  if (txError) throw txError

  if (transaction_type === 'adjust') {
    // ปรับตามจริง
    const { data, error } = await supabase
      .from('resources')
      .update({ current_qty: Math.max(0, numQty) })
      .eq('id', resourceId)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const delta = transaction_type === 'in' ? numQty : -numQty

  // พยายามปรับ current_qty แบบ Atomic ผ่าน RPC
  try {
    const { data: rpcQty, error: rpcErr } = await supabase.rpc('adjust_resource_qty', {
      r_id: resourceId,
      delta: delta,
    })
    if (!rpcErr && rpcQty !== null) {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('id', resourceId)
        .single()
      if (!error && data) return data
    }
  } catch {
    // Fallback: หาก RPC ยังไม่พร้อม
  }

  // Fallback: ดึงและอัปเดต
  const { data: resource } = await supabase
    .from('resources')
    .select('current_qty')
    .eq('id', resourceId)
    .single()

  const newQty = Math.max(0, (Number(resource?.current_qty) || 0) + delta)

  const { data, error } = await supabase
    .from('resources')
    .update({ current_qty: newQty })
    .eq('id', resourceId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Admin: เพิ่มทรัพยากรใหม่ */
export async function createResource(resource) {
  const { data, error } = await supabase
    .from('resources')
    .insert([resource])
    .select()
    .single()
  if (error) throw error
  return data
}

/** Admin: แก้ไขทรัพยากร */
export async function updateResource(id, updates) {
  const { data, error } = await supabase
    .from('resources')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
