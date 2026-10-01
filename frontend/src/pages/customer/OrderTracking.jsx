import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Clock, Package, ShoppingBag, ArrowLeft, CheckCircle,
  Calendar, Leaf, ChevronRight, Truck, X, Maximize2, Camera,
  RotateCcw, XCircle, AlertTriangle, AlertCircle, Tag, Coins
} from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import StatusTimeline from '../../components/orders/StatusTimeline'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getOrderById, updateOrderStatus } from '../../api/orders'
import { supabase } from '../../api/supabaseClient'
import { formatDateTh, isEquipmentOrder } from '../../utils/dateUtils'
import { extractPhotosFromOrder, cleanOrderNotes } from '../../utils/orderPhotoUtils'
import { useCart } from '../../context/CartContext'
import toast from 'react-hot-toast'

const CANCEL_REASONS = [
  'เปลี่ยนใจ / ไม่สะดวกรับสินค้าแล้ว',
  'สั่งซื้อผิดรายการ / ต้องการสั่งใหม่',
  'ต้องการเปลี่ยนวันรับสินค้า',
  'เปลี่ยนที่อยู่จัดส่ง',
  'อื่นๆ (โปรดระบุรายละเอียด)',
]

export default function OrderTracking() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useCart()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState(null)

  // สถานะการยกเลิกคำสั่งซื้อ
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSubmitting, setCancelSubmitting] = useState(false)

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner w-10 h-10" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Package className="w-16 h-16 text-gray-200" />
        <p className="text-gray-400">ไม่พบออเดอร์</p>
        <Link to="/orders" className="btn-outline">ดูออเดอร์ทั้งหมด</Link>
      </div>
    )
  }

  const isEquipment = isEquipmentOrder(order)
  const growthPhotos = extractPhotosFromOrder(order)

  // ลูกค้าสามารถกดยกเลิกได้เฉพาะสถานะ waiting_cycle หรือ pending เท่านั้น
  const canCancel = order?.status === 'waiting_cycle' || order?.status === 'pending'

  // ฟังก์ชันสั่งซื้อซ้ำ
  function handleReorder() {
    if (!order?.order_items || order.order_items.length === 0) {
      toast.error('ไม่พบรายการสินค้าในออเดอร์นี้')
      return
    }

    let count = 0
    order.order_items.forEach(item => {
      const product = {
        id: item.vegetable_type_id || item.vegetable_types?.id,
        name: item.vegetable_types?.name || 'สินค้า',
        category: item.vegetable_types?.category || 'vegetable',
        price: Number(item.price_at_order) || 0,
        unit: item.vegetable_types?.unit || item.unit || 'กก.',
        image_url: item.vegetable_types?.image_url,
      }
      if (product.id) {
        addToCart(product, Number(item.quantity) || 1)
        count++
      }
    })

    toast.success(`เพิ่มสินค้า ${count} รายการลงตะกร้าแล้ว 🛒`)
    navigate('/cart')
  }

  // ฟังก์ชันยืนยันยกเลิกคำสั่งซื้อ
  async function handleConfirmCancel() {
    if (!order?.id || !canCancel) return
    setCancelSubmitting(true)
    const reasonText = cancelReason.trim() || 'ลูกค้าขอยกเลิกคำสั่งซื้อ'
    const noteEntry = `[ลูกค้ายกเลิกคำสั่งซื้อ: ${reasonText} (${formatDateTh(new Date())})]`
    const updatedNotes = order.notes ? `${order.notes}\n${noteEntry}` : noteEntry

    try {
      await updateOrderStatus(order.id, 'cancelled', updatedNotes, isEquipment)

      // ส่งแจ้งเตือนให้เกษตรกรและแอดมิน
      try {
        const shortId = order.id.slice(0, 8).toUpperCase()
        const { data: staffList } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['farmer', 'admin'])

        if (staffList && staffList.length > 0) {
          const inserts = staffList.map(s => ({
            user_id: s.id,
            title: `⚠️ ลูกค้ายกเลิกออเดอร์ #${shortId}`,
            message: `เหตุผล: "${reasonText}"`,
            type: 'order_status',
            related_id: order.id,
            is_read: false,
          }))
          await supabase.from('notifications').insert(inserts)
        }
      } catch (e) {
        console.warn('Notify staff failed:', e)
      }

      toast.success('ยกเลิกคำสั่งซื้อเรียบร้อยแล้ว')
      setShowCancelModal(false)
      setOrder(prev => ({ ...prev, status: 'cancelled', notes: updatedNotes }))
    } catch (err) {
      console.error(err)
      toast.error('ไม่สามารถยกเลิกได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setCancelSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-28">
        {/* Back */}
        <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-forest mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          กลับหน้าออเดอร์
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="page-title">ออเดอร์ #{order.id.slice(0, 8).toUpperCase()}</h1>
              {isEquipment && (
                <span className="badge bg-blue-100 text-blue-700 text-xs">
                  🌱 อุปกรณ์ปลูก
                </span>
              )}
            </div>
            <p className="page-subtitle">สั่งเมื่อ {formatDateTh(order.created_at)}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <OrderStatusBadge status={order.status} isEquipment={isEquipment} />

            {/* ปุ่มสั่งซื้อซ้ำ */}
            <button
              type="button"
              id="btn-reorder-detail"
              onClick={handleReorder}
              className="btn-sm bg-primary-100 text-forest hover:bg-primary-200 flex items-center gap-1.5 transition-all shadow-sm"
              title="สั่งซื้อรายการเดิมอีกครั้ง"
            >
              <RotateCcw className="w-4 h-4" />
              สั่งซื้ออีกครั้ง
            </button>

            {/* ปุ่มยกเลิกคำสั่งซื้อสำหรับลูกค้า */}
            {canCancel && (
              <button
                type="button"
                id="btn-customer-cancel-order"
                onClick={() => {
                  setCancelReason('')
                  setShowCancelModal(true)
                }}
                className="btn-sm border border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-all"
                title="ขอยกเลิกคำสั่งซื้อ"
              >
                <XCircle className="w-4 h-4" />
                ขอยกเลิกคำสั่งซื้อ
              </button>
            )}
          </div>
        </div>

        {/* Cancelled Notice Banner */}
        {order.status === 'cancelled' && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 animate-slide-up">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">คำสั่งซื้อนี้ถูกยกเลิกแล้ว</p>
              <p className="text-xs text-red-600 mt-0.5">
                รายการคำสั่งซื้อนี้ได้รับการยกเลิกแล้ว หากต้องการสั่งซื้อใหม่ สามารถกดปุ่ม "สั่งซื้ออีกครั้ง" ด้านบนได้ทันที
              </p>
            </div>
          </div>
        )}

        {/* Warning hint for cancelable orders */}
        {canCancel && (
          <div className="mb-6 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/70 flex items-center justify-between gap-3 text-amber-800 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>ออเดอร์นี้อยู่ในช่วงรอยืนยันรอบปลูก คุณสามารถกดยกเลิกคำสั่งซื้อได้หากต้องการเปลี่ยนใจ</span>
            </div>
            <button
              onClick={() => {
                setCancelReason('')
                setShowCancelModal(true)
              }}
              className="text-amber-900 font-semibold underline hover:text-red-600 flex-shrink-0"
            >
              ยกเลิกคำสั่งซื้อ
            </button>
          </div>
        )}

        {/* Status Timeline */}
        <div className="card mb-6 overflow-x-auto">
          <h2 className="font-semibold text-forest-dark mb-6">
            {isEquipment ? 'สถานะคำสั่งซื้อ & การจัดส่ง' : 'สถานะการปลูก'}
          </h2>
          <div className="min-w-[500px]">
            <StatusTimeline currentStatus={order.status} isEquipment={isEquipment} />
          </div>
        </div>

        {/* Shipping details for equipment orders */}
        {isEquipment && cleanOrderNotes(order.notes) && (
          <div className="card mb-6 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
            <h2 className="font-semibold text-forest-dark mb-3 flex items-center gap-2">
              <Truck className="w-5 h-5 text-forest" />
              ข้อมูลการจัดส่งพัสดุ
            </h2>
            <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed bg-white/80 p-4 rounded-xl border border-emerald-100 shadow-sm">
              {cleanOrderNotes(order.notes)}
            </div>
          </div>
        )}

        {/* Order Items */}
        <div className="card mb-6">
          <h2 className="font-semibold text-forest-dark mb-4">รายการสินค้า</h2>
          <div className="space-y-4">
            {order.order_items?.map(item => {
              const itemTotal = Number(item.quantity) * Number(item.price_at_order)
              const hasDiscount = order.status !== 'pending' && Number(item.discount_rate) > 0
              const itemDiscountAmount = item.discount_amount != null
                ? Number(item.discount_amount)
                : Math.round(itemTotal * (Number(item.discount_rate) / 100) * 100) / 100
              const itemFinalPrice = item.final_price != null
                ? Number(item.final_price)
                : itemTotal - itemDiscountAmount

              return (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-primary-50 rounded-xl">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.vegetable_types?.image_url
                      ? <img src={item.vegetable_types.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                      : <Leaf className="w-6 h-6 text-primary-300" />
                    }
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800">{item.vegetable_types?.name}</p>
                      {item.vegetable_types?.category === 'equipment' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">อุปกรณ์</span>
                      )}
                      {hasDiscount && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                          ลด {item.discount_rate}% (-฿{itemDiscountAmount.toLocaleString()})
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">
                      จำนวน {item.quantity} {item.vegetable_types?.unit || item.unit}
                      {(item.slots_required > 0 || item.vegetable_types?.slots_per_kg) && item.vegetable_types?.category !== 'equipment' && (
                        <span className="ml-2 font-medium text-forest">
                          • ใช้พื้นที่ {item.slots_required || Math.ceil(item.quantity * (item.vegetable_types?.slots_per_kg || 4))} ช่อง
                        </span>
                      )}
                      {item.vegetable_types?.harvest_days && item.vegetable_types?.category !== 'equipment' && (
                        <span className="ml-2">• ปลูก {item.vegetable_types.harvest_days} วัน</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    {hasDiscount ? (
                      <div>
                        <span className="line-through text-gray-400 text-xs block">
                          ฿{itemTotal.toLocaleString()}
                        </span>
                        <span className="font-bold text-forest">
                          ฿{itemFinalPrice.toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <p className="font-bold text-forest">
                        ฿{itemTotal.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pricing summary */}
          {(() => {
            const isConfirmedOrLater = !['waiting_cycle', 'pending', 'scheduling'].includes(order.status)
            const origTotal = Number(order.total_amount)
            
            const totalItemDiscount = order.order_items?.reduce((sum, it) => {
              if (!isConfirmedOrLater || !(Number(it.discount_rate) > 0)) return sum
              const itTotal = Number(it.quantity) * Number(it.price_at_order)
              const itDisc = it.discount_amount != null
                ? Number(it.discount_amount)
                : Math.round(itTotal * (Number(it.discount_rate) / 100) * 100) / 100
              return sum + itDisc
            }, 0) || 0

            const orderDiscountAmount = isConfirmedOrLater ? (Number(order.order_discount_amount) || 0) : 0
            const orderDiscountType = order.order_discount_type
            const orderDiscountVal = Number(order.order_discount_value) || 0
            const totalAllDiscounts = totalItemDiscount + orderDiscountAmount

            const finalAmount = (isConfirmedOrLater && order.final_amount != null)
              ? Number(order.final_amount)
              : Math.max(0, origTotal - totalAllDiscounts)

            const hasAnyDiscount = isConfirmedOrLater && totalAllDiscounts > 0

            return (
              <div className="border-t border-gray-100 mt-4 pt-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Calendar className="w-4 h-4 text-forest" />
                    <span className="text-sm">
                      {isEquipment ? 'กำหนดส่งสินค้าประมาณ:' : 'วันรับสินค้า:'} <strong className="text-forest">{formatDateTh(order.pickup_date)}</strong>
                    </span>
                  </div>

                  {!hasAnyDiscount ? (
                    <p className="font-bold text-lg text-forest-dark">
                      รวม ฿{origTotal.toLocaleString()}
                    </p>
                  ) : (
                    <div className="text-right space-y-1">
                      <div className="text-xs text-gray-400 space-y-0.5">
                        <div>ราคาปกติ ฿{origTotal.toLocaleString()}</div>
                        {totalItemDiscount > 0 && (
                          <div className="text-emerald-700 font-medium">
                            ส่วนลดต่อรายการ -฿{totalItemDiscount.toLocaleString()}
                          </div>
                        )}
                        {orderDiscountAmount > 0 && (
                          <div className="text-emerald-700 font-medium flex items-center justify-end gap-1">
                            <Coins className="w-3 h-3" />
                            <span>ส่วนลดพิเศษทั้งออเดอร์ {orderDiscountType === 'percent' ? `(${orderDiscountVal}%)` : ''} -฿{orderDiscountAmount.toLocaleString()}</span>
                            {order.order_discount_note && (
                              <span className="text-gray-400 font-normal">({order.order_discount_note})</span>
                            )}
                          </div>
                        )}
                        <div className="text-emerald-800 font-bold">
                          ประหยัดรวม -฿{totalAllDiscounts.toLocaleString()}
                        </div>
                      </div>
                      <p className="font-bold text-xl text-forest pt-0.5">
                        ยอดชำระสุทธิ ฿{finalAmount.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                {!isConfirmedOrLater && (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2">
                    * ยอดเงินข้างต้นเป็นราคาปกติก่อนตรวจสอบคำสั่งซื้อ หากมีส่วนลดพิเศษ ฟาร์มจะยืนยันราคาสุทธิให้ท่านเมื่อตรวจสอบออเดอร์
                  </p>
                )}
              </div>
            )
          })()}
        </div>

        {/* Growth Photos (Always show if photos exist) */}
        {growthPhotos.length > 0 && (
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-forest-dark flex items-center gap-2">
                <Camera className="w-5 h-5 text-forest" />
                รูปภาพอัปเดตจากฟาร์ม ({growthPhotos.length} รูป)
              </h2>
              <span className="text-xs text-gray-400 font-normal">คลิกที่รูปเพื่อขยาย</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {growthPhotos.map(photo => (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative group rounded-xl overflow-hidden aspect-square bg-primary-50 cursor-pointer shadow-sm border border-gray-100 hover:shadow-md transition-all"
                >
                  <img
                    src={photo.photo_url}
                    alt={photo.caption || 'รูปภาพจากฟาร์ม'}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2.5">
                    <div className="self-end">
                      <span className="p-1.5 rounded-full bg-white/20 text-white backdrop-blur-sm inline-flex">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div>
                      <p className="text-white text-xs font-medium line-clamp-2">{photo.caption}</p>
                      <p className="text-white/70 text-[10px] mt-0.5">{formatDateTh(photo.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty photos state (When status is in progress and no photos yet) */}
        {growthPhotos.length === 0 && order.status !== 'pending' && order.status !== 'confirmed' && (
          <div className="card text-center py-8 mb-6">
            <div className="text-4xl mb-3">🌱</div>
            <p className="text-gray-600 font-medium text-sm">รูปภาพอัปเดตการเจริญเติบโตจะปรากฏที่นี่</p>
            <p className="text-gray-400 text-xs mt-1">ผู้จัดการฟาร์มจะถ่ายรูปและอัปเดตสถานะให้ทราบเป็นระยะ</p>
          </div>
        )}

        {/* Notes */}
        {cleanOrderNotes(order.notes) && (
          <div className="card mb-6">
            <h2 className="font-semibold text-forest-dark mb-2">หมายเหตุ</h2>
            <p className="text-gray-600 text-sm whitespace-pre-line">{cleanOrderNotes(order.notes)}</p>
          </div>
        )}
      </main>

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative bg-black flex items-center justify-center max-h-[70vh]">
              <img
                src={selectedPhoto.photo_url}
                alt={selectedPhoto.caption}
                className="max-h-[70vh] w-auto max-w-full object-contain"
              />
              <button
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-white">
              <p className="font-semibold text-gray-800 text-base">{selectedPhoto.caption || 'รูปภาพจากฟาร์ม'}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDateTh(selectedPhoto.created_at)}
                </span>
                {selectedPhoto.status && (
                  <span className="badge bg-mint-50 text-forest text-xs">
                    สถานะ: {selectedPhoto.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Confirmation Modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !cancelSubmitting && setShowCancelModal(false)}
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
                  <h3 className="font-bold text-gray-800 text-base">ยืนยันยกเลิกคำสั่งซื้อ</h3>
                  <p className="text-xs text-gray-400">ออเดอร์ #{order.id.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={cancelSubmitting}
                onClick={() => setShowCancelModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              คุณต้องการยกเลิกคำสั่งซื้อนี้ใช่หรือไม่? เมื่อยกเลิกแล้วจะไม่สามารถย้อนกลับได้ แต่สามารถกดสั่งซื้อใหม่ได้ตลอดเวลา
            </p>

            {/* Quick Reason Chips */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 mb-2">
                เลือกเหตุผลในการยกเลิก:
              </label>
              <div className="flex flex-wrap gap-2">
                {CANCEL_REASONS.map(reason => (
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
                รายละเอียดเพิ่มเติม (ไม่บังคับ):
              </label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="ระบุเหตุผลในการขอยกเลิกคำสั่งซื้อ..."
                className="input text-sm w-full"
                disabled={cancelSubmitting}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={cancelSubmitting}
                onClick={() => setShowCancelModal(false)}
                className="btn-outline text-sm px-4 py-2"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                id="btn-confirm-cancel-order"
                disabled={cancelSubmitting}
                onClick={handleConfirmCancel}
                className="btn-sm bg-red-600 hover:bg-red-700 text-white rounded-xl px-5 py-2.5 font-semibold flex items-center gap-2 shadow-sm transition-all"
              >
                {cancelSubmitting ? (
                  <>
                    <div className="spinner w-4 h-4 border-white" />
                    กำลังยกเลิก...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    ยืนยันยกเลิกคำสั่งซื้อ
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
