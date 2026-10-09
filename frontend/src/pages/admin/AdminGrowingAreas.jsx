import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Plus, Pencil, X, Trash2, Layers, AlertTriangle, CheckCircle, PieChart, RefreshCw } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { supabase } from '../../api/supabaseClient'
import { cleanupDesyncedPlantingCycles } from '../../api/orders'
import toast from 'react-hot-toast'

const EMPTY_FORM = { name: '', zone_code: '', total_slots: 100, vegetable_type_id: '', is_active: true }

export default function AdminGrowingAreas() {
  const [areas, setAreas] = useState([])
  const [vegetables, setVegetables] = useState([])
  const [cycles, setCycles] = useState([])
  const [farmMaxSlots, setFarmMaxSlots] = useState(0)
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      // 1. ซิงค์และคลีนอัพรอบปลูกที่ตกค้างจากออเดอร์ที่เสร็จสิ้น/ยกเลิกไปแล้ว
      try {
        await cleanupDesyncedPlantingCycles()
      } catch (cleanErr) {
        console.warn('Cleanup desynced cycles warning:', cleanErr)
      }

      // 2. ดึงข้อมูลพื้นที่ปลูก ผัก และรอบปลูก
      const [{ data: areasData }, { data: vegsData }, { data: cyclesData }, { data: farmSettingsData }] = await Promise.all([
        supabase.from('growing_areas').select('*, vegetable_types(name)').order('name'),
        supabase.from('vegetable_types').select('id, name').eq('category', 'vegetable').eq('is_active', true).order('name'),
        supabase.from('planting_cycles')
          .select('id, growing_area_id, slots_used, status, planting_start_date, expected_harvest_date, vegetable_type_id, order_item_id, order_items(order_id, orders(id, status))')
          .in('status', ['scheduled', 'seeding', 'growing']),
        supabase.from('farm_settings').select('total_slots').single(),
      ])

      // 3. กรองเฉพาะรอบปลูกที่ถูกต้อง มีการใช้ช่องปลูกจริง และออเดอร์ยังดำเนินงานอยู่
      const validCycles = (cyclesData || []).filter(c => {
        if ((Number(c.slots_used) || 0) <= 0) return false
        if (!c.order_item_id && !c.vegetable_type_id) return false
        if (c.order_item_id && (!c.order_items || !c.order_items?.orders)) return false
        const ordStatus = c.order_items?.orders?.status
        if (ordStatus === 'completed' || ordStatus === 'delivered' || ordStatus === 'cancelled') return false
        return true
      })

      setAreas(areasData || [])
      setVegetables(vegsData || [])
      setCycles(validCycles)
      setFarmMaxSlots(Number(farmSettingsData?.total_slots) || 0)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function isCycleActiveToday(c, today) {
    // ถ้าอยู่ในสถานะเพาะเมล็ดหรือลงรางปลูกแล้ว ถือว่าใช้งานช่องปลูกจริงแล้วทันที
    if (c.status === 'seeding' || c.status === 'growing') {
      if (c.expected_harvest_date && c.expected_harvest_date < today) return false
      return true
    }
    return false
  }

  function isCycleUpcoming(c, today) {
    // ถ้าลงแปลงปลูกจริงแล้ว (seeding/growing) จะไม่นับเป็นยอดจองล่วงหน้าเด็ดขาด
    if (c.status === 'seeding' || c.status === 'growing') return false
    // ยอดจองล่วงหน้าต้องเป็นสถานะ scheduled หรือรอบที่รอเริ่มปลูกตามแผน
    if (c.status === 'scheduled') return true
    if (c.planting_start_date && c.planting_start_date > today) return true
    return false
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
    const inputSlots = Number(form.total_slots) || 0
    if (inputSlots <= 0) {
      toast.error('กรุณาระบุจำนวนช่องปลูกมากกว่า 0')
      return
    }

    const currentTotal = areas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0)
    const otherAreasTotal = editTarget
      ? currentTotal - (Number(editTarget.total_slots) || 0)
      : currentTotal
    const projectedTotal = otherAreasTotal + inputSlots

    if (farmMaxSlots > 0 && projectedTotal > farmMaxSlots) {
      const remainingQuota = Math.max(0, farmMaxSlots - otherAreasTotal)
      toast.error(
        `ไม่สามารถบันทึกได้: จำนวนช่องปลูกรวมทุกแปลง (${projectedTotal.toLocaleString()} ช่อง) จะเกินเพดานความจุสูงสุดของฟาร์ม (${farmMaxSlots.toLocaleString()} ช่อง) ${
          remainingQuota > 0
            ? `คุณสามารถระบุได้สูงสุด ${remainingQuota.toLocaleString()} ช่อง`
            : 'โควต้าความจุฟาร์มเต็มแล้ว กรุณาขยายความจุใน "ตั้งค่าฟาร์ม" ก่อน'
        }`
      )
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        zone_code: form.zone_code || null,
        total_slots: inputSlots,
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

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="page-title">จัดการพื้นที่ปลูก</h1>
              <p className="page-subtitle">เพิ่มและจัดการโซนการปลูกผัก กำหนดแปลงเฉพาะและแปลงรวม (Waterfall Model)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-xs disabled:opacity-50"
                title="รีเฟรชและซิงค์รอบปลูกล่าสุด"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-forest' : 'text-gray-500'}`} />
                <span>รีเฟรช & ซิงค์</span>
              </button>
              <button id="btn-add-area" onClick={openAdd} className="btn-primary">
                <Plus className="w-4 h-4" /> เพิ่มพื้นที่
              </button>
            </div>
          </div>

          {/* Alert Banner: When current areas exceed farm capacity ceiling */}
          {farmMaxSlots > 0 && areas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0) > farmMaxSlots && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-sm">
                    ช่องปลูกรวมทุกแปลง ({areas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0).toLocaleString()} ช่อง) เกินกว่าความจุสูงสุดที่กำหนดไว้ในตั้งค่าฟาร์ม ({farmMaxSlots.toLocaleString()} ช่อง)
                  </p>
                  <p className="text-amber-700 mt-0.5">
                    เกินเพดานอยู่ {areas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0) - farmMaxSlots} ช่อง สามารถไปที่เมนู "ตั้งค่าฟาร์ม" เพื่อขยายความจุสูงสุดของฟาร์มได้
                  </p>
                </div>
              </div>
              <Link
                to="/admin/farm-settings"
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 shadow-2xs self-end sm:self-center"
              >
                ขยายความจุในตั้งค่าฟาร์ม ⚙️
              </Link>
            </div>
          )}

          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {(() => {
              const totalSlotsAll = areas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0)
              
              // 1. คำนวณช่องปลูกที่กำลังปลูกจริง ณ วันนี้ (Active Today)
              const totalTodayUsedSlots = areas.reduce((sum, a) => {
                const areaActive = cycles.filter(c => c.growing_area_id === a.id && isCycleActiveToday(c, todayStr))
                return sum + areaActive.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
              }, 0)

              // 2. คำนวณยอดจองล่วงหน้ารอลงแปลง (Upcoming Bookings)
              const totalUpcomingSlots = areas.reduce((sum, a) => {
                const areaUpcoming = cycles.filter(c => c.growing_area_id === a.id && isCycleUpcoming(c, todayStr))
                return sum + areaUpcoming.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
              }, 0)

              const overallOccupancyRate = totalSlotsAll > 0 ? Math.min(100, Math.round((totalTodayUsedSlots / totalSlotsAll) * 100)) : 0
              const activeAreasCount = areas.filter(a => a.is_active).length

              return [
                { label: 'แปลงปลูกทั้งหมด', value: `${areas.length} แปลง`, sub: `เปิดใช้งาน ${activeAreasCount} แปลง`, color: 'text-forest' },
                {
                  label: 'ช่องปลูกรวมทั้งฟาร์ม',
                  value: farmMaxSlots > 0 ? `${totalSlotsAll.toLocaleString()} / ${farmMaxSlots.toLocaleString()} ช่อง` : `${totalSlotsAll.toLocaleString()} ช่อง`,
                  sub: farmMaxSlots > 0
                    ? (totalSlotsAll > farmMaxSlots
                        ? `⚠️ เกินเพดานฟาร์ม ${totalSlotsAll - farmMaxSlots} ช่อง`
                        : `โควต้าคงเหลือ ${Math.max(0, farmMaxSlots - totalSlotsAll).toLocaleString()} ช่อง`)
                    : 'ความจุสูงสุดทางกายภาพ',
                  color: totalSlotsAll > farmMaxSlots ? 'text-amber-600 font-bold' : 'text-blue-600'
                },
                { label: 'กำลังปลูกจริงวันนี้', value: `${totalTodayUsedSlots.toLocaleString()} ช่อง`, sub: `ว่างพร้อมปลูก ${Math.max(0, totalSlotsAll - totalTodayUsedSlots).toLocaleString()} ช่อง`, color: 'text-amber-600' },
                { label: 'อัตราการใช้งานวันนี้', value: `${overallOccupancyRate}%`, sub: `จองล่วงหน้า ${totalUpcomingSlots.toLocaleString()} ช่อง`, color: overallOccupancyRate >= 80 ? 'text-rose-600' : 'text-forest font-black' },
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
                const activeTodayCycles = areaCycles.filter(c => isCycleActiveToday(c, todayStr))
                const upcomingCycles = areaCycles.filter(c => isCycleUpcoming(c, todayStr))

                const slotsUsedToday = activeTodayCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
                const slotsUpcoming = upcomingCycles.reduce((s, c) => s + (Number(c.slots_used) || 0), 0)
                const totalSlots = Number(a.total_slots) || 100
                const occupancyToday = Math.min(100, Math.round((slotsUsedToday / totalSlots) * 100))
                const remainingSlotsToday = Math.max(0, totalSlots - slotsUsedToday)

                let statusColor = 'bg-emerald-500'
                let badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200'
                let statusLabel = 'ปกติ'
                if (occupancyToday >= 90) {
                  statusColor = 'bg-red-500'
                  badgeBg = 'bg-red-50 text-red-700 border-red-200'
                  statusLabel = 'วิกฤต 90%+'
                } else if (occupancyToday >= 75) {
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
                      <div className="flex items-center gap-3 mb-3 pr-14">
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

                      {/* Area Type Badge */}
                      <div className="mb-3">
                        {a.vegetable_types?.name ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-emerald-50 text-forest border border-emerald-200">
                            🌱 แปลงเฉพาะ: {a.vegetable_types.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            🌐 แปลงรวม (ปลูกได้ทุกผัก)
                          </span>
                        )}
                      </div>

                      {/* Info lines */}
                      <div className="space-y-1.5 text-xs mb-4">
                        <div className="flex items-center justify-between text-gray-500">
                          <span>กำลังปลูกวันนี้:</span>
                          <span className="font-bold text-forest">{activeTodayCycles.length} รอบ ({slotsUsedToday} ช่อง)</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-500">
                          <span>ยอดจองล่วงหน้า:</span>
                          <span className="font-medium text-amber-600">{upcomingCycles.length} รอบ ({slotsUpcoming} ช่อง)</span>
                        </div>
                      </div>
                    </div>

                    {/* Occupancy Section (Progress Bar) */}
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-gray-700">การใช้งานจริงวันนี้:</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${badgeBg}`}>
                            {statusLabel}
                          </span>
                          <span className="font-bold text-gray-900 text-sm">{occupancyToday}%</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${statusColor}`}
                          style={{ width: `${occupancyToday}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span>ปลูกจริง <strong>{slotsUsedToday}</strong> / {totalSlots} ช่อง</span>
                        <span>ว่างวันนี้ <strong className="text-forest">{remainingSlotsToday}</strong> ช่อง</span>
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
                  {farmMaxSlots > 0 && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      โควต้าสูงสุดที่กำหนดได้:{' '}
                      <strong className="text-forest font-bold">
                        {Math.max(
                          0,
                          farmMaxSlots - (areas.reduce((sum, a) => sum + (Number(a.total_slots) || 0), 0) - (editTarget ? Number(editTarget.total_slots) || 0 : 0))
                        ).toLocaleString()}{' '}
                        ช่อง
                      </strong>
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="label">ประเภทแปลง / ผักประจำแปลง</label>
                <select
                  value={form.vegetable_type_id}
                  onChange={e => setForm(s => ({ ...s, vegetable_type_id: e.target.value }))}
                  className="input"
                >
                  <option value="">🌐 แปลงรวม (ปลูกได้ทุกผัก / รองรับส่วนเกิน)</option>
                  {vegetables.map(v => (
                    <option key={v.id} value={v.id}>🌱 แปลงเฉพาะ: {v.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  💡 เคล็ดลับ: หากเลือก "แปลงรวม" ระบบจะใช้เป็นพื้นที่ปลูกผักทั่วไป และรองรับส่วนเกินเมื่อแปลงเฉพาะของผักชนิดอื่นเต็ม
                </p>
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

