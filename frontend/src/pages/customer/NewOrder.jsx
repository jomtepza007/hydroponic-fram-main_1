import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Clock, Leaf, ArrowLeft, ShoppingBag, Calendar,
  CheckCircle2, AlertTriangle, Minus, Plus
} from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import { getVegetableById } from '../../api/vegetables'
import { checkFarmCapacity, createOrder } from '../../api/orders'
import { supabase } from '../../api/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { getMinPickupDate, calculatePlantingSchedule, formatDateTh } from '../../utils/dateUtils'
import toast from 'react-hot-toast'

export default function NewOrder() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [vegetable, setVegetable] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [pickupDate, setPickupDate] = useState('')
  const [notes, setNotes] = useState('')
  const [capacity, setCapacity] = useState(null)
  const [checkingCap, setCheckingCap] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) loadVegetable()
  }, [id])

  useEffect(() => {
    if (pickupDate && vegetable) checkCapacity()
  }, [pickupDate, quantity, vegetable])

  async function loadVegetable() {
    try {
      const data = await getVegetableById(id)
      setVegetable(data)
      // ตั้งวันขั้นต่ำอัตโนมัติ
      setPickupDate(getMinPickupDate(data.harvest_days || 30))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function checkCapacity() {
    if (!pickupDate || !vegetable) return
    setCheckingCap(true)
    try {
      const slotsNeeded = Math.ceil(quantity * (vegetable.slots_per_kg || 4))
      const result = await checkFarmCapacity(
        pickupDate,
        slotsNeeded,
        vegetable.harvest_days || 35,
        vegetable.id
      )
      setCapacity(result)
    } catch (err) {
      console.error(err)
    } finally {
      setCheckingCap(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!capacity?.canAccept) {
      toast.error(`พื้นที่แปลงปลูก${capacity?.areaName ? ' ' + capacity.areaName : ''} เต็มในวันที่เลือก กรุณาเลือกวันอื่น`)
      return
    }

    setSubmitting(true)
    try {
      const slotsNeeded = Math.ceil(quantity * (vegetable.slots_per_kg || 4))
      const customerEmail = user?.email || ''
      const customerName = user?.user_metadata?.full_name ||
                           user?.user_metadata?.name ||
                           (customerEmail ? customerEmail.split('@')[0] : '')

      // อัปเดต profiles ให้อัตโนมัติถ้ามีชื่อและยังไม่ได้บันทึก (ไม่ให้กระทบการสั่งซื้อถ้ามีข้อผิดพลาด)
      if (customerName && user?.id) {
        try {
          await supabase
            .from('profiles')
            .update({ full_name: customerName })
            .eq('id', user.id)
        } catch (profileErr) {
          console.warn('Could not auto-sync profile name:', profileErr)
        }
      }

      // บันทึกข้อมูลลูกค้าลงใน notes เพื่อให้ดึงดูได้เสมอ
      const formattedNotes = [
        notes?.trim(),
        customerName ? `ผู้สั่งซื้อ: ${customerName}` : '',
        customerEmail ? `อีเมล: ${customerEmail}` : '',
      ].filter(Boolean).join('\n')

      const order = await createOrder(
        {
          customer_id: user.id,
          status: 'pending',
          pickup_date: pickupDate,
          total_amount: quantity * vegetable.price_per_kg,
          notes: formattedNotes,
        },
        [{
          vegetable_type_id: vegetable.id,
          quantity,
          unit: vegetable.unit,
          price_at_order: vegetable.price_per_kg,
          slots_required: slotsNeeded,
        }]
      )
      toast.success('สั่งจองสำเร็จ! 🌱')
      navigate(`/orders/${order.id}`)
    } catch (err) {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="spinner w-10 h-10" /></div>
  }

  if (!vegetable) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">ไม่พบสินค้า</p>
        <Link to="/products" className="btn-outline">กลับรายการผัก</Link>
      </div>
    )
  }

  const schedule = pickupDate ? calculatePlantingSchedule(pickupDate, vegetable.harvest_days, vegetable.germination_days) : null
  const totalPrice = quantity * vegetable.price_per_kg

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-28">
        <Link to={`/products/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-forest mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          กลับ
        </Link>

        <h1 className="page-title mb-8">สั่งจองล่วงหน้า</h1>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">

            {/* Product Info */}
            <div className="card flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {vegetable.image_url
                  ? <img src={vegetable.image_url} alt="" className="w-full h-full object-cover" />
                  : <Leaf className="w-8 h-8 text-primary-300" />
                }
              </div>
              <div>
                <h2 className="font-bold text-lg text-gray-800">{vegetable.name}</h2>
                <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    ปลูก {vegetable.harvest_days} วัน
                  </span>
                  <span className="font-semibold text-forest">฿{vegetable.price_per_kg}/{vegetable.unit}</span>
                </div>
              </div>
            </div>

            {/* Quantity */}
            <div className="card">
              <label className="label">จำนวนที่ต้องการ ({vegetable.unit})</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center hover:bg-primary-100 transition-colors"
                >
                  <Minus className="w-4 h-4 text-forest" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="input text-center w-24 font-bold text-lg"
                  id="input-quantity"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center hover:bg-primary-100 transition-colors"
                >
                  <Plus className="w-4 h-4 text-forest" />
                </button>
                <span className="text-sm text-gray-400">{vegetable.unit}</span>
              </div>
            </div>

            {/* Pickup Date */}
            <div className="card">
              <label className="label" htmlFor="input-pickup-date">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                วันที่ต้องการรับสินค้า
              </label>
              <input
                id="input-pickup-date"
                type="date"
                value={pickupDate}
                min={vegetable ? getMinPickupDate(vegetable.harvest_days) : ''}
                onChange={e => setPickupDate(e.target.value)}
                className="input"
                required
              />
              {vegetable && (
                <p className="text-xs text-gray-400 mt-2">
                  * วันรับขั้นต่ำ: {formatDateTh(getMinPickupDate(vegetable.harvest_days))} (ใช้เวลาปลูก {vegetable.harvest_days} วัน)
                </p>
              )}

              {/* Capacity Status & Real-time Deduction Breakdown */}
              {pickupDate && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  {checkingCap ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                      <div className="spinner w-4 h-4" />
                      กำลังคำนวณพื้นที่ปลูกจริงจากออเดอร์ในระบบ...
                    </div>
                  ) : capacity ? (
                    <div className="space-y-3">
                      {/* Alert Message */}
                      <div className={`alert ${capacity.canAccept ? 'alert-success' : 'alert-danger'} p-3 rounded-xl flex items-start gap-2.5`}>
                        {capacity.canAccept
                          ? <CheckCircle2 className="w-5 h-5 text-forest flex-shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        }
                        <div className="text-sm">
                          <p className="font-semibold">
                            {capacity.canAccept
                              ? `แปลงปลูก ${capacity.areaName || ''} มีพื้นที่เพียงพอ (เหลือจริง ${capacity.available} ช่อง)`
                              : `แปลงปลูก ${capacity.areaName || ''} ไม่เพียงพอ (เหลือ ${capacity.available} ช่อง แต่ต้องการ ${Math.ceil(quantity * (vegetable.slots_per_kg || 4))} ช่อง)`
                            }
                          </p>
                          <p className="text-xs opacity-80 mt-0.5">
                            คำนวณหักลบจากออเดอร์จริงของลูกค้าที่มีรอบปลูกทับซ้อนช่วงนี้
                            {capacity.activeOrdersCount > 0 && ` (${capacity.activeOrdersCount} ออเดอร์)`}
                          </p>
                        </div>
                      </div>

                      {/* Capacity Meter Breakdown */}
                      <div className="bg-primary-50/60 rounded-xl p-3.5 border border-primary-200/70 text-xs space-y-2">
                        <div className="flex justify-between items-center text-gray-600 font-medium">
                          <span>การใช้พื้นที่ ({capacity.areaName || 'แปลงปลูก'})</span>
                          <span className="font-bold text-forest">
                            {capacity.used} / {capacity.total} ช่อง ({capacity.occupancyRate}%)
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2.5 bg-gray-200/80 rounded-full overflow-hidden flex">
                          <div
                            className="bg-amber-500 transition-all duration-300"
                            style={{ width: `${Math.min(100, (capacity.used / (capacity.total || 1)) * 100)}%` }}
                            title={`จองแล้ว: ${capacity.used} ช่อง`}
                          />
                          {capacity.canAccept && (
                            <div
                              className="bg-forest transition-all duration-300 opacity-80"
                              style={{ width: `${Math.min(100, ((Math.ceil(quantity * (vegetable.slots_per_kg || 4))) / (capacity.total || 1)) * 100)}%` }}
                              title={`ออเดอร์นี้: ${Math.ceil(quantity * (vegetable.slots_per_kg || 4))} ช่อง`}
                            />
                          )}
                        </div>

                        {/* Grid Breakdown */}
                        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                          <div className="bg-white rounded-lg p-1.5 border border-gray-100 shadow-2xs">
                            <p className="text-gray-400 text-[10px]">ออเดอร์นี้ใช้</p>
                            <p className="font-bold text-forest text-sm">
                              {Math.ceil(quantity * (vegetable.slots_per_kg || 4))} <span className="text-[10px] font-normal">ช่อง</span>
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-1.5 border border-gray-100 shadow-2xs">
                            <p className="text-gray-400 text-[10px]">จองแล้วจริง</p>
                            <p className="font-bold text-amber-600 text-sm">
                              {capacity.used} <span className="text-[10px] font-normal">ช่อง</span>
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-1.5 border border-gray-100 shadow-2xs">
                            <p className="text-gray-400 text-[10px]">พื้นที่เหลือจริง</p>
                            <p className={`font-bold text-sm ${capacity.available > 0 ? 'text-forest' : 'text-red-500'}`}>
                              {capacity.available} <span className="text-[10px] font-normal">ช่อง</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="card">
              <label className="label" htmlFor="input-notes">หมายเหตุ (ถ้ามี)</label>
              <textarea
                id="input-notes"
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="เช่น ต้องการผักที่ล้างมาแล้ว, ต้องการบรรจุในถุงแยก..."
                className="input resize-none"
              />
            </div>

            <button
              type="submit"
              id="btn-confirm-order"
              disabled={submitting || !capacity?.canAccept || !pickupDate}
              className="btn-primary w-full btn-lg"
            >
              {submitting
                ? <><div className="spinner w-4 h-4" /> กำลังส่งออเดอร์...</>
                : <><ShoppingBag className="w-5 h-5" /> ยืนยันการสั่งจอง</>
              }
            </button>
          </form>

          {/* Summary Sidebar */}
          <div className="lg:col-span-2 space-y-4">
            {/* Price Summary */}
            <div className="card">
              <h3 className="font-semibold text-forest-dark mb-4">สรุปออเดอร์</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>{vegetable.name} × {quantity} {vegetable.unit}</span>
                  <span>฿{totalPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-xs bg-primary-50/50 p-2 rounded-lg">
                  <span>พื้นที่ปลูกที่ต้องใช้</span>
                  <span className="font-bold text-forest">
                    {Math.ceil(quantity * (vegetable.slots_per_kg || 4))} ช่อง
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-lg">
                  <span className="text-forest-dark">รวมทั้งสิ้น</span>
                  <span className="text-forest">฿{totalPrice.toLocaleString()}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">* ชำระเงินเมื่อรับสินค้า</p>
              </div>
            </div>

            {/* Planting Schedule Preview */}
            {schedule && (
              <div className="card bg-primary-50 border-primary-200">
                <h3 className="font-semibold text-forest mb-3 flex items-center gap-2">
                  🌱 แผนการปลูก
                </h3>
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'เริ่มเพาะเมล็ด', date: schedule.plantingStart, icon: '🌰' },
                    { label: 'ย้ายลงราง', date: schedule.transferDate, icon: '💧' },
                    { label: 'วันรับสินค้า', date: schedule.expectedHarvest, icon: '🥬' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-gray-600">{item.icon} {item.label}</span>
                      <span className="font-medium text-forest-dark text-xs">{formatDateTh(item.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
