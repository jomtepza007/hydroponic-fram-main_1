import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Camera, Upload, CheckCircle2, User, Phone, MapPin,
  Truck, Package, Leaf, Calendar, Percent, Tag, History, Edit3,
  ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import StatusTimeline from '../../components/orders/StatusTimeline'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import {
  getOrderById,
  updateOrderStatus,
  addPlantingUpdate,
  applyOrderItemDiscount,
  getOrderDiscountLogs
} from '../../api/orders'
import { supabase } from '../../api/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import {
  formatDateTh,
  getNextStatus,
  ORDER_STATUS_LABELS,
  EQUIPMENT_STATUS_LABELS,
  isEquipmentOrder,
  getCustomerDisplayName,
  getCustomerPhone,
} from '../../utils/dateUtils'
import { compressImageToDataUrl } from '../../utils/imageUtils'
import { extractPhotosFromOrder, appendPhotoToOrderNotes, cleanOrderNotes } from '../../utils/orderPhotoUtils'
import toast from 'react-hot-toast'

export default function FarmerOrderDetail() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  const [updating, setUpdating] = useState(false)

  // ส่วนลดต่อรายการ (Discount states)
  const [discountInputs, setDiscountInputs] = useState({})
  const [activeEditItemId, setActiveEditItemId] = useState(null)
  const [savingDiscount, setSavingDiscount] = useState({})
  const [discountLogs, setDiscountLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => {
    loadOrder()
  }, [id])

  async function loadOrder() {
    try {
      const data = await getOrderById(id)
      setOrder(data)

      // กำหนดค่าเริ่มต้นให้กับ discountInputs ตาม order_items
      if (data?.order_items) {
        const inputs = {}
        data.order_items.forEach(item => {
          inputs[item.id] = {
            rate: item.discount_rate != null ? Number(item.discount_rate) : 0,
            note: '',
          }
        })
        setDiscountInputs(inputs)
      }

      // โหลดประวัติส่วนลด
      const logs = await getOrderDiscountLogs(id)
      setDiscountLogs(logs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const isEquipment = isEquipmentOrder(order)
  const labels = isEquipment ? EQUIPMENT_STATUS_LABELS : ORDER_STATUS_LABELS
  const nextStatus = getNextStatus(order?.status, isEquipment)

  async function handleStatusUpdate() {
    if (!nextStatus) return
    setUpdating(true)
    try {
      await updateOrderStatus(id, nextStatus)

      // sync สถานะ planting_cycles ให้ตรงกับ order (สำหรับผัก)
      if (!isEquipment) {
        const cycleStatusMap = {
          seeding: 'seeding',
          growing: 'growing',
          ready: 'ready',
          completed: 'done',
          delivered: 'done',
          cancelled: 'cancelled',
        }
        const cycleStatus = cycleStatusMap[nextStatus]
        if (cycleStatus) {
          const cycleIds = order.order_items
            ?.flatMap(item => item.planting_cycles?.map(c => c.id) || [])
            .filter(Boolean)
          if (cycleIds.length > 0) {
            await supabase
              .from('planting_cycles')
              .update({ status: cycleStatus })
              .in('id', cycleIds)
          }
        }
      }

      toast.success(`อัปเดตสถานะเป็น "${labels[nextStatus]}" สำเร็จ ✅`)
      await loadOrder()
    } catch (err) {
      console.error(err)
      toast.error('เกิดข้อผิดพลาดในการอัปเดตสถานะ')
    } finally {
      setUpdating(false)
    }
  }

  async function handleSaveDiscount(itemId) {
    const input = discountInputs[itemId] || { rate: 0, note: '' }
    const rate = Math.max(0, Math.min(100, Number(input.rate) || 0))
    setSavingDiscount(prev => ({ ...prev, [itemId]: true }))

    try {
      await applyOrderItemDiscount(order.id, itemId, rate, input.note, user?.id)
      toast.success(`บันทึกส่วนลด ${rate}% สำเร็จ 🏷️`)
      setActiveEditItemId(null)
      await loadOrder()
    } catch (err) {
      console.error(err)
      toast.error('เกิดข้อผิดพลาดในการบันทึกส่วนลด')
    } finally {
      setSavingDiscount(prev => ({ ...prev, [itemId]: false }))
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)

    try {
      // 1. บีบอัดรูปภาพเป็น Base64 Data URL ที่มีคุณภาพสูงและขนาดกะทัดรัด (~30KB-50KB)
      let photoUrl = await compressImageToDataUrl(file, 900, 0.75)
      const fileName = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

      // 2. ลองอัปโหลดไปยัง Supabase Storage ถ้ามี Bucket
      try {
        const { error: uploadError } = await supabase.storage
          .from('growth-photos')
          .upload(fileName, file, { cacheControl: '3600', upsert: true })

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('growth-photos')
            .getPublicUrl(fileName)
          if (publicUrl) photoUrl = publicUrl
        }
      } catch (err) {
        console.warn('Storage bucket not accessible, using compressed data URL', err)
      }

      const photoCaption = caption || `อัปเดตสถานะ: ${labels[order.status] || order.status} (${formatDateTh(new Date())})`
      const photoObj = {
        id: `p_${Date.now()}`,
        photo_url: photoUrl,
        caption: photoCaption,
        status: order.status,
        created_at: new Date().toISOString(),
        updated_by: user?.id || null,
      }

      // 3. บันทึกรูปภาพลงใน order.notes (รับประกันว่าลูกค้าจะเห็นรูปภาพ 100% เสมอ)
      const updatedNotes = appendPhotoToOrderNotes(order.notes || '', photoObj)
      const { error: noteUpdateErr } = await supabase
        .from('orders')
        .update({ notes: updatedNotes })
        .eq('id', order.id)

      if (noteUpdateErr) {
        console.warn('Could not update order notes with photo:', noteUpdateErr)
      }

      // 4. พยายามบันทึกลง planting_cycles & planting_updates เชิงสัมพันธ์ด้วย
      try {
        let plantingCycleId = order.order_items?.[0]?.planting_cycles?.[0]?.id

        if (!plantingCycleId && order.order_items?.[0]?.id) {
          const item = order.order_items[0]
          const { data: newCycle } = await supabase
            .from('planting_cycles')
            .insert([{
              order_item_id: item.id,
              vegetable_type_id: item.vegetable_type_id,
              farmer_id: user?.id || null,
              planting_start_date: new Date().toISOString().split('T')[0],
              expected_harvest_date: order.pickup_date || null,
              status: order.status === 'seeding' ? 'seeding' : order.status === 'growing' ? 'growing' : 'scheduled',
              slots_used: item.slots_required || 0,
              notes: `สร้างอัตโนมัติจากการอัปโหลดรูปภาพ`,
            }])
            .select()
            .single()

          if (newCycle) {
            plantingCycleId = newCycle.id
          }
        }

        if (plantingCycleId) {
          await addPlantingUpdate(plantingCycleId, {
            status: order.status,
            photo_url: photoUrl,
            caption: photoCaption,
            updated_by: user?.id || null,
          })
        }
      } catch (cycleErr) {
        console.warn('Relational planting_update save note:', cycleErr)
      }

      toast.success('อัปโหลดรูปภาพสำเร็จ 📸')
      setCaption('')
      await loadOrder()
    } catch (err) {
      toast.error('อัปโหลดล้มเหลว กรุณาลองใหม่อีกครั้ง')
      console.error(err)
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  if (loading) return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-8 flex items-center justify-center">
        <div className="spinner w-10 h-10" />
      </main>
    </div>
  )

  const customerName = getCustomerDisplayName(order)
  const customerPhone = getCustomerPhone(order)
  const growthPhotos = extractPhotosFromOrder(order)

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            to={isAdmin ? "/admin/orders" : "/farmer/orders"}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-forest mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {isAdmin ? 'กลับรายการออเดอร์ (แอดมิน)' : 'กลับรายการออเดอร์ (ผู้จัดการฟาร์ม)'}
          </Link>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="page-title">ออเดอร์ #{order.id.slice(0, 8).toUpperCase()}</h1>
                {isEquipment ? (
                  <span className="badge bg-blue-100 text-blue-700 text-xs">🌱 หมวดหมู่อุปกรณ์</span>
                ) : (
                  <span className="badge bg-green-100 text-green-700 text-xs">🥬 หมวดหมู่ผัก</span>
                )}
              </div>
              <p className="page-subtitle">
                {isEquipment ? 'กำหนดส่งพัสดุ: ' : 'วันรับสินค้า: '}
                <strong className="text-forest">{formatDateTh(order.pickup_date)}</strong>
                {' '}• สั่งซื้อเมื่อ {formatDateTh(order.created_at)}
              </p>
            </div>
            <OrderStatusBadge status={order.status} isEquipment={isEquipment} />
          </div>

          {/* Status Timeline */}
          <div className="card mb-6 overflow-x-auto">
            <h2 className="font-semibold text-forest-dark mb-5 text-sm">
              {isEquipment ? 'สถานะการสั่งซื้อ & การจัดส่ง' : 'สถานะวงจรการปลูก'}
            </h2>
            <div className="min-w-[500px]">
              <StatusTimeline currentStatus={order.status} isEquipment={isEquipment} />
            </div>
          </div>

          {/* Customer & Shipping Information Card */}
          <div className="card mb-6 bg-white border border-gray-100 shadow-sm">
            <h2 className="font-bold text-forest-dark mb-4 flex items-center gap-2 text-base">
              <User className="w-5 h-5 text-forest" />
              ข้อมูลลูกค้า & การจัดส่ง
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-400 mb-1">ชื่อลูกค้า</p>
                <div className="flex items-center gap-2.5">
                  {order.profiles?.avatar_url ? (
                    <img src={order.profiles.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-mint-100 text-forest font-bold flex items-center justify-center text-sm">
                      {customerName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800 text-base">{customerName}</p>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700">
                        🏷️ {order.profiles?.customer_type || 'ทั่วไป'}
                      </span>
                    </div>
                    {customerPhone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-forest" />
                        {customerPhone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-400 mb-1">
                  {isEquipment ? 'รายละเอียดการจัดส่ง' : 'หมายเหตุออเดอร์'}
                </p>
                {cleanOrderNotes(order.notes) ? (
                  <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                    {cleanOrderNotes(order.notes)}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 italic">ไม่มีหมายเหตุเพิ่มเติม</p>
                )}
              </div>
            </div>
          </div>

          {/* Action & Upload Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Update Status */}
            <div className="card">
              <h2 className="font-semibold text-forest-dark mb-4">อัปเดตสถานะ</h2>
              {order?.status === 'waiting_cycle' ? (
                /* ล็อค — ต้องยืนยันสร้างรอบปลูกก่อน */
                <div className="flex flex-col items-center text-center py-4 gap-3">
                  <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-700 mb-1">
                      ต้องยืนยันสร้างรอบปลูกก่อน
                    </p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      ออเดอร์นี้ยังไม่มีรอบปลูก<br />กรุณาไปที่หน้าตารางรอบปลูก<br />แล้วกด "ยืนยันสร้างรอบปลูก" ก่อน
                    </p>
                  </div>
                  <Link
                    to="/farmer/schedule"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-all shadow-sm"
                  >
                    <Calendar className="w-4 h-4" />
                    ไปหน้าตารางรอบปลูก
                  </Link>
                </div>
              ) : nextStatus ? (
                <div>
                  <p className="text-sm text-gray-500 mb-4">
                    สถานะถัดไป: <strong className="text-forest font-bold">{labels[nextStatus]}</strong>
                  </p>
                  <button
                    id="btn-update-status"
                    onClick={handleStatusUpdate}
                    disabled={updating}
                    className="btn-primary w-full"
                  >
                    {updating ? (
                      <><div className="spinner w-4 h-4" /> กำลังอัปเดต...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> เปลี่ยนเป็น "{labels[nextStatus]}"</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
                  <p className="text-sm font-semibold text-gray-700">
                    {isEquipment ? 'ออเดอร์จัดส่งเรียบร้อยแล้ว' : 'ออเดอร์เสร็จสิ้นแล้ว'}
                  </p>
                </div>
              )}
            </div>

            {/* Upload Photo */}
            <div className="card">
              <h2 className="font-semibold text-forest-dark mb-4">
                {isEquipment ? 'อัปโหลดรูปภาพสินค้า / หลักฐาน' : 'อัปโหลดรูปภาพการปลูก'}
              </h2>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="คำอธิบายรูปภาพ (ไม่บังคับ)"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  className="input text-sm"
                  id="input-photo-caption"
                />
                <label className={`w-full flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed
                  rounded-xl cursor-pointer transition-all
                  ${uploading ? 'opacity-50 cursor-not-allowed border-gray-200' : 'border-primary-200 hover:border-forest hover:bg-primary-50'}`}>
                  {uploading ? (
                    <div className="spinner w-8 h-8" />
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-primary-300" />
                      <span className="text-sm text-gray-500 font-medium">คลิกเพื่อเลือกรูปภาพจากเครื่อง</span>
                      <span className="text-xs text-gray-400">PNG, JPG, WebP</span>
                    </>
                  )}
                  <input
                    id="input-photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Order Items & Discount Management */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-forest-dark flex items-center gap-2">
                  <Tag className="w-4 h-4 text-forest" />
                  รายการสินค้า & การกำหนดส่วนลด
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  ท่านสามารถกำหนดส่วนลดแบบเปอร์เซ็นต์แยกตามแต่ละรายการสินค้าได้อิสระ
                </p>
              </div>
              {discountLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLogs(!showLogs)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors font-medium"
                >
                  <History className="w-3.5 h-3.5 text-forest" />
                  ประวัติส่วนลด ({discountLogs.length})
                  {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Logs Drawer/Accordion */}
            {showLogs && discountLogs.length > 0 && (
              <div className="mb-4 p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
                <p className="font-bold text-gray-700 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-forest" />
                  ประวัติการปรับส่วนลด
                </p>
                <div className="divide-y divide-gray-200">
                  {discountLogs.map(log => {
                    const itemMatch = order.order_items?.find(it => it.id === log.order_item_id)
                    const itemName = itemMatch?.vegetable_types?.name || 'รายการสินค้า'
                    return (
                      <div key={log.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <span className="font-semibold text-gray-800">{itemName}: </span>
                          <span className="text-gray-500">{log.old_rate}% → </span>
                          <strong className="text-forest font-bold">{log.new_rate}%</strong>
                          {log.note && <span className="text-gray-500 italic ml-2">({log.note})</span>}
                        </div>
                        <div className="text-gray-400 text-[11px]">
                          โดย {log.profiles?.full_name || 'ผู้ดูแลระบบ'} ({formatDateTh(log.created_at, 'd MMM yyyy HH:mm')})
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {order.order_items?.map(item => {
                const itemTotal = Number(item.quantity) * Number(item.price_at_order)
                const itemRate = Number(item.discount_rate) || 0
                const itemDiscountAmount = item.discount_amount != null
                  ? Number(item.discount_amount)
                  : Math.round(itemTotal * (itemRate / 100) * 100) / 100
                const itemFinalPrice = item.final_price != null
                  ? Number(item.final_price)
                  : itemTotal - itemDiscountAmount

                const isEditing = activeEditItemId === item.id
                const currentInput = discountInputs[item.id] || { rate: itemRate, note: '' }
                const inputRate = Math.max(0, Math.min(100, Number(currentInput.rate) || 0))
                const previewDisc = Math.round(itemTotal * (inputRate / 100) * 100) / 100
                const previewFinal = Math.round((itemTotal - previewDisc) * 100) / 100

                return (
                  <div key={item.id} className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-100 shadow-2xs">
                          {item.vegetable_types?.image_url ? (
                            <img src={item.vegetable_types.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Leaf className="w-5 h-5 text-gray-300" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-800 text-sm">{item.vegetable_types?.name}</p>
                            {item.vegetable_types?.category === 'equipment' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">อุปกรณ์</span>
                            )}
                            {itemRate > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                                ส่วนลด {itemRate}% (-฿{itemDiscountAmount.toLocaleString()})
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            จำนวน {item.quantity} {item.vegetable_types?.unit || item.unit} × ฿{Number(item.price_at_order).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                        <div className="text-right">
                          {itemRate > 0 ? (
                            <div>
                              <span className="text-xs text-gray-400 line-through mr-1.5">
                                ฿{itemTotal.toLocaleString()}
                              </span>
                              <span className="font-bold text-forest text-sm">
                                ฿{itemFinalPrice.toLocaleString()}
                              </span>
                            </div>
                          ) : (
                            <p className="font-bold text-gray-800 text-sm">
                              ฿{itemTotal.toLocaleString()}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveEditItemId(isEditing ? null : item.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all
                            ${isEditing
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-white border border-gray-200 text-forest hover:bg-forest hover:text-white shadow-2xs'}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          {isEditing ? 'ปิด' : itemRate > 0 ? 'แก้ส่วนลด' : 'ให้ส่วนลด'}
                        </button>
                      </div>
                    </div>

                    {/* Inline Discount Editor */}
                    {isEditing && (
                      <div className="mt-3 pt-3 border-t border-gray-200/80 bg-white p-3 rounded-lg border shadow-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                            <Percent className="w-3.5 h-3.5 text-forest" />
                            ปรับส่วนลดสำหรับ: {item.vegetable_types?.name}
                          </span>
                          <span className="text-xs text-gray-400">ราคาปกติ ฿{itemTotal.toLocaleString()}</span>
                        </div>

                        {/* Presets */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-gray-400 mr-1">ทางลัด:</span>
                          {[0, 5, 10, 15, 20, 25, 30].map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                setDiscountInputs(prev => ({
                                  ...prev,
                                  [item.id]: { ...(prev[item.id] || {}), rate: p }
                                }))
                              }}
                              className={`text-[11px] px-2 py-0.5 rounded-md font-semibold transition-colors
                                ${inputRate === p
                                  ? 'bg-forest text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                              {p === 0 ? '0% (ราคาเต็ม)' : `${p}%`}
                            </button>
                          ))}
                        </div>

                        {/* Input Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
                              เปอร์เซ็นต์ส่วนลด (%)
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={currentInput.rate}
                                onChange={e => {
                                  const val = e.target.value
                                  setDiscountInputs(prev => ({
                                    ...prev,
                                    [item.id]: { ...(prev[item.id] || {}), rate: val }
                                  }))
                                }}
                                className="input text-sm py-1.5 px-3 pr-7 w-full font-bold"
                                placeholder="0"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">%</span>
                            </div>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
                              หมายเหตุส่วนลด (เช่น ลูกค้าประจำ, สั่งยกลัง)
                            </label>
                            <input
                              type="text"
                              value={currentInput.note}
                              onChange={e => {
                                const val = e.target.value
                                setDiscountInputs(prev => ({
                                  ...prev,
                                  [item.id]: { ...(prev[item.id] || {}), note: val }
                                }))
                              }}
                              className="input text-sm py-1.5 px-3 w-full"
                              placeholder="ระบุเหตุผล (ไม่บังคับ)"
                            />
                          </div>
                        </div>

                        {/* Live calculation banner & Save Button */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-100">
                          <div className="text-xs text-emerald-900">
                            <span>ลด <strong>{inputRate}%</strong> (-฿{previewDisc.toLocaleString()})</span>
                            <span className="mx-2">→</span>
                            <span>ราคาหลังลด: <strong className="text-forest text-sm">฿{previewFinal.toLocaleString()}</strong></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveEditItemId(null)}
                              className="px-3 py-1 text-xs rounded-lg text-gray-500 hover:bg-gray-100"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveDiscount(item.id)}
                              disabled={savingDiscount[item.id]}
                              className="btn-primary text-xs py-1.5 px-4"
                            >
                              {savingDiscount[item.id] ? (
                                <><div className="spinner w-3 h-3" /> กำลังบันทึก...</>
                              ) : (
                                '✓ บันทึกส่วนลดรายการนี้'
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Summary calculation */}
            {(() => {
              const origTotal = order.order_items?.reduce((sum, it) => sum + (Number(it.quantity) * Number(it.price_at_order)), 0) || Number(order.total_amount)
              const totalDiscount = order.order_items?.reduce((sum, it) => {
                const itemRate = Number(it.discount_rate) || 0
                const itOrig = Number(it.quantity) * Number(it.price_at_order)
                const itDisc = it.discount_amount != null
                  ? Number(it.discount_amount)
                  : Math.round(itOrig * (itemRate / 100) * 100) / 100
                return sum + itDisc
              }, 0) || 0
              const calcFinal = Math.max(0, origTotal - totalDiscount)
              const displayedFinal = (order.status !== 'pending' && order.final_amount != null)
                ? Number(order.final_amount)
                : calcFinal

              return (
                <div className="border-t border-gray-100 mt-5 pt-4 space-y-2">
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>ยอดรวมราคาเต็ม</span>
                    <span>฿{origTotal.toLocaleString()}</span>
                  </div>

                  {totalDiscount > 0 && (
                    <div className="flex justify-between items-center text-sm text-emerald-700 font-medium">
                      <span>รวมส่วนลดทั้งหมด</span>
                      <span>-฿{totalDiscount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-base text-gray-800">ยอดชำระสุทธิ (Final Amount)</span>
                      {order.status === 'pending' && (
                        <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          สถานะ "รอดำเนินการ": ลูกค้าจะยังเห็นราคาเต็ม ฿{origTotal.toLocaleString()} จนกว่าท่านจะกดยืนยันออเดอร์
                        </p>
                      )}
                      {order.status !== 'pending' && totalDiscount > 0 && (
                        <p className="text-[11px] text-forest flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          ยืนยันแล้ว: ลูกค้าเห็นราคาสุทธิหลังส่วนลดเรียบร้อยแล้ว
                        </p>
                      )}
                    </div>
                    <span className="font-bold text-xl text-forest">
                      ฿{displayedFinal.toLocaleString()}
                    </span>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Growth Photos */}
          {growthPhotos.length > 0 && (
            <div className="card mt-6">
              <h2 className="font-semibold text-forest-dark mb-4">รูปภาพที่อัปโหลดแล้ว ({growthPhotos.length})</h2>
              <div className="grid grid-cols-3 gap-3">
                {growthPhotos.map(photo => (
                  <div key={photo.id} className="rounded-xl overflow-hidden aspect-square border border-gray-100">
                    <img src={photo.photo_url} alt={photo.caption} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
