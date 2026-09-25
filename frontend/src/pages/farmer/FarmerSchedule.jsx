import { useEffect, useState } from 'react'
import { Calendar, Plus, X, MapPin, Leaf, CheckCircle2, Clock } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { supabase } from '../../api/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { formatDateTh } from '../../utils/dateUtils'
import toast from 'react-hot-toast'

const CYCLE_STATUS_LABEL = {
  scheduled: 'กำหนดการ',
  seeding: 'เพาะเมล็ด',
  growing: 'กำลังปลูก',
  ready: 'พร้อมเก็บเกี่ยว',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
}

const CYCLE_STATUS_COLOR = {
  scheduled: 'bg-gray-100 text-gray-600',
  seeding: 'bg-blue-100 text-blue-700',
  growing: 'bg-green-100 text-green-700',
  ready: 'bg-amber-100 text-amber-700',
  done: 'bg-primary-100 text-forest',
  cancelled: 'bg-red-100 text-red-600',
}

/** map order status → cycle status key สำหรับแสดงผล */
const ORDER_TO_CYCLE_STATUS = {
  confirmed: 'scheduled',
  seeding: 'seeding',
  growing: 'growing',
  ready: 'ready',
  completed: 'done',
  delivered: 'done',
  cancelled: 'cancelled',
}

/** คำนวณวันเริ่มปลูกย้อนหลัง: pickup_date - harvest_days */
function calcPlantingStart(pickupDate, harvestDays) {
  if (!pickupDate || !harvestDays) return null
  const d = new Date(pickupDate)
  d.setDate(d.getDate() - harvestDays)
  return d.toISOString().split('T')[0]
}

/** คำนวณวันเก็บเกี่ยวคาดการณ์: planting_start + harvest_days */
function calcExpectedHarvest(startDate, harvestDays) {
  if (!startDate || !harvestDays) return null
  const d = new Date(startDate)
  d.setDate(d.getDate() + harvestDays)
  return d.toISOString().split('T')[0]
}

export default function FarmerSchedule() {
  const { user } = useAuth()
  const [cycles, setCycles] = useState([])
  const [pendingOrders, setPendingOrders] = useState([]) // ออเดอร์ confirmed ที่ยังไม่มี cycle
  const [growingAreas, setGrowingAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('cycles') // 'cycles' | 'pending'

  // modal สร้าง cycle
  const [showModal, setShowModal] = useState(false)
  const [selectedOrderItem, setSelectedOrderItem] = useState(null)
  const [form, setForm] = useState({ growing_area_id: '', planting_start_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [cyclesRes, orderItemsRes, areasRes] = await Promise.allSettled([
        supabase
          .from('planting_cycles')
          .select(`
            *,
            vegetable_types (name, unit, harvest_days),
            growing_areas (name, zone_code),
            order_items (
              quantity,
              orders (id, pickup_date, status)
            )
          `)
          .order('planting_start_date', { ascending: true })
          .then(({ data, error }) => { if (error) throw error; return data || [] }),
        // query order_items ที่ยังไม่มี planting_cycle โดยตรง (เฉพาะผัก ไม่รวมอุปกรณ์)
        supabase
          .from('order_items')
          .select(`
            id, quantity, slots_required, vegetable_type_id,
            vegetable_types (name, unit, harvest_days, category),
            orders!inner (id, pickup_date, status)
          `)
          .eq('orders.status', 'confirmed')
          .then(({ data, error }) => { if (error) throw error; return data || [] }),
        supabase
          .from('growing_areas')
          .select('*')
          .eq('is_active', true)
          .then(({ data, error }) => { if (error) throw error; return data || [] }),
      ])

      const allCycles = cyclesRes.status === 'fulfilled' ? cyclesRes.value : []
      const allOrderItems = orderItemsRes.status === 'fulfilled' ? orderItemsRes.value : []
      const areas = areasRes.status === 'fulfilled' ? areasRes.value : []

      if (areasRes.status === 'rejected') {
        console.error('growing_areas error:', areasRes.reason)
        toast.error('ไม่สามารถโหลดพื้นที่ปลูกได้ — กรุณาตรวจสอบ RLS policy')
      }

      setCycles(allCycles)
      setGrowingAreas(areas)

      // กรอง order_items ที่ยังไม่มี planting_cycle (เฉพาะผัก)
      const cycleOrderItemIds = new Set(allCycles.map(c => c.order_item_id).filter(Boolean))
      const pending = allOrderItems
        .filter(item => item.vegetable_types?.category !== 'equipment')
        .filter(item => !cycleOrderItemIds.has(item.id))
        .map(item => ({ order: item.orders, item }))
      setPendingOrders(pending)

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal(order, item) {
    setSelectedOrderItem({ order, item })
    const harvestDays = item.vegetable_types?.harvest_days || 35
    const autoStart = calcPlantingStart(order.pickup_date, harvestDays)
    setForm({ growing_area_id: growingAreas[0]?.id || '', planting_start_date: autoStart || '', notes: '' })
    setShowModal(true)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!selectedOrderItem) return
    setSaving(true)
    try {
      const { order, item } = selectedOrderItem
      const harvestDays = item.vegetable_types?.harvest_days || 35
      const expectedHarvest = calcExpectedHarvest(form.planting_start_date, harvestDays)

      const { error } = await supabase.from('planting_cycles').insert([{
        order_item_id: item.id,
        vegetable_type_id: item.vegetable_type_id,
        growing_area_id: form.growing_area_id || null,
        farmer_id: user?.id,
        planting_start_date: form.planting_start_date,
        expected_harvest_date: expectedHarvest,
        slots_used: item.slots_required || 0,
        status: 'scheduled',
        notes: form.notes,
      }])
      if (error) throw error
      toast.success('สร้างรอบปลูกสำเร็จ ✅')
      setShowModal(false)
      loadAll()
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false) }
  }




  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="page-title">ตารางรอบปลูก</h1>
            <p className="page-subtitle">ระบบคำนวณวันเริ่มปลูกย้อนหลังอัตโนมัติ</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('cycles')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${tab === 'cycles' ? 'bg-forest text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-primary-50'}`}
            >
              รอบปลูกทั้งหมด ({cycles.length})
            </button>
            <button
              onClick={() => setTab('pending')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2
                ${tab === 'pending' ? 'bg-forest text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-primary-50'}`}
            >
              รอสร้างรอบปลูก
              {pendingOrders.length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
                  ${tab === 'pending' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                  {pendingOrders.length}
                </span>
              )}
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><div className="spinner w-10 h-10" /></div>
          ) : tab === 'cycles' ? (

            /* ===== แท็บ: รอบปลูกทั้งหมด ===== */
            cycles.length === 0 ? (
              <div className="card text-center py-16 text-gray-300">
                <Calendar className="w-12 h-12 mx-auto mb-3" />
                <p>ยังไม่มีรอบปลูก — ไปที่แท็บ "รอสร้างรอบปลูก" เพื่อเริ่มต้น</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cycles.map(cycle => {
                  const orderInfo = cycle.order_items?.orders
                  // derive สถานะจาก order เพื่อ sync อัตโนมัติ
                  const displayStatus = ORDER_TO_CYCLE_STATUS[orderInfo?.status] || cycle.status
                  return (
                    <div key={cycle.id} className="card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Leaf className="w-4 h-4 text-forest flex-shrink-0" />
                            <p className="font-semibold text-gray-800">
                              {cycle.vegetable_types?.name || '—'}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${CYCLE_STATUS_COLOR[displayStatus]}`}>
                              {CYCLE_STATUS_LABEL[displayStatus]}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 mt-2">
                            <div>
                              <p className="text-xs text-gray-400">เริ่มปลูก</p>
                              <p className="text-sm font-medium text-gray-700">
                                {cycle.planting_start_date ? formatDateTh(cycle.planting_start_date) : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">คาดเก็บเกี่ยว</p>
                              <p className="text-sm font-medium text-amber-600">
                                {cycle.expected_harvest_date ? formatDateTh(cycle.expected_harvest_date) : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">วันรับสินค้า</p>
                              <p className="text-sm font-medium text-forest">
                                {orderInfo?.pickup_date ? formatDateTh(orderInfo.pickup_date) : '—'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              <p className="text-sm text-gray-600">
                                {cycle.growing_areas?.name || 'ไม่ระบุพื้นที่'}
                                {cycle.growing_areas?.zone_code && ` (${cycle.growing_areas.zone_code})`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )

          ) : (

            /* ===== แท็บ: รอสร้างรอบปลูก ===== */
            pendingOrders.length === 0 ? (
              <div className="card text-center py-16 text-gray-300">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-300" />
                <p>ออเดอร์ทุกรายการมีรอบปลูกแล้ว</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingOrders.map(({ order, item }, idx) => {
                  const harvestDays = item.vegetable_types?.harvest_days || 35
                  const autoStart = calcPlantingStart(order.pickup_date, harvestDays)
                  return (
                    <div key={`${order.id}-${item.id}-${idx}`} className="card border-l-4 border-amber-400">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-800">
                              {item.vegetable_types?.name || '—'}
                            </p>
                            <span className="text-xs text-gray-400">
                              {item.quantity} {item.vegetable_types?.unit}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mb-1">
                            ออเดอร์ #{order.id.slice(0,8).toUpperCase()} · รับสินค้า {formatDateTh(order.pickup_date)}
                          </p>
                          <div className="flex items-center gap-1.5 text-amber-600">
                            <Clock className="w-3.5 h-3.5" />
                            <p className="text-xs font-medium">
                              ควรเริ่มปลูก: {autoStart ? formatDateTh(autoStart) : '—'}
                              {harvestDays && ` (ใช้เวลา ${harvestDays} วัน)`}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => openCreateModal(order, item)}
                          className="btn-primary btn-sm flex-shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" /> สร้างรอบปลูก
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </main>

      {/* ====== Modal: สร้างรอบปลูก ====== */}
      {showModal && selectedOrderItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-forest-dark">สร้างรอบปลูก</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {selectedOrderItem.item.vegetable_types?.name} —
                  รับสินค้า {formatDateTh(selectedOrderItem.order.pickup_date)}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* วันเริ่มปลูก (คำนวณอัตโนมัติแต่แก้ได้) */}
              <div>
                <label className="label">
                  วันเริ่มปลูก *
                  <span className="text-xs text-amber-600 ml-1 font-normal">
                    (คำนวณอัตโนมัติจากวันรับสินค้า)
                  </span>
                </label>
                <input
                  required
                  type="date"
                  value={form.planting_start_date}
                  onChange={e => setForm(s => ({ ...s, planting_start_date: e.target.value }))}
                  className="input"
                />
                {form.planting_start_date && (
                  <p className="text-xs text-gray-400 mt-1">
                    คาดเก็บเกี่ยว: {formatDateTh(calcExpectedHarvest(
                      form.planting_start_date,
                      selectedOrderItem.item.vegetable_types?.harvest_days || 35
                    ))}
                  </p>
                )}
              </div>

              {/* พื้นที่ปลูก */}
              <div>
                <label className="label">พื้นที่ปลูก</label>
                <select
                  value={form.growing_area_id}
                  onChange={e => setForm(s => ({ ...s, growing_area_id: e.target.value }))}
                  className="input"
                >
                  <option value="">— ไม่ระบุ —</option>
                  {growingAreas.map(area => (
                    <option key={area.id} value={area.id}>
                      {area.name}{area.zone_code ? ` (${area.zone_code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* หมายเหตุ */}
              <div>
                <label className="label">หมายเหตุ</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(s => ({ ...s, notes: e.target.value }))}
                  className="input"
                  placeholder="เช่น ปลูกในรางที่ 3"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  ยกเลิก
                </button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><div className="spinner w-4 h-4" /> กำลังบันทึก...</> : 'ยืนยันสร้างรอบปลูก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
