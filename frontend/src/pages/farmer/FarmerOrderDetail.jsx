import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Camera, CheckCircle2, User, Phone,
  Leaf, Calendar, Percent, Tag, History, Edit3,
  ChevronDown, ChevronUp, AlertCircle, X, XCircle, AlertTriangle,
  Coins, Lock, Mail, Trash2, Maximize2, Eye
} from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import StatusTimeline from '../../components/orders/StatusTimeline'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import {
  getOrderById,
  updateOrderStatus,
  addPlantingUpdate,
  deleteOrderPhoto,
  applyOrderItemDiscount,
  applyOrderDiscount,
  getOrderDiscountLogs
} from '../../api/orders'

import { getCustomerTypeConfig } from '../../utils/customerTypeUtils'
import { notifyPlantingPhoto } from '../../api/notifications'
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
import { extractPhotosFromOrder, appendPhotoToOrderNotes, removePhotoFromOrderNotes, cleanOrderNotes } from '../../utils/orderPhotoUtils'
import toast from 'react-hot-toast'

export default function FarmerOrderDetail() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  const [updating, setUpdating] = useState(false)

  // จัดการรูปภาพ (Confirmation ก่อนส่ง, ลบรูป, Lightbox)
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null)
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState(null)
  const [confirmModalCaption, setConfirmModalCaption] = useState('')
  const [showUploadConfirmModal, setShowUploadConfirmModal] = useState(false)
  const [photoToDelete, setPhotoToDelete] = useState(null)
  const [showDeletePhotoModal, setShowDeletePhotoModal] = useState(false)
  const [deletingPhoto, setDeletingPhoto] = useState(false)
  const [viewingPhoto, setViewingPhoto] = useState(null)

  // ยกเลิกคำสั่งซื้อโดยเกษตรกร
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)


  // ส่วนลดต่อรายการ (Discount states)
  const [discountInputs, setDiscountInputs] = useState({})
  const [activeEditItemId, setActiveEditItemId] = useState(null)
  const [savingDiscount, setSavingDiscount] = useState({})
  const [discountLogs, setDiscountLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)

  // ส่วนลดทั้งออเดอร์ (Whole-Order Discount states)
  const [orderDiscountType, setOrderDiscountType] = useState('amount') // 'amount' | 'percent'
  const [orderDiscountValue, setOrderDiscountValue] = useState('')
  const [orderDiscountNote, setOrderDiscountNote] = useState('')
  const [isEditingOrderDiscount, setIsEditingOrderDiscount] = useState(false)
  const [savingOrderDiscount, setSavingOrderDiscount] = useState(false)

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

      // กำหนดค่าเริ่มต้นให้กับส่วนลดทั้งออเดอร์
      if (data) {
        setOrderDiscountType(data.order_discount_type || 'amount')
        setOrderDiscountValue(data.order_discount_value != null && Number(data.order_discount_value) > 0 ? Number(data.order_discount_value) : '')
        setOrderDiscountNote(data.order_discount_note || '')
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
      await updateOrderStatus(id, nextStatus, '', isEquipment)

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
            const updatePayload = { status: cycleStatus }
            if (cycleStatus === 'done' || nextStatus === 'ready' || nextStatus === 'completed') {
              updatePayload.actual_harvest_date = new Date().toISOString().split('T')[0]
            }
            await supabase
              .from('planting_cycles')
              .update(updatePayload)
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

  // เกษตรกรกดยกเลิกออเดอร์
  async function handleFarmerCancelOrder() {
    if (!order?.id) return
    setCancelling(true)
    const reasonText = cancelReason.trim() || 'ฟาร์มขอยกเลิกคำสั่งซื้อเนื่องจากมีเหตุขัดข้อง'
    const noteEntry = `[ฟาร์มยกเลิกคำสั่งซื้อ: ${reasonText} (${formatDateTh(new Date())})]`
    const updatedNotes = order.notes ? `${order.notes}\n${noteEntry}` : noteEntry

    try {
      // 1. อัปเดตสถานะ order เป็น cancelled
      await updateOrderStatus(order.id, 'cancelled', updatedNotes, isEquipment)

      // 2. ถ้าเป็นผัก ให้ยกเลิกรอบปลูก (planting_cycles) ที่เกี่ยวข้อง
      if (!isEquipment) {
        const cycleIds = order.order_items
          ?.flatMap(item => item.planting_cycles?.map(c => c.id) || [])
          .filter(Boolean)
        if (cycleIds.length > 0) {
          await supabase
            .from('planting_cycles')
            .update({ status: 'cancelled' })
            .in('id', cycleIds)
        }
      }

      // 3. ส่งการแจ้งเตือนพิเศษไปยังลูกค้าพร้อมระบุเหตุผล
      if (order.customer_id) {
        try {
          const shortId = order.id.slice(0, 8).toUpperCase()
          await supabase.from('notifications').insert([{
            user_id: order.customer_id,
            title: `❌ ออเดอร์ #${shortId} ถูกยกเลิกโดยฟาร์ม`,
            message: `ทางฟาร์มมีความจำเป็นต้องยกเลิกออเดอร์ เนื่องจาก: "${reasonText}" ขออภัยในความไม่สะดวก`,
            type: 'order_status',
            related_id: order.id,
            is_read: false,
          }])
        } catch (notifErr) {
          console.warn('Customer cancel notification error:', notifErr)
        }
      }

      toast.success('ยกเลิกคำสั่งซื้อเรียบร้อยแล้ว')
      setShowCancelModal(false)
      await loadOrder()
    } catch (err) {
      console.error(err)
      toast.error('เกิดข้อผิดพลาดในการยกเลิกคำสั่งซื้อ')
    } finally {
      setCancelling(false)
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

  async function handleSaveOrderDiscount() {
    if (!order?.id) return
    const val = Math.max(0, Number(orderDiscountValue) || 0)
    setSavingOrderDiscount(true)
    try {
      await applyOrderDiscount(order.id, {
        discountType: val > 0 ? orderDiscountType : null,
        discountValue: val,
        note: orderDiscountNote,
        changedBy: user?.id,
      })
      toast.success(
        val > 0
          ? `บันทึกส่วนลดทั้งออเดอร์ ${orderDiscountType === 'percent' ? `${val}%` : `฿${val.toLocaleString()}`} สำเร็จ 🏷️`
          : 'ล้างส่วนลดทั้งออเดอร์เรียบร้อยแล้ว'
      )
      setIsEditingOrderDiscount(false)
      await loadOrder()
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'เกิดข้อผิดพลาดในการบันทึกส่วนลดทั้งออเดอร์')
    } finally {
      setSavingOrderDiscount(false)
    }
  }

  // เมื่อเลือกไฟล์รูปภาพ — แสดง modal ยืนยันก่อนส่งรูปเสมอ
  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น (PNG, JPG, WebP)')
      if (e.target) e.target.value = ''
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('ขนาดไฟล์ใหญ่เกินไป (ไม่เกิน 20 MB)')
      if (e.target) e.target.value = ''
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setSelectedPhotoFile(file)
    setSelectedPhotoPreview(previewUrl)
    setConfirmModalCaption(caption || '')
    setShowUploadConfirmModal(true)
    if (e.target) e.target.value = ''
  }

  function handleCancelUploadModal() {
    if (uploading) return
    if (selectedPhotoPreview) {
      URL.revokeObjectURL(selectedPhotoPreview)
    }
    setSelectedPhotoFile(null)
    setSelectedPhotoPreview(null)
    setShowUploadConfirmModal(false)
  }

  // กดยืนยันส่งรูปภาพให้ลูกค้าใน Modal
  async function handleConfirmUploadPhoto() {
    if (!selectedPhotoFile || !order?.id) return
    setUploading(true)

    try {
      const file = selectedPhotoFile
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

      const finalCaption = confirmModalCaption.trim() || caption.trim() || `อัปเดตสถานะ: ${labels[order.status] || order.status} (${formatDateTh(new Date())})`
      const photoObj = {
        id: `p_${Date.now()}`,
        photo_url: photoUrl,
        caption: finalCaption,
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
            caption: finalCaption,
            updated_by: user?.id || null,
          })
        }
      } catch (cycleErr) {
        console.warn('Relational planting_update save note:', cycleErr)
      }

      // 5. ส่งการแจ้งเตือนไปยังลูกค้าเมื่อมีรูปภาพการปลูกใหม่
      try {
        if (order?.customer_id) {
          await notifyPlantingPhoto(order.id, order.customer_id, finalCaption)
        }
      } catch (notifErr) {
        console.warn('Could not send planting photo notification:', notifErr)
      }

      toast.success('ส่งรูปภาพให้ลูกค้าเรียบร้อยแล้ว 📸')
      setCaption('')
      setConfirmModalCaption('')
      if (selectedPhotoPreview) URL.revokeObjectURL(selectedPhotoPreview)
      setSelectedPhotoFile(null)
      setSelectedPhotoPreview(null)
      setShowUploadConfirmModal(false)
      await loadOrder()
    } catch (err) {
      toast.error('อัปโหลดล้มเหลว กรุณาลองใหม่อีกครั้ง')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  // ยืนยันลบรูปภาพ (Admin / Farmer)
  async function handleConfirmDeletePhoto() {
    if (!photoToDelete || !order?.id) return
    setDeletingPhoto(true)

    try {
      await deleteOrderPhoto(order, photoToDelete)
      toast.success('ลบรูปภาพเรียบร้อยแล้ว 🗑️')
      setShowDeletePhotoModal(false)
      if (viewingPhoto && (viewingPhoto.id === photoToDelete.id || viewingPhoto.photo_url === photoToDelete.photo_url)) {
        setViewingPhoto(null)
      }
      setPhotoToDelete(null)
      await loadOrder()
    } catch (err) {
      console.error('Delete photo error:', err)
      toast.error('เกิดข้อผิดพลาดในการลบรูปภาพ')
    } finally {
      setDeletingPhoto(false)
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
              {(() => {
                const typeCfg = getCustomerTypeConfig(order.profiles?.customer_type)
                const TypeIcon = typeCfg.icon
                return (
                  <div className={`rounded-xl border ${typeCfg.cardBorder} ${typeCfg.cardBg} overflow-hidden shadow-xs transition-all`}>
                    {/* หัวกรอบที่เป็นสีตามแท็กที่กำกับ พร้อมสัญลักษณ์ที่ชัดเจนและเด่นชัด */}
                    <div className={`px-3.5 py-1.5 flex items-center justify-between text-xs font-bold ${typeCfg.headerBg} shadow-2xs`}>
                      <div className="flex items-center gap-1.5">
                        <TypeIcon className="w-3.5 h-3.5" />
                        <span>ประเภทลูกค้า: {typeCfg.title}</span>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold backdrop-blur-xs flex items-center gap-1">
                        <span>{typeCfg.emoji}</span>
                        <span>{typeCfg.label}</span>
                      </span>
                    </div>

                    {/* ข้อมูลลูกค้าด้านใน */}
                    <div className="p-3.5">
                      <p className="text-xs text-gray-400 mb-1.5 font-medium">ชื่อลูกค้า</p>
                      <div className="flex items-center gap-3">
                        {order.profiles?.avatar_url ? (
                          <img
                            src={order.profiles.avatar_url}
                            alt=""
                            className={`w-11 h-11 rounded-full object-cover ${typeCfg.avatarRing}`}
                          />
                        ) : (
                          <div className={`w-11 h-11 rounded-full ${typeCfg.avatarRing} font-bold flex items-center justify-center text-base shadow-2xs`}>
                            {customerName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-800 text-base truncate">{customerName}</p>
                            <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${typeCfg.badgeClass}`}>
                              <span>{typeCfg.emoji}</span>
                              <span>{typeCfg.label}</span>
                            </span>
                          </div>
                          {customerPhone && (
                            <p className="text-xs text-gray-600 flex items-center gap-1 mt-1 font-medium">
                              <Phone className="w-3 h-3 text-forest" />
                              <span>{customerPhone}</span>
                            </p>
                          )}
                          {order.profiles?.email && (
                            <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                              <Mail className="w-3 h-3 text-gray-400" />
                              <span>{order.profiles.email}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

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

          {/* Order Items & Discount Management */}
          {(() => {
            const isDiscountEditable = ['waiting_cycle', 'pending', 'scheduling'].includes(order.status)
            return (
              <div className="card mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-forest-dark flex items-center gap-2">
                        <Tag className="w-4 h-4 text-forest" />
                        รายการสินค้า & การกำหนดส่วนลด
                      </h2>
                      {isDiscountEditable ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          แก้ไขส่วนลดได้ (ก่อนยืนยัน)
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-600 border border-gray-200 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> ล็อกแล้ว
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {isDiscountEditable
                        ? 'ท่านสามารถปรับส่วนลดต่อรายการ หรือกำหนดส่วนลดรวมทั้งออเดอร์ได้อิสระ ก่อนกดยืนยันออเดอร์'
                        : 'ออเดอร์นี้ยืนยันแล้ว ส่วนลดถูกล็อกเพื่อรักษาความถูกต้องของยอดชำระที่ลูกค้าเห็น'}
                    </p>
                  </div>
                  {discountLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowLogs(!showLogs)}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors font-medium self-start sm:self-auto"
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
                        const isOrderLevel = !log.order_item_id || log.discount_type?.startsWith('order_')
                        const itemMatch = order.order_items?.find(it => it.id === log.order_item_id)
                        const itemName = isOrderLevel ? '🏷️ ส่วนลดทั้งออเดอร์' : (itemMatch?.vegetable_types?.name || 'รายการสินค้า')
                        return (
                          <div key={log.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div>
                              <span className="font-semibold text-gray-800">{itemName}: </span>
                              {isOrderLevel ? (
                                <strong className="text-forest font-bold">
                                  {log.discount_type === 'order_percent'
                                    ? `ลด ${log.discount_value}% (-฿${Number(log.discount_amount || 0).toLocaleString()})`
                                    : log.discount_type === 'order_clear'
                                    ? 'ล้างส่วนลด'
                                    : `ลด ฿${Number(log.discount_amount || 0).toLocaleString()}`
                                  }
                                </strong>
                              ) : (
                                <>
                                  <span className="text-gray-500">{log.old_rate}% → </span>
                                  <strong className="text-forest font-bold">{log.new_rate}%</strong>
                                </>
                              )}
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

                        {isDiscountEditable ? (
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
                        ) : itemRate > 0 ? (
                          <span className="text-xs text-gray-400 flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg">
                            <Lock className="w-3 h-3 text-gray-400" /> ล็อกแล้ว
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Inline Discount Editor */}
                    {isEditing && isDiscountEditable && (
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

            {/* ส่วนลดทั้งออเดอร์ (Whole-Order Discount Section) */}
            {(() => {
              const currentOrderDiscType = order.order_discount_type || 'amount'
              const currentOrderDiscVal = Number(order.order_discount_value) || 0
              const currentOrderDiscAmt = Number(order.order_discount_amount) || 0
              const hasOrderDiscount = currentOrderDiscAmt > 0

              const itemsSubtotal = order.order_items?.reduce((sum, it) => {
                const itOrig = Number(it.quantity) * Number(it.price_at_order)
                const itRate = Number(it.discount_rate) || 0
                const itDisc = it.discount_amount != null
                  ? Number(it.discount_amount)
                  : Math.round(itOrig * (itRate / 100) * 100) / 100
                return sum + (itOrig - itDisc)
              }, 0) || Number(order.total_amount)

              const previewVal = Math.max(0, Number(orderDiscountValue) || 0)
              let previewOrderDiscAmt = 0
              if (orderDiscountType === 'percent') {
                const cappedPercent = Math.min(100, previewVal)
                previewOrderDiscAmt = Math.round(itemsSubtotal * (cappedPercent / 100) * 100) / 100
              } else {
                previewOrderDiscAmt = Math.min(itemsSubtotal, previewVal)
              }
              const previewFinalAfterOrderDisc = Math.max(0, Math.round((itemsSubtotal - previewOrderDiscAmt) * 100) / 100)

              return (
                <div className="mt-4 p-4 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 via-white to-primary-50/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-forest text-white flex items-center justify-center shadow-xs flex-shrink-0">
                        <Coins className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-gray-800 text-sm">ส่วนลดทั้งออเดอร์ (Whole Order Discount)</h4>
                          {hasOrderDiscount && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {currentOrderDiscType === 'percent' ? `ลด ${currentOrderDiscVal}%` : `ลด ฿${currentOrderDiscVal.toLocaleString()}`} (-฿{currentOrderDiscAmt.toLocaleString()})
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {hasOrderDiscount
                            ? (order.order_discount_note ? `หมายเหตุ: ${order.order_discount_note}` : 'ส่วนลดพิเศษที่หักจากยอดรวมทั้งออเดอร์')
                            : 'กำหนดส่วนลดราคาทั้งออเดอร์เพิ่มเติม (รองรับทั้งแบบบาท และ %)'}
                        </p>
                      </div>
                    </div>

                    {isDiscountEditable ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!isEditingOrderDiscount) {
                            setOrderDiscountType(order.order_discount_type || 'amount')
                            setOrderDiscountValue(order.order_discount_value != null && Number(order.order_discount_value) > 0 ? Number(order.order_discount_value) : '')
                            setOrderDiscountNote(order.order_discount_note || '')
                          }
                          setIsEditingOrderDiscount(!isEditingOrderDiscount)
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all self-start sm:self-auto
                          ${isEditingOrderDiscount
                            ? 'bg-gray-200 text-gray-700'
                            : 'bg-forest text-white hover:bg-forest-dark shadow-sm'}`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        {isEditingOrderDiscount ? 'ปิดหน้าต่าง' : hasOrderDiscount ? 'แก้ไขส่วนลดทั้งออเดอร์' : '+ ใส่ส่วนลดทั้งออเดอร์'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 flex items-center gap-1 bg-gray-100 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                        <Lock className="w-3.5 h-3.5 text-gray-400" /> ยืนยันแล้ว (ล็อกส่วนลด)
                      </span>
                    )}
                  </div>

                  {/* Editor Box */}
                  {isEditingOrderDiscount && isDiscountEditable && (
                    <div className="mt-4 pt-3.5 border-t border-emerald-200/80 bg-white p-3.5 rounded-xl border shadow-xs space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                          <Percent className="w-3.5 h-3.5 text-forest" />
                          กำหนดส่วนลดราคาทั้งออเดอร์
                        </span>
                        <span className="text-xs text-gray-400">
                          ยอดสินค้าหลังลดรายการ: <strong>฿{itemsSubtotal.toLocaleString()}</strong>
                        </span>
                      </div>

                      {/* Toggle Type: บาท vs เปอร์เซ็นต์ */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium">ประเภทส่วนลด:</span>
                        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                          <button
                            type="button"
                            onClick={() => setOrderDiscountType('amount')}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                              orderDiscountType === 'amount'
                                ? 'bg-forest text-white shadow-2xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            ฿ จำนวนเงิน (บาท)
                          </button>
                          <button
                            type="button"
                            onClick={() => setOrderDiscountType('percent')}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                              orderDiscountType === 'percent'
                                ? 'bg-forest text-white shadow-2xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            % เปอร์เซ็นต์
                          </button>
                        </div>
                      </div>

                      {/* Quick Shortcuts */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-gray-400 mr-1">ทางลัด:</span>
                        {orderDiscountType === 'percent' ? (
                          [0, 5, 10, 15, 20, 25, 30].map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setOrderDiscountValue(p === 0 ? '' : p)}
                              className={`text-[11px] px-2.5 py-0.5 rounded-md font-semibold transition-colors ${
                                previewVal === p
                                  ? 'bg-forest text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {p === 0 ? '0% (ล้างส่วนลด)' : `${p}%`}
                            </button>
                          ))
                        ) : (
                          [0, 50, 100, 200, 300, 500].map(amt => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setOrderDiscountValue(amt === 0 ? '' : amt)}
                              className={`text-[11px] px-2.5 py-0.5 rounded-md font-semibold transition-colors ${
                                previewVal === amt
                                  ? 'bg-forest text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {amt === 0 ? '0 ฿ (ล้างส่วนลด)' : `฿${amt}`}
                            </button>
                          ))
                        )}
                      </div>

                      {/* Inputs Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                            {orderDiscountType === 'percent' ? 'เปอร์เซ็นต์ส่วนลด (%)' : 'จำนวนเงินส่วนลด (บาท)'}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max={orderDiscountType === 'percent' ? 100 : itemsSubtotal}
                              step={orderDiscountType === 'percent' ? 1 : 10}
                              value={orderDiscountValue}
                              onChange={e => setOrderDiscountValue(e.target.value)}
                              className="input text-sm py-1.5 px-3 pr-8 w-full font-bold"
                              placeholder="0"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">
                              {orderDiscountType === 'percent' ? '%' : '฿'}
                            </span>
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                            หมายเหตุส่วนลดทั้งออเดอร์ (เช่น ลูกค้า VIP, อุดหนุนยกแปลง)
                          </label>
                          <input
                            type="text"
                            value={orderDiscountNote}
                            onChange={e => setOrderDiscountNote(e.target.value)}
                            className="input text-sm py-1.5 px-3 w-full"
                            placeholder="ระบุเหตุผลในการให้ส่วนลดทั้งออเดอร์ (ไม่บังคับ)"
                          />
                        </div>
                      </div>

                      {/* Live Preview Box */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 bg-emerald-50/70 p-3 rounded-lg border border-emerald-100">
                        <div className="text-xs text-emerald-950 space-y-0.5">
                          <div>
                            <span>ยอดสินค้าหลังลดรายการ: <strong>฿{itemsSubtotal.toLocaleString()}</strong></span>
                            <span className="mx-2">−</span>
                            <span>ส่วนลดทั้งออเดอร์: <strong className="text-rose-600">
                              {orderDiscountType === 'percent' && previewVal > 0 ? `${previewVal}% ` : ''}(-฿{previewOrderDiscAmt.toLocaleString()})
                            </strong></span>
                          </div>
                          <div>
                            <span>ยอดชำระสุทธิใหม่: <strong className="text-forest text-sm font-bold">฿{previewFinalAfterOrderDisc.toLocaleString()}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsEditingOrderDiscount(false)}
                            className="px-3 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-gray-100"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveOrderDiscount}
                            disabled={savingOrderDiscount}
                            className="btn-primary text-xs py-1.5 px-4 shadow-sm"
                          >
                            {savingOrderDiscount ? (
                              <><div className="spinner w-3 h-3" /> กำลังบันทึก...</>
                            ) : (
                              '✓ บันทึกส่วนลดทั้งออเดอร์'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Summary calculation */}
            {(() => {
              const origTotal = order.order_items?.reduce((sum, it) => sum + (Number(it.quantity) * Number(it.price_at_order)), 0) || Number(order.total_amount)
              
              const totalItemDiscount = order.order_items?.reduce((sum, it) => {
                const itemRate = Number(it.discount_rate) || 0
                const itOrig = Number(it.quantity) * Number(it.price_at_order)
                const itDisc = it.discount_amount != null
                  ? Number(it.discount_amount)
                  : Math.round(itOrig * (itemRate / 100) * 100) / 100
                return sum + itDisc
              }, 0) || 0

              const itemsSubtotal = Math.max(0, origTotal - totalItemDiscount)

              const orderDiscountAmount = Number(order.order_discount_amount) || 0
              const orderDiscountType = order.order_discount_type
              const orderDiscountVal = Number(order.order_discount_value) || 0

              const totalAllDiscounts = totalItemDiscount + orderDiscountAmount
              const calcFinal = Math.max(0, itemsSubtotal - orderDiscountAmount)

              const displayedFinal = (order.status !== 'pending' && order.final_amount != null)
                ? Number(order.final_amount)
                : calcFinal

              return (
                <div className="border-t border-gray-100 mt-5 pt-4 space-y-2">
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>ยอดรวมราคาเต็ม (ก่อนหักส่วนลด)</span>
                    <span>฿{origTotal.toLocaleString()}</span>
                  </div>

                  {totalItemDiscount > 0 && (
                    <div className="flex justify-between items-center text-sm text-emerald-700 font-medium">
                      <span>ส่วนลดต่อรายการสินค้ารวม</span>
                      <span>-฿{totalItemDiscount.toLocaleString()}</span>
                    </div>
                  )}

                  {totalItemDiscount > 0 && orderDiscountAmount > 0 && (
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>ยอดรวมสินค้าหลังหักส่วนลดรายการ</span>
                      <span>฿{itemsSubtotal.toLocaleString()}</span>
                    </div>
                  )}

                  {orderDiscountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm text-emerald-700 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5" />
                        ส่วนลดทั้งออเดอร์
                        {orderDiscountType === 'percent' && ` (${orderDiscountVal}%)`}
                        {order.order_discount_note && (
                          <span className="text-xs text-gray-400 font-normal">[{order.order_discount_note}]</span>
                        )}
                      </span>
                      <span>-฿{orderDiscountAmount.toLocaleString()}</span>
                    </div>
                  )}

                  {totalAllDiscounts > 0 && (
                    <div className="flex justify-between items-center text-xs text-emerald-800 font-semibold pt-1 border-t border-dashed border-gray-200">
                      <span>รวมส่วนลดทั้งหมดที่ได้รับ</span>
                      <span>-฿{totalAllDiscounts.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-base text-gray-800">ยอดชำระสุทธิ (Final Amount)</span>
                      {order.status === 'pending' && (
                        <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          สถานะ "รอดำเนินการ": ลูกค้าจะยังเห็นราคาปกติ ฿{origTotal.toLocaleString()} จนกว่าท่านจะกดยืนยันออเดอร์ (เมื่อยืนยันแล้วระบบจะล็อกส่วนลด)
                        </p>
                      )}
                      {order.status !== 'pending' && totalAllDiscounts > 0 && (
                        <p className="text-[11px] text-forest flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          ยืนยันแล้ว: ลูกค้าเห็นราคาสุทธิหลังส่วนลดเรียบร้อยแล้ว (ระบบล็อกส่วนลดแล้ว)
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
        )
      })()}

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

                  {/* ปุ่มยกเลิกคำสั่งซื้อสำหรับเกษตรกร */}
                  <div className="pt-3 border-t border-gray-100 mt-4">
                    <button
                      type="button"
                      id="btn-farmer-cancel-order"
                      onClick={() => {
                        setCancelReason('')
                        setShowCancelModal(true)
                      }}
                      className="w-full py-2 px-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <XCircle className="w-4 h-4" />
                      ยกเลิกคำสั่งซื้อ (ผลผลิตเสียหาย/มีเหตุจำเป็น)
                    </button>
                  </div>
                </div>
              ) : order.status === 'cancelled' ? (
                <div className="text-center py-6 text-red-500">
                  <XCircle className="w-10 h-10 mx-auto mb-2 text-red-500" />
                  <p className="text-sm font-semibold text-red-700">ออเดอร์นี้ถูกยกเลิกแล้ว</p>
                  <p className="text-xs text-red-400 mt-1">ไม่สามารถดำเนินการต่อได้</p>
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-forest-dark flex items-center gap-2">
                  <Camera className="w-5 h-5 text-forest" />
                  {isEquipment ? 'อัปโหลดรูปภาพสินค้า / หลักฐาน' : 'อัปโหลดรูปภาพการปลูก'}
                </h2>
                <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  มีระบบยืนยันก่อนส่ง
                </span>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="คำอธิบายรูปภาพล่วงหน้า (ไม่บังคับ — ปรับแก้ในหน้าต่างยืนยันได้)"
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
                      <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-forest">
                        <Camera className="w-6 h-6 text-forest" />
                      </div>
                      <span className="text-sm text-gray-700 font-semibold">คลิกเพื่อเลือกรูปภาพจากเครื่อง</span>
                      <span className="text-xs text-gray-400">รองรับ PNG, JPG, WebP (สูงสุด 20 MB)</span>
                      <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50/80 px-2 py-0.5 rounded-md mt-1">
                        * รูปภาพจะยังไม่ถูกส่งทันที จะมีหน้าต่างให้ตรวจสอบและกดยืนยันก่อนเสมอ
                      </span>
                    </>
                  )}
                  <input
                    id="input-photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Growth Photos */}
          {growthPhotos.length > 0 && (
            <div className="card mt-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-forest flex items-center justify-center font-bold">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-forest-dark leading-tight">
                      รูปภาพที่ส่งให้ลูกค้าแล้ว ({growthPhotos.length})
                    </h2>
                    <p className="text-xs text-gray-400">
                      แสดงในหน้าติดตามสถานะของลูกค้า • แอดมินและผู้จัดการฟาร์มสามารถลบรูปได้ตลอดเวลา
                    </p>
                  </div>
                </div>
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-medium border border-emerald-100">
                  ลูกค้ามองเห็นแล้ว
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {growthPhotos.map((photo, idx) => (
                  <div
                    key={photo.id || idx}
                    className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
                  >
                    {/* Image Container with hover overlay */}
                    <div
                      className="relative aspect-4/3 w-full bg-gray-100 overflow-hidden cursor-pointer"
                      onClick={() => setViewingPhoto(photo)}
                      title="คลิกเพื่อดูรูปภาพขนาดเต็ม"
                    >
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || 'รูปภาพอัปเดต'}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {/* Gradient overlay on hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium bg-black/60 backdrop-blur-xs text-white px-2 py-0.5 rounded-full">
                            #{idx + 1}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-white bg-black/60 backdrop-blur-xs px-2 py-1 rounded-lg">
                            <Maximize2 className="w-3 h-3" /> ขยายรูป
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Photo Details & Delete action */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2 bg-white">
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                          <span>{formatDateTh(photo.created_at)}</span>
                          {photo.status && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">
                              {labels[photo.status] || photo.status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed" title={photo.caption}>
                          {photo.caption || <span className="text-gray-400 italic">ไม่มีคำอธิบาย</span>}
                        </p>
                      </div>

                      {/* Action buttons: View full & Delete photo */}
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingPhoto(photo)}
                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-forest transition-colors font-medium py-1 px-2 rounded-lg hover:bg-gray-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>ดูรูปเต็ม</span>
                        </button>
                        <button
                          type="button"
                          id={`btn-delete-photo-${idx}`}
                          onClick={() => {
                            setPhotoToDelete(photo)
                            setShowDeletePhotoModal(true)
                          }}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 font-medium py-1 px-2.5 rounded-lg border border-red-200 transition-all shadow-2xs"
                          title="ลบรูปภาพนี้ออกจากระบบ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบรูป</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Farmer Cancel Order Modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !cancelling && setShowCancelModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5 text-red-600">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">ยกเลิกคำสั่งซื้อ (โดยฟาร์ม)</h3>
                  <p className="text-xs text-gray-400">ออเดอร์ #{order.id.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setShowCancelModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              ระบุเหตุผลในการยกเลิกออเดอร์ ระบบจะยกเลิกการจองพื้นที่ปลูกและส่งข้อความแจ้งเตือนพร้อมเหตุผลนี้ให้ลูกค้าทราบทันที
            </p>

            {/* Quick Reason Chips */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 mb-2">
                เลือกเหตุผลที่พบบ่อย:
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  'ผลผลิตเสียหายจากสภาพอากาศ 🌧️',
                  'ปริมาณผลผลิตไม่เพียงพอต่อคำสั่งซื้อ 📉',
                  'ตรวจพบโรคหรือแมลงศัตรูพืชในแปลง 🐛',
                  'ระบบน้ำหรืออุปกรณ์ขัดข้อง ⚠️',
                  'ลูกค้าขอยกเลิกผ่านช่องทางอื่น 📞',
                ].map(reason => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setCancelReason(reason)}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-all text-left ${
                      cancelReason === reason
                        ? 'bg-red-50 border-red-300 text-red-700 font-semibold'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Reason Textarea */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                รายละเอียดเหตุผล (ส่งให้ลูกค้าอ่าน):
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="อธิบายเหตุผลในการยกเลิกคำสั่งซื้อ เช่น สภาพอากาศแปรปรวนทำให้ผักไม่โตตามเกณฑ์..."
                className="input text-sm w-full"
                disabled={cancelling}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setShowCancelModal(false)}
                className="btn-outline text-sm px-4 py-2"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                id="btn-confirm-farmer-cancel"
                disabled={cancelling}
                onClick={handleFarmerCancelOrder}
                className="btn-sm bg-red-600 hover:bg-red-700 text-white rounded-xl px-5 py-2.5 font-semibold flex items-center gap-2 shadow-sm transition-all"
              >
                {cancelling ? (
                  <>
                    <div className="spinner w-4 h-4 border-white" />
                    กำลังยกเลิก...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    ยืนยันยกเลิกออเดอร์
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Modal ยืนยันก่อนส่งรูปภาพให้ลูกค้า */}
      {showUploadConfirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !uploading && handleCancelUploadModal()}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-forest/10 text-forest flex items-center justify-center">
                  <Camera className="w-5 h-5 text-forest" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">ยืนยันการส่งรูปภาพให้กับลูกค้า</h3>
                  <p className="text-xs text-gray-400">
                    ออเดอร์ #{order.id.slice(0, 8).toUpperCase()} • {customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={handleCancelUploadModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo Preview Container */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                รูปภาพที่เลือก:
              </label>
              <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-900 flex items-center justify-center max-h-64 aspect-video sm:aspect-16/10">
                {selectedPhotoPreview && (
                  <img
                    src={selectedPhotoPreview}
                    alt="Preview"
                    className="max-h-64 w-full h-full object-contain"
                  />
                )}
                {selectedPhotoFile && (
                  <span className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-xs text-[11px] text-white font-mono">
                    {selectedPhotoFile.name} ({(selectedPhotoFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                )}
              </div>
            </div>

            {/* Caption Input */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                คำอธิบายรูปภาพ (ลูกค้าจะเห็นข้อความนี้):
              </label>
              <textarea
                rows={2}
                value={confirmModalCaption}
                onChange={e => setConfirmModalCaption(e.target.value)}
                placeholder={`เช่น อัปเดตสถานะ: ${labels[order.status] || order.status} (${formatDateTh(new Date())})`}
                className="input text-sm w-full"
                disabled={uploading}
              />
            </div>

            {/* Confirmation notice */}
            <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold">ยืนยันเพื่อส่งมอบข้อมูล:</span> เมื่อกดยืนยัน รูปภาพและคำอธิบายจะถูกส่งไปยังหน้าติดตามออเดอร์ของลูกค้า <span className="font-bold text-emerald-900">({customerName})</span> และระบบจะส่งการแจ้งเตือนทันที
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={uploading}
                onClick={handleCancelUploadModal}
                className="btn-outline text-sm px-4 py-2.5 rounded-xl text-gray-600 font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                id="btn-confirm-send-photo"
                disabled={uploading}
                onClick={handleConfirmUploadPhoto}
                className="px-5 py-2.5 rounded-xl bg-forest hover:bg-forest-dark text-white font-semibold text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <div className="spinner w-4 h-4 border-white" />
                    <span>กำลังอัปโหลดและส่งรูป...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>ยืนยันส่งรูปภาพ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal ยืนยันการลบรูปภาพ */}
      {showDeletePhotoModal && photoToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !deletingPhoto && setShowDeletePhotoModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5 text-red-600">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">ยืนยันการลบรูปภาพ</h3>
                  <p className="text-xs text-gray-400">ออเดอร์ #{order.id.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={deletingPhoto}
                onClick={() => setShowDeletePhotoModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thumbnail Preview */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 mb-4">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0 border border-gray-200">
                <img
                  src={photoToDelete.photo_url}
                  alt={photoToDelete.caption || 'รูปภาพ'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {photoToDelete.caption || 'ไม่มีคำอธิบาย'}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  วันที่: {formatDateTh(photoToDelete.created_at)}
                </p>
                {photoToDelete.status && (
                  <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-medium">
                    สถานะ: {labels[photoToDelete.status] || photoToDelete.status}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-5 text-xs text-red-700 leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">คำเตือน:</span> เมื่อลบแล้ว รูปภาพนี้จะถูกลบออกจากระบบและลูกค้าจะไม่สามารถมองเห็นรูปนี้ในหน้าติดตามสถานะได้อีกต่อไป
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={deletingPhoto}
                onClick={() => setShowDeletePhotoModal(false)}
                className="btn-outline text-sm px-4 py-2 rounded-xl text-gray-600 font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                id="btn-confirm-delete-photo"
                disabled={deletingPhoto}
                onClick={handleConfirmDeletePhoto}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                {deletingPhoto ? (
                  <>
                    <div className="spinner w-4 h-4 border-white" />
                    <span>กำลังลบ...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>ยืนยันลบรูปภาพ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Lightbox / Zoom Photo Modal */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setViewingPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="p-3.5 bg-gray-900 text-white flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 bg-white/20 rounded-md">
                  {labels[viewingPhoto.status] || viewingPhoto.status || 'อัปเดต'}
                </span>
                <span className="text-xs text-gray-300">
                  {formatDateTh(viewingPhoto.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-lightbox-delete-photo"
                  onClick={() => {
                    setPhotoToDelete(viewingPhoto)
                    setShowDeletePhotoModal(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ลบรูปนี้</span>
                </button>
                <button
                  onClick={() => setViewingPhoto(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Photo display */}
            <div className="relative bg-black flex items-center justify-center max-h-[70vh] min-h-[240px]">
              <img
                src={viewingPhoto.photo_url}
                alt={viewingPhoto.caption || 'รูปภาพ'}
                className="max-h-[70vh] w-auto max-w-full object-contain"
              />
            </div>

            {/* Bottom Caption */}
            {viewingPhoto.caption && (
              <div className="p-4 bg-white border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-0.5">คำอธิบาย:</p>
                <p className="text-sm text-gray-800 leading-relaxed">{viewingPhoto.caption}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
