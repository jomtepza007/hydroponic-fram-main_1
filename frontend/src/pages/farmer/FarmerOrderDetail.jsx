import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Camera, Upload, CheckCircle2, User, Phone, MapPin,
  Truck, Package, Leaf, Calendar
} from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import StatusTimeline from '../../components/orders/StatusTimeline'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getOrderById, updateOrderStatus, addPlantingUpdate } from '../../api/orders'
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

  useEffect(() => {
    loadOrder()
  }, [id])

  async function loadOrder() {
    try {
      const data = await getOrderById(id)
      setOrder(data)
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
                    <p className="font-semibold text-gray-800 text-base">{customerName}</p>
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
                {order.notes ? (
                  <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                    {order.notes}
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
              {nextStatus ? (
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

          {/* Order Items Table */}
          <div className="card mb-6">
            <h2 className="font-semibold text-forest-dark mb-4">รายการสินค้าในออเดอร์</h2>
            <div className="space-y-3">
              {order.order_items?.map(item => (
                <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                  <div className="w-12 h-12 bg-white rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-100">
                    {item.vegetable_types?.image_url ? (
                      <img src={item.vegetable_types.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Leaf className="w-5 h-5 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800 text-sm">{item.vegetable_types?.name}</p>
                      {item.vegetable_types?.category === 'equipment' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">อุปกรณ์</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      จำนวน {item.quantity} {item.vegetable_types?.unit || item.unit} × ฿{Number(item.price_at_order).toLocaleString()}
                    </p>
                  </div>
                  <p className="font-bold text-forest text-sm">
                    ฿{(item.quantity * item.price_at_order).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 mt-4 pt-3 flex justify-between items-center text-sm">
              <span className="text-gray-500 font-medium">ยอดรวมสุทธิ</span>
              <span className="font-bold text-lg text-forest">
                ฿{Number(order.total_amount).toLocaleString()}
              </span>
            </div>
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
