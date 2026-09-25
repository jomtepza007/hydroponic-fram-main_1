import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, MapPin, User, Phone, CheckCircle2, Leaf } from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../api/supabaseClient'
import toast from 'react-hot-toast'

export default function EquipmentCheckout() {
  const { cart, totalPrice, clearCart } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    recipient_name: user?.user_metadata?.full_name || '',
    phone: '',
    address: '',
    district: '',
    province: '',
    postal_code: '',
    notes: '',
  })
  const [step, setStep] = useState(1) // 1 = review, 2 = address, 3 = done
  const [submitting, setSubmitting] = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  async function handlePlaceOrder(e) {
    e.preventDefault()
    if (cart.length === 0) { toast.error('ตะกร้าว่างเปล่า'); return }
    setSubmitting(true)

    // วันจัดส่งคาดการณ์ = วันนี้ + 3 วัน
    const deliveryDate = new Date()
    deliveryDate.setDate(deliveryDate.getDate() + 3)
    const pickupDate = deliveryDate.toISOString().split('T')[0]

    const shippingAddress = `${form.address} ${form.district} ${form.province} ${form.postal_code}`

    try {
      // สร้าง order
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert([{
          customer_id: user.id,
          status: 'pending',
          pickup_date: pickupDate,
          total_amount: totalPrice,
          notes: `📦 จัดส่งถึงบ้าน\nผู้รับ: ${form.recipient_name}\nโทร: ${form.phone}\nที่อยู่: ${shippingAddress}\n${form.notes ? 'หมายเหตุ: ' + form.notes : ''}`,
        }])
        .select()
        .single()
      if (orderErr) throw orderErr

      // สร้าง order_items
      const items = cart.map(item => ({
        order_id: order.id,
        vegetable_type_id: item.id,
        quantity: item.qty,
        price_at_order: Number(item.price_per_kg),
        unit: item.unit,
        slots_required: 0,
      }))
      const { error: itemErr } = await supabase.from('order_items').insert(items)
      if (itemErr) throw itemErr

      // ดึงข้อมูล vegetable_types ล่าสุดเพื่อดึง resource_id ของแต่ละสินค้าในตะกร้าอย่างแม่นยำ
      const itemIds = cart.map(i => i.id).filter(Boolean)
      const { data: dbItems } = await supabase
        .from('vegetable_types')
        .select('id, name, category, resource_id')
        .in('id', itemIds)

      const dbMap = new Map((dbItems || []).map(d => [d.id, d]))

      // ตัดสต็อกอัตโนมัติสำหรับ equipment แบบ Atomic ระดับคำสั่งซื้อ (Security Definer)
      let rpcDeducted = false
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('deduct_order_equipment_stock', {
          p_order_id: order.id,
        })
        if (!rpcErr && rpcRes && rpcRes.success && rpcRes.deducted_count > 0) {
          rpcDeducted = true
        }
      } catch (err) {
        console.warn('RPC deduct_order_equipment_stock not available, falling back:', err)
      }

      // หาก Stored Procedure deduct_order_equipment_stock ยังไม่ได้รัน ให้ตัดสต็อกทีละรายการ
      if (!rpcDeducted) {
        for (const item of cart) {
          const dbItem = dbMap.get(item.id)
          const resourceId = item.resource_id || dbItem?.resource_id
          const itemName = item.name || dbItem?.name || 'อุปกรณ์'
          const qty = Number(item.qty) || 1

          if (resourceId) {
            let adjusted = false
            try {
              const { data: rpcQty, error: rpcErr } = await supabase.rpc('adjust_resource_qty', {
                r_id: resourceId,
                delta: -qty,
              })
              if (!rpcErr && rpcQty !== null) {
                adjusted = true
              }
            } catch (e) {
              console.warn('adjust_resource_qty failed:', e)
            }

            // Fallback: หาก RPC ไม่พร้อม ให้ลองดึงและอัปเดตตรง
            if (!adjusted) {
              const { data: res } = await supabase
                .from('resources')
                .select('current_qty')
                .eq('id', resourceId)
                .single()

              if (res) {
                await supabase
                  .from('resources')
                  .update({ current_qty: Math.max(0, (Number(res.current_qty) || 0) - qty) })
                  .eq('id', resourceId)
              }
            }

            // บันทึก Transaction log พร้อม related_order_id เสมอ
            await supabase.from('resource_transactions').insert([{
              resource_id: resourceId,
              transaction_type: 'out',
              quantity: qty,
              related_order_id: order.id,
              notes: `ตัดสต็อกอัตโนมัติ: ออเดอร์ ${order.id.slice(0, 8).toUpperCase()} (${itemName})`,
            }])
          }
        }
      }

      clearCart()
      setStep(3)
      setTimeout(() => navigate(`/orders/${order.id}`), 2500)
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  // Step 3: สำเร็จ
  if (step === 3) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-28">
          <div className="text-center">
            <CheckCircle2 className="w-20 h-20 text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">สั่งซื้อสำเร็จ! 🎉</h1>
            <p className="text-gray-400">กำลังพาไปหน้าติดตามคำสั่งซื้อ...</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-28 w-full">

        <Link to="/cart" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-forest mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> กลับตะกร้า
        </Link>

        {/* Step Indicator */}
        <div className="flex items-center gap-3 mb-8">
          <div className={`flex items-center gap-2 text-sm font-medium ${step === 1 ? 'text-forest' : 'text-gray-300'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-forest text-white' : 'bg-gray-100 text-gray-400'}`}>1</span>
            ตรวจสอบรายการ
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className={`flex items-center gap-2 text-sm font-medium ${step === 2 ? 'text-forest' : 'text-gray-300'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-forest text-white' : 'bg-gray-100 text-gray-400'}`}>2</span>
            ที่อยู่จัดส่ง
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main Content */}
          <div className="lg:col-span-2">

            {/* Step 1: Review */}
            {step === 1 && (
              <div className="card">
                <h2 className="font-bold text-gray-800 mb-4">ตรวจสอบรายการสินค้า</h2>
                <div className="space-y-3 mb-6">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-primary-50 flex-shrink-0 flex items-center justify-center">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          : <Leaf className="w-5 h-5 text-primary-200" />
                        }
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                        <p className="text-xs text-gray-400">{item.qty} {item.unit} × ฿{Number(item.price_per_kg).toLocaleString()}</p>
                      </div>
                      <p className="font-bold text-gray-800">฿{(item.qty * Number(item.price_per_kg)).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => setStep(2)} className="btn-primary w-full">
                  ดำเนินการต่อ — กรอกที่อยู่จัดส่ง
                </button>
              </div>
            )}

            {/* Step 2: Address */}
            {step === 2 && (
              <form onSubmit={handlePlaceOrder} className="card space-y-4">
                <h2 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-forest" /> ที่อยู่จัดส่ง
                </h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> ชื่อผู้รับ *</label>
                    <input required name="recipient_name" value={form.recipient_name} onChange={handleChange} className="input" placeholder="ชื่อ-นามสกุล" />
                  </div>
                  <div>
                    <label className="label flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> เบอร์โทรศัพท์ *</label>
                    <input required name="phone" value={form.phone} onChange={handleChange} className="input" placeholder="0xx-xxx-xxxx" />
                  </div>
                </div>

                <div>
                  <label className="label">ที่อยู่ (บ้านเลขที่ / ซอย / ถนน) *</label>
                  <input required name="address" value={form.address} onChange={handleChange} className="input" placeholder="เช่น 123/4 ถ.พหลโยธิน" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">แขวง/ตำบล *</label>
                    <input required name="district" value={form.district} onChange={handleChange} className="input" />
                  </div>
                  <div>
                    <label className="label">เขต/จังหวัด *</label>
                    <input required name="province" value={form.province} onChange={handleChange} className="input" />
                  </div>
                  <div>
                    <label className="label">รหัสไปรษณีย์ *</label>
                    <input required name="postal_code" value={form.postal_code} onChange={handleChange} className="input" maxLength={5} />
                  </div>
                </div>

                <div>
                  <label className="label">หมายเหตุเพิ่มเติม</label>
                  <input name="notes" value={form.notes} onChange={handleChange} className="input" placeholder="เช่น ฝากไว้หน้าบ้าน" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">
                    ย้อนกลับ
                  </button>
                  <button type="submit" disabled={submitting} className="btn-primary flex-1">
                    {submitting ? <><div className="spinner w-4 h-4" /> กำลังสั่งซื้อ...</> : '✅ ยืนยันสั่งซื้อ'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Order Summary sidebar */}
          <div className="lg:col-span-1">
            <div className="card sticky top-28">
              <h3 className="font-bold text-gray-800 mb-3 text-sm">สรุปคำสั่งซื้อ</h3>
              <div className="space-y-1.5 mb-3">
                {cart.map(item => (
                  <div key={item.id} className="flex justify-between text-xs text-gray-500">
                    <span className="truncate pr-1">{item.name} × {item.qty}</span>
                    <span>฿{(item.qty * Number(item.price_per_kg)).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-2">
                <div className="flex justify-between font-bold text-gray-800">
                  <span>รวม</span>
                  <span className="text-forest">฿{totalPrice.toLocaleString()}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">🚚 จัดส่งภายใน 3 วันทำการ</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
