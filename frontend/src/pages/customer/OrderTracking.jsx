import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Clock, Package, ShoppingBag, ArrowLeft, CheckCircle,
  Calendar, Leaf, ChevronRight, Truck, X, Maximize2, Camera
} from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import StatusTimeline from '../../components/orders/StatusTimeline'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getOrderById } from '../../api/orders'
import { formatDateTh, isEquipmentOrder } from '../../utils/dateUtils'
import { extractPhotosFromOrder, cleanOrderNotes } from '../../utils/orderPhotoUtils'

export default function OrderTracking() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState(null)

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
          <OrderStatusBadge status={order.status} isEquipment={isEquipment} />
        </div>

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
            {order.order_items?.map(item => (
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
                <p className="font-bold text-forest">
                  ฿{(item.quantity * item.price_at_order).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between items-center">
            <div className="flex items-center gap-2 text-gray-500">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">
                {isEquipment ? 'กำหนดส่งสินค้าประมาณ:' : 'วันรับสินค้า:'} <strong className="text-forest">{formatDateTh(order.pickup_date)}</strong>
              </span>
            </div>
            <p className="font-bold text-lg text-forest-dark">
              รวม ฿{Number(order.total_amount).toLocaleString()}
            </p>
          </div>
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

      <Footer />
    </div>
  )
}
