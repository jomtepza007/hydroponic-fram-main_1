import { supabase } from './supabaseClient'

/** ดึงรายการผักทั้งหมด */
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

/** Admin: เพิ่มผักหรืออุปกรณ์ */
export async function createVegetable(vegetable) {
  const clean = { ...vegetable }
  delete clean.id
  delete clean.created_at
  delete clean.vegetable_types

  if (clean.price_per_kg !== undefined) clean.price_per_kg = Number(clean.price_per_kg) || 0
  if (clean.resource_id !== undefined) clean.resource_id = clean.resource_id || null

  const { data, error } = await supabase
    .from('vegetable_types')
    .insert([clean])
    .select()
    .single()
  if (error) throw error
  return data
}

/** Admin: แก้ไขผักหรืออุปกรณ์ */
export async function updateVegetable(id, updates) {
  const clean = { ...updates }
  delete clean.id
  delete clean.created_at
  delete clean.vegetable_types

  if (clean.price_per_kg !== undefined) clean.price_per_kg = Number(clean.price_per_kg) || 0
  if (clean.resource_id !== undefined) clean.resource_id = clean.resource_id || null

  const { data, error } = await supabase
    .from('vegetable_types')
    .update(clean)
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

