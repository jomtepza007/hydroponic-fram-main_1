import { supabase } from './supabaseClient'

/** ดึงรายการผักทั้งหมดที่ active */
export async function getVegetables(category = null) {
  let query = supabase
    .from('vegetable_types')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) throw error
  return data
}

/** ดึงผักชนิดเดียว */
export async function getVegetableById(id) {
  const { data, error } = await supabase
    .from('vegetable_types')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/** Admin: เพิ่มผัก */
export async function createVegetable(vegetable) {
  const { data, error } = await supabase
    .from('vegetable_types')
    .insert([vegetable])
    .select()
    .single()
  if (error) throw error
  return data
}

/** Admin: แก้ไขผัก */
export async function updateVegetable(id, updates) {
  const { data, error } = await supabase
    .from('vegetable_types')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Admin: ลบผัก (soft delete) */
export async function deleteVegetable(id) {
  const { error } = await supabase
    .from('vegetable_types')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}
