import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Minus, Plus, Trash2, ArrowRight, Leaf, ArrowLeft,
  Calendar, CheckCircle2, AlertTriangle, Clock, MapPin, Truck, Sparkles
} from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'
import { getMinPickupDate, formatDateTh } from '../../utils/dateUtils'
import { checkCartCapacity, createOrder } from '../../api/orders'
import { supabase } from '../../api/supabaseClient'
import toast from 'react-hot-toast'

export default function Cart() {
  const {
    cart,
    vegItems,
    equipItems,
    removeFromCart,
    updateQty,
    clearCartCategory,
    clearCart,
    totalItems,
    totalPrice,
    vegTotalPrice,
    equipTotalPrice,
    vegTotalWeight
  } = useCart()

  const { user, isLoggedIn } = useAuth()
  const navigate = useNavigate()

  // ฟอร์มสั่งจองผัก
  const [pickupDate, setPickupDate] = useState('')
  const [notes, setNotes] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [capacity, setCapacity] = useState(null)
  const [checkingCap, setCheckingCap] = useState(false)
  const [submittingVeg, setSubmittingVeg] = useState(false)

  // คำนวณวันรับสินค้าขั้นต่ำจากผักที่ใช้เวลาปลูกนานที่สุดในตะกร้า
  const maxHarvestDays = useMemo(() => {
    if (vegItems.length === 0) return 30
    return Math.max(...vegItems.map(v => Number(v.harvest_days) || 30))
  }, [vegItems])

  const minPickupDate = useMemo(() => {
    return getMinPickupDate(maxHarvestDays)
  }, [maxHarvestDays])

  // ตั้งวันรับสินค้าเริ่มต้นเมื่อมีรายการผัก
  useEffect(() => {
    if (vegItems.length > 0 && (!pickupDate || pickupDate < minPickupDate)) {
      setPickupDate(minPickupDate)
    }
  }, [vegItems, minPickupDate])

  // คำนวณจำนวนช่องปลูกทั้งหมดที่ต้องใช้
  const totalSlotsNeeded = useMemo(() => {
    return vegItems.reduce((sum, item) => {
      const slotsPerKg = Number(item.slots_per_kg) || 4
      return sum + Math.ceil(Number(item.qty) * slotsPerKg)
    }, 0)
  }, [vegItems])

  // ตรวจสอบ capacity แปลงปลูกเมื่อเปลี่ยนวันรับ หรือเปลี่ยนรายการผัก
  useEffect(() => {
    if (pickupDate && vegItems.length > 0) {
      runCapacityCheck()
    }
  }, [pickupDate, totalSlotsNeeded, vegItems.length])

  async function runCapacityCheck() {
    if (!pickupDate || vegItems.length === 0) return
    setCheckingCap(true)
    try {
      // ตรวจสอบความจุจากแปลงปลูกที่สร้างไว้ใน จัดการพื้นที่ปลูก (growing_areas) แบบแยกผักเฉพาะและแปลงรวม Waterfall
      const result = await checkCartCapacity(pickupDate, vegItems)
      setCapacity(result)
    } catch (err) {
      console.error('Capacity check error:', err)
    } finally {
      setCheckingCap(false)
    }
  }

  // ปรับปริมาณผัก (+/- 0.5 กก.)
  function handleVegQtyStep(item, delta) {
    const current = Number(item.qty) || 0.5
    const next = Math.round((current + delta) * 10) / 10
    updateQty(item.id, next)
  }

  // ปรับปริมาณอุปกรณ์ (+/- 1)
  function handleEquipQtyStep(item, delta) {
    const current = Number(item.qty) || 1
    const next = Math.round(current + delta)
    updateQty(item.id, next)
  }

  // บันทึกคำสั่งจองผักในระบบ (สถานะ waiting_cycle)
  async function handleOrderVegetables(e) {
    e.preventDefault()

    if (!isLoggedIn) {
      navigate('/login')
      return
    }

    if (vegItems.length === 0) {
      toast.error('ไม่มีรายการผักในตะกร้า')
      return
    }

    if (capacity && !capacity.canAccept) {
      toast.error(`ไม่สามารถสั่งจองได้: ${capacity.reason || 'พื้นที่แปลงปลูกไม่เพียงพอ'}`)
      return
    }

    setSubmittingVeg(true)
    try {
      const customerEmail = user?.email || ''
      const customerName = user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        (customerEmail ? customerEmail.split('@')[0] : '')

      // อัปเดต profiles ถ้ามีชื่อ
      if (customerName && user?.id) {
        try {
          await supabase
            .from('profiles')
            .update({
              full_name: customerName,
              ...(customerPhone ? { phone: customerPhone } : {})
            })
            .eq('id', user.id)
        } catch (profileErr) {
          console.warn('Could not auto-sync profile:', profileErr)
        }
      }

      // บันทึกหมายเหตุพร้อมข้อมูลติดต่อ
      const formattedNotes = [
        notes?.trim(),
        customerName ? `ผู้สั่งซื้อ: ${customerName}` : '',
        customerPhone ? `เบอร์โทร: ${customerPhone}` : '',
        customerEmail ? `อีเมล: ${customerEmail}` : '',
      ].filter(Boolean).join('\n')

      // สร้างรายการ order_items จากผักทุกชนิดในตะกร้า
      const itemsPayload = vegItems.map(item => {
        const slotsPerKg = Number(item.slots_per_kg) || 4
        const slotsRequired = Math.ceil(Number(item.qty) * slotsPerKg)
        return {
          vegetable_type_id: item.id,
          quantity: Number(item.qty),
          unit: item.unit || 'กก.',
          price_at_order: Number(item.price_per_kg ?? item.price ?? 0),
          slots_required: slotsRequired,
        }
      })

      // สร้างออเดอร์ในสถานะ waiting_cycle
      const order = await createOrder(
        {
          customer_id: user.id,
          status: 'waiting_cycle', // รอ farmer ยืนยันสร้างรอบปลูกก่อน
          pickup_date: pickupDate,
          total_amount: vegTotalPrice,
          notes: formattedNotes,
        },
        itemsPayload
      )

      // ล้างเฉพาะรายการผักออกจากตะกร้า (หากมีอุปกรณ์อยู่จะคงไว้)
      clearCartCategory('vegetable')

      toast.success(
        `สั่งจองผักสำเร็จ ${vegItems.length} ชนิด (${vegTotalWeight} กก.)! 🌱`,
        { duration: 4000 }
      )

      navigate(`/orders/${order.id}`)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'เกิดข้อผิดพลาดในการสั่งจอง กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmittingVeg(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28 w-full">
        {/* Navigation back */}
        <Link
          to="/products"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-forest mb-4 sm:mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> เลือกซื้อสินค้าเพิ่มเติม
        </Link>

        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-100/70 text-forest flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="page-title text-xl sm:text-2xl lg:text-3xl">ตะกร้าสินค้า</h1>
              <p className="page-subtitle text-xs sm:text-sm">
                เลือกผักไฮโดรโปนิกและอุปกรณ์ปลูกผัก รวมไว้ในที่เดียว
              </p>
            </div>
          </div>

          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 self-start sm:self-auto py-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> ล้างตะกร้าทั้งหมด
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          /* Empty Cart State */
          <div className="card text-center py-20 bg-white">
            <div className="w-20 h-20 rounded-3xl bg-primary-50 flex items-center justify-center mx-auto mb-4 text-primary-300">
              <ShoppingCart className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">ตะกร้าของคุณว่างเปล่า</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto text-sm">
              ยังไม่มีผักหรืออุปกรณ์ในตะกร้า สามารถเลือกดูผักสดและเลือกปริมาณครึ่งกิโลได้ตามต้องการ
            </p>
            <div className="flex justify-center gap-3">
              <Link to="/products?category=vegetable" className="btn-primary">
                เลือกผักไฮโดรโปนิก 🥬
              </Link>
              <Link to="/products?category=equipment" className="btn-secondary">
                เลือกอุปกรณ์ปลูก 🌱
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">

            {/* ==================================================== */}
            {/* 1. ส่วน: ผักไฮโดรโปนิก (พรีออเดอร์) */}
            {/* ==================================================== */}
            {vegItems.length > 0 && (
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-emerald-100/80 p-4 sm:p-6 lg:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-6 border-b border-gray-100 gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-green-100 text-green-700 flex items-center justify-center text-base font-bold flex-shrink-0">
                      🥬
                    </span>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-forest-dark leading-tight">
                        ผักไฮโดรโปนิก (สั่งจองล่วงหน้า)
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        เลือกได้ครั้งละ 0.5 กก. · ปลูกสดใหม่ตามรอบการสั่ง
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                    <span className="badge bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                      รวม {vegTotalWeight} กก.
                    </span>
                    <span className="badge bg-forest text-white text-xs font-semibold">
                      {vegItems.length} รายการ
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                  {/* Vegetable Items List */}
                  <div className="lg:col-span-7 space-y-3.5">
                    {vegItems.map(item => {
                      const itemPrice = Number(item.price_per_kg ?? item.price ?? 0)
                      const itemSubtotal = Number(item.qty) * itemPrice
                      return (
                        <div
                          key={item.id}
                          className="p-3.5 sm:p-4 bg-gray-50/70 hover:bg-emerald-50/30 border border-gray-200/80 rounded-2xl transition-all shadow-2xs"
                        >
                          {/* Upper Content: Image + Name + Unit Price + Delete Button */}
                          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                            {/* Image */}
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-white flex-shrink-0 flex items-center justify-center border border-gray-100 shadow-xs">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                              ) : (
                                <Leaf className="w-7 h-7 text-primary-300" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1.5">
                                <h3 className="font-bold text-gray-800 text-sm sm:text-base truncate" title={item.name}>
                                  {item.name}
                                </h3>
                                {/* Delete button on mobile (top right) */}
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item.id)}
                                  className="sm:hidden p-1.5 -mr-1.5 -mt-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                  title="ลบรายการนี้"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <p className="text-xs sm:text-sm text-forest font-semibold mt-0.5 whitespace-nowrap">
                                ฿{itemPrice.toLocaleString()} <span className="text-gray-400 font-normal">/ {item.unit || 'กก.'}</span>
                              </p>

                              {item.harvest_days && (
                                <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5 whitespace-nowrap">
                                  <Clock className="w-3 h-3 flex-shrink-0" />
                                  <span>ระยะเวลาปลูก {item.harvest_days} วัน</span>
                                </p>
                              )}
                            </div>

                            {/* Desktop Controls (Stepper, Subtotal, Delete) */}
                            <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                              {/* Stepper with 0.5 kg increments */}
                              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleVegQtyStep(item, -0.5)}
                                  className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-600 transition-colors"
                                  title="ลด 0.5 กก."
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>

                                <div className="w-14 text-center">
                                  <span className="font-bold text-sm text-forest-dark">
                                    {item.qty}
                                  </span>
                                  <span className="text-[10px] text-gray-400 block leading-none">กก.</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleVegQtyStep(item, 0.5)}
                                  className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-forest flex items-center justify-center transition-colors font-bold"
                                  title="เพิ่ม 0.5 กก."
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Subtotal */}
                              <div className="text-right w-20 flex-shrink-0">
                                <p className="font-bold text-forest text-base">
                                  ฿{itemSubtotal.toLocaleString()}
                                </p>
                              </div>

                              {/* Desktop Delete button */}
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.id)}
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                title="ลบรายการนี้"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Mobile Controls Row (< sm screens) */}
                          <div className="flex sm:hidden items-center justify-between mt-3 pt-2.5 border-t border-gray-200/60">
                            {/* Stepper */}
                            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleVegQtyStep(item, -0.5)}
                                className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
                                title="ลด 0.5 กก."
                              >
                                <Minus className="w-4 h-4" />
                              </button>

                              <div className="min-w-[48px] px-1 text-center">
                                <span className="font-bold text-sm text-forest-dark">
                                  {item.qty}
                                </span>
                                <span className="text-[10px] text-gray-400 block leading-none">กก.</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleVegQtyStep(item, 0.5)}
                                className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-forest flex items-center justify-center transition-colors font-bold"
                                title="เพิ่ม 0.5 กก."
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Mobile Subtotal */}
                            <div className="text-right">
                              <span className="text-[11px] text-gray-400 block leading-tight">ยอดรวม</span>
                              <p className="font-bold text-forest text-base leading-tight">
                                ฿{itemSubtotal.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 pt-2 px-1 text-xs text-gray-400">
                      <span>💡 ปรับปริมาณได้ทีละ 0.5 กก. ตามความต้องการ</span>
                      <Link to="/products?category=vegetable" className="text-forest hover:underline font-medium">
                        + เลือกผักชนิดอื่นเพิ่ม
                      </Link>
                    </div>
                  </div>


                  {/* Pre-order Checkout Form */}
                  <div className="lg:col-span-5 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border border-emerald-100 rounded-2xl p-5 sm:p-6 space-y-4">
                    <h3 className="font-bold text-forest-dark text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-forest" />
                      ข้อมูลการสั่งจองผักรอบนี้
                    </h3>

                    {/* Date Picker */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5" htmlFor="cart-pickup-date">
                        <Calendar className="w-3.5 h-3.5 inline mr-1 text-forest" />
                        วันที่ต้องการรับสินค้า (กำหนดวันเก็บเกี่ยว)
                      </label>
                      <input
                        id="cart-pickup-date"
                        type="date"
                        min={minPickupDate}
                        value={pickupDate}
                        onChange={e => setPickupDate(e.target.value)}
                        className="input bg-white w-full text-sm font-semibold py-2"
                        required
                      />
                      <p className="text-[11px] text-gray-500 mt-1.5">
                        * ขั้นต่ำ {formatDateTh(minPickupDate)} (อิงจากผักที่ใช้เวลาปลูกนานที่สุด {maxHarvestDays} วัน)
                      </p>
                    </div>

                    {/* Capacity Status & Slots Breakdown */}
                    <div className="p-3.5 bg-white rounded-xl border border-gray-200/80 text-xs space-y-2.5">
                      <div className="flex items-center justify-between font-semibold text-gray-700">
                        <span>จำนวน Slot การปลูกที่ต้องใช้:</span>
                        <span className="font-bold text-forest text-sm">{totalSlotsNeeded} ช่อง</span>
                      </div>

                      {/* รายการ slot แต่ละชนิดผัก */}
                      <div className="bg-gray-50/80 rounded-lg p-2 space-y-1 text-[11px] text-gray-500">
                        {vegItems.map(item => {
                          const slots = Math.ceil(Number(item.qty) * (Number(item.slots_per_kg) || 4))
                          return (
                            <div key={item.id} className="flex justify-between">
                              <span className="truncate pr-2">• {item.name} ({item.qty} กก.)</span>
                              <span className="font-medium text-forest flex-shrink-0">{slots} ช่อง</span>
                            </div>
                          )
                        })}
                      </div>

                      {checkingCap ? (
                        <div className="flex items-center gap-1.5 text-gray-400 py-1">
                          <div className="spinner w-3.5 h-3.5" />
                          <span>กำลังคำนวณ Slot ว่างจริงจากแปลงปลูก...</span>
                        </div>
                      ) : capacity ? (
                        <div className="space-y-2.5 pt-1 border-t border-gray-100">
                          {/* Alert สถานะ */}
                          <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${capacity.canAccept ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                            {capacity.canAccept ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="text-[11px] leading-relaxed flex-1">
                              <p className="font-bold text-xs">
                                {capacity.canAccept
                                  ? `แปลงปลูกมีพื้นที่เพียงพอ (เหลือ slot ปลูกได้ ${capacity.available} ช่อง)`
                                  : `ไม่สามารถสั่งจองได้: ${capacity.reason}`
                                }
                              </p>
                              {!capacity.canAccept && (
                                <p className="text-[11px] text-red-600 mt-1 font-medium">
                                  💡 แนะนำ: กรุณาปรับลดจำนวนผัก หรือเลือกวันรับสินค้าอื่นที่แปลงปลูกมีพื้นที่ว่าง
                                </p>
                              )}
                            </div>
                          </div>

                          {/* สรุปแยกตามชนิดผัก / แปลงเฉพาะ vs แปลงรวม */}
                          {capacity.itemBreakdown && capacity.itemBreakdown.length > 0 && (
                            <div className="space-y-1.5 pt-0.5">
                              {capacity.itemBreakdown.map((ib, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[11px] bg-gray-50/90 px-2.5 py-1.5 rounded-lg border border-gray-150">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className={ib.canAccept ? 'text-forest font-semibold' : 'text-red-600 font-bold'}>
                                      {ib.canAccept ? '✓' : '✗'} {ib.name}
                                    </span>
                                    <span className="text-[10px] text-gray-500">
                                      ({ib.hasDedicated ? `แปลงเฉพาะ: ${ib.dedicatedAreaName}` : '🌐 ใช้แปลงรวม'})
                                    </span>
                                  </div>
                                  <div className="text-[10px] flex-shrink-0 font-medium">
                                    {ib.canAccept ? (
                                      <span className="text-emerald-700 font-semibold">ใช้ {ib.slotsNeeded} ช่อง</span>
                                    ) : (
                                      <span className="text-red-600 font-bold">ขาดอีก {ib.shortage} ช่อง</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* สรุป Slot การปลูกได้ทั้งหมด อ้างอิงจาก จัดการพื้นที่ปลูก */}
                          <div className="flex justify-between items-center text-[11px] text-gray-600">
                            <span>พื้นที่แปลงปลูก ({capacity.areaName || 'แปลงปลูก'}):</span>
                            <span className="font-semibold text-gray-800">
                              ว่าง <strong className="text-forest font-bold text-xs">{capacity.available}</strong> / ทั้งหมด {capacity.total} ช่อง
                            </span>
                          </div>

                          {/* แสดงรายการแปลงปลูกจริงที่อ้างอิงจาก จัดการพื้นที่ปลูก */}
                          {capacity.areas && capacity.areas.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {capacity.areas.map(a => (
                                <span key={a.id} className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${
                                  a.vegetable_type_id
                                    ? 'bg-emerald-50 text-forest border-emerald-200'
                                    : 'bg-blue-50 text-blue-800 border-blue-200'
                                }`}>
                                  {a.vegetable_type_id ? '🌱' : '🌐'} แปลง {a.name}{a.zone_code && a.zone_code !== a.name ? ` (${a.zone_code})` : ''}: {a.total_slots} ช่อง
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Meter Bar หลอดแสดง Slot */}
                          <div className="w-full h-2 bg-gray-200/80 rounded-full overflow-hidden flex">
                            <div
                              className="bg-amber-500 transition-all duration-300"
                              style={{ width: `${Math.min(100, (capacity.used / (capacity.total || 1)) * 100)}%` }}
                              title={`จองแล้ว: ${capacity.used} ช่อง`}
                            />
                            {capacity.canAccept && (
                              <div
                                className="bg-forest transition-all duration-300 opacity-90"
                                style={{
                                  width: `${Math.min(
                                    100 - (capacity.used / (capacity.total || 1)) * 100,
                                    (totalSlotsNeeded / (capacity.total || 1)) * 100
                                  )}%`
                                }}
                                title={`ออเดอร์นี้ใช้: ${totalSlotsNeeded} ช่อง`}
                              />
                            )}
                          </div>

                          {/* Legend ใต้หลอด */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-gray-500 pt-0.5">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block flex-shrink-0" />
                              จองแล้ว {capacity.used}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-forest inline-block flex-shrink-0" />
                              ออเดอร์นี้ {totalSlotsNeeded}
                            </span>
                            <span className="font-bold text-forest">
                              ปลูกได้อีก {capacity.available} ช่อง
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Customer Info & Notes */}
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          เบอร์โทรติดต่อ (สำหรับรับผัก)
                        </label>
                        <input
                          type="tel"
                          placeholder="เช่น 081-234-5678"
                          value={customerPhone}
                          onChange={e => setCustomerPhone(e.target.value)}
                          className="input bg-white w-full text-xs py-2"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          หมายเหตุเพิ่มเติม (ถ้ามี)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="เช่น ต้องการผักแบบมีรากติด, มารับช่วงเช้า"
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          className="input bg-white w-full text-xs py-1.5"
                        />
                      </div>
                    </div>

                    {/* Cost Summary */}
                    <div className="border-t border-emerald-200/60 pt-3 space-y-1 text-xs">
                      <div className="flex justify-between text-gray-600">
                        <span>น้ำหนักรวม</span>
                        <span className="font-semibold">{vegTotalWeight} กก.</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>สถานะเริ่มต้น</span>
                        <span className="font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          รอสร้างรอบปลูก
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline pt-2 text-base font-bold text-gray-800">
                        <span>ยอดสั่งจองผัก</span>
                        <span className="text-xl text-forest">฿{vegTotalPrice.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    {isLoggedIn ? (
                      <button
                        id="btn-confirm-veg-order"
                        type="button"
                        onClick={handleOrderVegetables}
                        disabled={submittingVeg || (capacity && !capacity.canAccept)}
                        className={`w-full py-3.5 text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 rounded-xl ${
                          capacity && !capacity.canAccept
                            ? 'bg-rose-50 text-rose-700 border-2 border-rose-300 cursor-not-allowed opacity-90 shadow-none'
                            : 'btn-primary hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                      >
                        {submittingVeg ? (
                          <>
                            <div className="spinner w-4 h-4 flex-shrink-0" />
                            <span>กำลังส่งคำสั่งจอง...</span>
                          </>
                        ) : capacity && !capacity.canAccept ? (
                          <>
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                            <span className="truncate">ไม่สามารถสั่งจองได้ (พื้นที่แปลงปลูกไม่พอ)</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">ยืนยันการสั่งจองผัก (฿{vegTotalPrice.toLocaleString()})</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <Link to="/login" className="btn-primary w-full text-center py-2.5 text-sm">
                        เข้าสู่ระบบเพื่อสั่งจองผัก
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ==================================================== */}
            {/* 2. ส่วน: อุปกรณ์ปลูกผัก (ถ้ามีในตะกร้า) */}
            {/* ==================================================== */}
            {equipItems.length > 0 && (
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-blue-100/80 p-4 sm:p-6 lg:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-5 mb-5 sm:mb-6 border-b border-gray-100 gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-base font-bold flex-shrink-0">
                      🌱
                    </span>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-gray-800 leading-tight">
                        อุปกรณ์ปลูกผัก (จัดส่งถึงบ้าน)
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        สินค้าพร้อมส่ง ตัดรอบจัดส่งภายใน 1-3 วัน
                      </p>
                    </div>
                  </div>

                  <span className="badge bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold self-start sm:self-auto">
                    {equipItems.length} รายการ
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                  {/* Equipment Items List */}
                  <div className="lg:col-span-8 space-y-3.5">
                    {equipItems.map(item => {
                      const itemPrice = Number(item.price_per_kg ?? item.price ?? 0)
                      const itemSubtotal = Number(item.qty) * itemPrice
                      return (
                        <div
                          key={item.id}
                          className="p-3.5 sm:p-4 bg-gray-50/70 hover:bg-blue-50/30 border border-gray-200/80 rounded-2xl transition-all shadow-2xs"
                        >
                          {/* Upper Content: Image + Info + Desktop Controls / Mobile Delete */}
                          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                            {/* Thumbnail */}
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-white flex-shrink-0 flex items-center justify-center border border-gray-100 shadow-xs">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                              ) : (
                                <Leaf className="w-6 h-6 text-gray-300" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1.5">
                                <p className="font-semibold text-gray-800 text-sm sm:text-base truncate" title={item.name}>
                                  {item.name}
                                </p>
                                {/* Delete button on mobile (top right) */}
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item.id)}
                                  className="sm:hidden p-1.5 -mr-1.5 -mt-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                  title="ลบรายการนี้"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <p className="text-xs sm:text-sm text-blue-600 font-semibold mt-0.5 whitespace-nowrap">
                                ฿{itemPrice.toLocaleString()} <span className="text-gray-400 font-normal">/ {item.unit || 'ชิ้น'}</span>
                              </p>
                            </div>

                            {/* Desktop Controls (Stepper, Subtotal, Delete) */}
                            <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                              {/* Desktop Stepper */}
                              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleEquipQtyStep(item, -1)}
                                  className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-600 transition-colors"
                                  title="ลดจำนวน"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-10 text-center text-sm font-bold text-gray-800">{item.qty}</span>
                                <button
                                  type="button"
                                  onClick={() => handleEquipQtyStep(item, 1)}
                                  className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center justify-center transition-colors font-bold"
                                  title="เพิ่มจำนวน"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Desktop Subtotal */}
                              <div className="text-right w-20 flex-shrink-0">
                                <p className="font-bold text-gray-800 text-base">
                                  ฿{itemSubtotal.toLocaleString()}
                                </p>
                              </div>

                              {/* Desktop Delete button */}
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.id)}
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                title="ลบรายการนี้"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Mobile Controls Row (< sm screens) */}
                          <div className="flex sm:hidden items-center justify-between mt-3 pt-2.5 border-t border-gray-200/60">
                            {/* Mobile Stepper */}
                            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleEquipQtyStep(item, -1)}
                                className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
                                title="ลดจำนวน"
                              >
                                <Minus className="w-4 h-4" />
                              </button>

                              <div className="min-w-[40px] px-1 text-center">
                                <span className="font-bold text-sm text-gray-800">
                                  {item.qty}
                                </span>
                                <span className="text-[10px] text-gray-400 block leading-none">{item.unit || 'ชิ้น'}</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleEquipQtyStep(item, 1)}
                                className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 flex items-center justify-center transition-colors font-bold"
                                title="เพิ่มจำนวน"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Mobile Subtotal */}
                            <div className="text-right">
                              <span className="text-[11px] text-gray-400 block leading-tight">ยอดรวม</span>
                              <p className="font-bold text-gray-800 text-base leading-tight">
                                ฿{itemSubtotal.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Equipment Checkout Box */}
                  <div className="lg:col-span-4 bg-gray-50 border border-gray-200/80 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                        <Truck className="w-4 h-4 text-blue-600" />
                        สรุปการสั่งซื้ออุปกรณ์
                      </h4>
                      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                        อุปกรณ์จะจัดส่งตามที่อยู่ที่ระบุในขั้นตอนการชำระเงิน
                      </p>
                      <div className="flex justify-between items-baseline pt-2 border-t border-gray-200 font-bold">
                        <span className="text-gray-700 text-sm">ยอดรวมอุปกรณ์</span>
                        <span className="text-lg text-blue-700">฿{equipTotalPrice.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="pt-4">
                      {isLoggedIn ? (
                        <button
                          id="btn-proceed-equipment-checkout"
                          onClick={() => navigate('/equipment/checkout')}
                          className="btn-primary w-full py-2.5 text-sm bg-blue-600 hover:bg-blue-700 border-none flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                        >
                          ดำเนินการต่อ <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <Link to="/login" className="btn-primary w-full text-center py-2.5 text-sm">
                          เข้าสู่ระบบเพื่อสั่งซื้อ
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}

