import { useEffect, useState } from 'react'
import { MapPin, Plus, Pencil, X, Trash2, Layers, AlertTriangle, CheckCircle, PieChart } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { supabase } from '../../api/supabaseClient'
import toast from 'react-hot-toast'

const EMPTY_FORM = { name: '', zone_code: '', total_slots: 100, vegetable_type_id: '', is_active: true }

export default function AdminGrowingAreas() {
  const [areas, setAreas] = useState([])
  const [vegetables, setVegetables] = useState([])
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: areasData }, { data: vegsData }, { data: cyclesData }] = await Promise.all([
        supabase.from('growing_areas').select('*, vegetable_types(name)').order('name'),
        supabase.from('vegetable_types').select('id, name').eq('category', 'vegetable').eq('is_active', true).order('name'),
        supabase.from('planting_cycles').select('growing_area_id, slots_used, status').in('status', ['scheduled', 'seeding', 'growing']),
      ])
      setAreas(areasData || [])
      setVegetables(vegsData || [])
      setCycles(cyclesData || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(a) {
    setEditTarget(a)
    setForm({
      name: a.name,
      zone_code: a.zone_code || '',
      total_slots: a.total_slots,
      vegetable_type_id: a.vegetable_type_id || '',
      is_active: a.is_active,
    })
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        zone_code: form.zone_code || null,
        total_slots: Number(form.total_slots),
        vegetable_type_id: form.vegetable_type_id || null,
        is_active: form.is_active,
      }

      if (editTarget) {
        const { error } = await supabase.from('growing_areas').update(payload).eq('id', editTarget.id)
        if (error) throw error
        toast.success('แก้ไขพื้นที่ปลูกสำเร็จ ✅')
      } else {
        const { error } = await supabase.from('growing_areas').insert([payload])
        if (error) throw error
        toast.success('เพิ่มพื้นที่ปลูกสำเร็จ ✅')
      }
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm('ยืนยันลบพื้นที่ปลูกนี้?')) return
    const { error } = await supabase.from('growing_areas').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('ลบพื้นที่ปลูกสำเร็จ')
    load()
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="page-title">จัดการพื้นที่ปลูก</h1>
              <p className="page-subtitle">เพิ่มและจัดการโซนการปลูกผัก</p>
            </div>
            <button id="btn-add-area" onClick={openAdd} className="btn-primary">
              <Plus className="w-4 h-4" /> เพิ่มพื้นที่
            </button>
          </div>

          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {(() => {
              const totalSlotsAll = areas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0)
              const totalUsedSlotsAll = areas.reduce((sum, a) => {
                const areaCycles = cycles.filter(c => c.growing_area_id === a.id)
                const used = areaCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0) || Number(a.current_slots_used) || 0
                return sum + used
              }, 0)
              const overallOccupancyRate = totalSlotsAll > 0 ? Math.round((totalUsedSlotsAll / totalSlotsAll) * 100) : 0
              const activeAreasCount = areas.filter(a => a.is_active).length

              return [
                { label: 'แปลงปลูกทั้งหมด', value: `${areas.length} แปลง`, sub: `เปิดใช้งาน ${activeAreasCount} แปลง`, color: 'text-forest' },
                { label: 'ช่องปลูกรวมทั้งฟาร์ม', value: `${totalSlotsAll.toLocaleString()} ช่อง`, sub: 'ความจุสูงสุด', color: 'text-blue-600' },
                { label: 'ช่องปลูกที่ใช้งานอยู่', value: `${totalUsedSlotsAll.toLocaleString()} ช่อง`, sub: `ว่าง ${Math.max(0, totalSlotsAll - totalUsedSlotsAll).toLocaleString()} ช่อง`, color: 'text-amber-600' },
                { label: 'อัตราการใช้งานรวม', value: `${overallOccupancyRate}%`, sub: overallOccupancyRate >= 80 ? '⚠️ เริ่มหนาแน่น' : '✅ กำลังดี', color: overallOccupancyRate >= 80 ? 'text-rose-600' : 'text-forest font-black' },
              ].map(s => (
                <div key={s.label} className="card text-center">
                  <p className={`text-2xl lg:text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs font-semibold text-gray-700 mt-1">{s.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
                </div>
              ))
            })()}
          </div>

          {loading ? (
            <div className="spinner w-8 h-8" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {areas.map(a => {
                const areaCycles = cycles.filter(c => c.growing_area_id === a.id)
                const slotsUsed = areaCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0) || Number(a.current_slots_used) || 0
                const totalSlots = Number(a.total_slots) || 100
                const occupancy = Math.min(100, Math.round((slotsUsed / totalSlots) * 100))
                const remainingSlots = Math.max(0, totalSlots - slotsUsed)

                let statusColor = 'bg-emerald-500'
                let badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200'
                let statusLabel = 'ปกติ'
                if (occupancy >= 90) {
                  statusColor = 'bg-red-500'
                  badgeBg = 'bg-red-50 text-red-700 border-red-200'
                  statusLabel = 'วิกฤต 90%+'
                } else if (occupancy >= 75) {
                  statusColor = 'bg-amber-500'
                  badgeBg = 'bg-amber-50 text-amber-700 border-amber-200'
                  statusLabel = 'ใกล้เต็ม 75%+'
                }

                return (
                  <div key={a.id} className={`card-hover relative flex flex-col justify-between ${!a.is_active ? 'opacity-60 bg-gray-50' : 'bg-white'}`}>
                    {/* Action buttons */}
                    <div className="absolute top-3 right-3 flex gap-1 z-10">
                      <button
                        id={`btn-edit-area-${a.id}`}
                        onClick={() => openEdit(a)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-forest transition-colors"
                        title="แก้ไข"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        id={`btn-delete-area-${a.id}`}
                        onClick={() => handleDelete(a.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="ลบ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      {/* Title & Zone */}
                      <div className="flex items-center gap-3 mb-4 pr-14">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${a.is_active ? 'bg-primary-50' : 'bg-gray-100'}`}>
                          <MapPin className={`w-5 h-5 ${a.is_active ? 'text-forest' : 'text-gray-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-800 truncate">{a.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-gray-400">{a.zone_code || 'ไม่มีรหัสโซน'}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {a.is_active ? 'ใช้งาน' : 'ปิด'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Info lines */}
                      <div className="space-y-2 text-xs mb-4">
                        <div className="flex items-center justify-between text-gray-500">
                          <span>ผักประจำแปลง:</span>
                          <span className="font-medium text-gray-800">{a.vegetable_types?.name || 'แปลงทั่วไป (ทุกชนิด)'}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-500">
                          <span>รอบปลูกที่กำลังปลูก:</span>
                          <span className="font-medium text-forest">{areaCycles.length} รอบ</span>
                        </div>
                      </div>
                    </div>

                    {/* Occupancy Section (Progress Bar) */}
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-gray-700">การใช้งานพื้นที่:</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${badgeBg}`}>
                            {statusLabel}
                          </span>
                          <span className="font-bold text-gray-900 text-sm">{occupancy}%</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${statusColor}`}
                          style={{ width: `${occupancy}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>จองแล้ว <strong>{slotsUsed}</strong> / {totalSlots} ช่อง</span>
                        <span>ว่าง <strong>{remainingSlots}</strong> ช่อง</span>
                      </div>
                    </div>
                  </div>
                )
              })}


              {/* Add new card */}
              <div
                onClick={openAdd}
                className="card border-dashed border-2 border-primary-200 flex flex-col items-center justify-center cursor-pointer hover:bg-primary-50 transition-colors min-h-[180px] group"
              >
                <Plus className="w-8 h-8 text-primary-300 mb-2 group-hover:text-forest transition-colors" />
                <p className="text-sm text-gray-400">เพิ่มพื้นที่ปลูกใหม่</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ====== Modal: Add / Edit Growing Area ====== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-forest-dark">
                {editTarget ? 'แก้ไขพื้นที่ปลูก' : 'เพิ่มพื้นที่ปลูกใหม่'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="label">ชื่อพื้นที่ปลูก *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                  className="input"
                  placeholder="เช่น โซน A แปลง 1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">รหัสโซน</label>
                  <input
                    value={form.zone_code}
                    onChange={e => setForm(s => ({ ...s, zone_code: e.target.value }))}
                    className="input"
                    placeholder="เช่น A1, B2"
                  />
                </div>
                <div>
                  <label className="label">จำนวนช่องปลูก *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={form.total_slots}
                    onChange={e => setForm(s => ({ ...s, total_slots: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="label">ผักที่ปลูกในแปลงนี้</label>
                <select
                  value={form.vegetable_type_id}
                  onChange={e => setForm(s => ({ ...s, vegetable_type_id: e.target.value }))}
                  className="input"
                >
                  <option value="">— ยังไม่กำหนด —</option>
                  {vegetables.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="chk-is-active"
                  checked={form.is_active}
                  onChange={e => setForm(s => ({ ...s, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-forest"
                />
                <label htmlFor="chk-is-active" className="text-sm text-gray-700">เปิดใช้งานพื้นที่นี้</label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">ยกเลิก</button>
                <button type="submit" disabled={saving} id="btn-save-area" className="btn-primary flex-1">
                  {saving ? <><div className="spinner w-4 h-4" /> กำลังบันทึก...</> : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

