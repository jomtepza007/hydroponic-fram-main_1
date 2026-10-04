import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShoppingBag, Plus, Package, ChevronRight, RotateCcw } from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getMyOrders } from '../../api/orders'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { formatDateTh, isEquipmentOrder } from '../../utils/dateUtils'
import toast from 'react-hot-toast'

export default function OrderHistory() {
  const { user } = useAuth()
  const { addToCart } = useCart()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) loadOrders()
  }, [user])

  async function loadOrders() {
    try {
      const data = await getMyOrders(user.id)
      setOrders(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handleReorder(e, order) {
    e.preventDefault()
    e.stopPropagation()
    if (!order?.order_items || order.order_items.length === 0) {
      toast.error('ไม่พบรายการสินค้าในออเดอร์นี้')
      return
    }

    let count = 0
    order.order_items.forEach(item => {
      const rawPrice = item.price_at_order > 0
        ? item.price_at_order
        : (item.vegetable_types?.price_per_kg ?? item.vegetable_types?.price ?? item.price ?? 0)
      const unitPrice = isNaN(Number(rawPrice)) ? 0 : Number(rawPrice)

      const product = {
        id: item.vegetable_type_id || item.vegetable_types?.id,
        name: item.vegetable_types?.name || item.name || 'สินค้า',
        category: item.vegetable_types?.category || item.category || 'vegetable',
        price: unitPrice,
        price_per_kg: unitPrice,
        unit: item.vegetable_types?.unit || item.unit || 'กก.',
        image_url: item.vegetable_types?.image_url,
        harvest_days: Number(item.vegetable_types?.harvest_days) || 30,
        slots_per_kg: Number(item.vegetable_types?.slots_per_kg) || 4,
      }
      if (product.id) {
        addToCart(product, Number(item.quantity) || 1)
        count++
      }
    })

    toast.success(`เพิ่มสินค้า ${count} รายการลงในตะกร้าแล้ว 🛒`)
    navigate('/cart')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background w-full overflow-x-hidden">
      <Navbar />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3">
          <div>
            <h1 className="page-title text-2xl sm:text-3xl">ออเดอร์ของฉัน</h1>
            <p className="page-subtitle text-xs sm:text-sm">ติดตามสถานะการปลูกทั้งหมด</p>
          </div>
          <Link to="/products" className="btn-primary py-2 px-3.5 sm:px-5 text-xs sm:text-sm flex-shrink-0">
            <Plus className="w-4 h-4" />
            <span>สั่งจองใหม่</span>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="spinner w-10 h-10" />
          </div>
        ) : orders.length === 0 ? (
          <div className="card text-center py-16">
            <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-500 text-lg">ยังไม่มีออเดอร์</h3>
            <p className="text-gray-400 text-sm mt-1 mb-6">เริ่มสั่งจองผักสดจากฟาร์มได้เลย</p>
            <Link to="/products" className="btn-primary">
              <ShoppingBag className="w-4 h-4" />
              เลือกผัก
            </Link>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {orders.map(order => (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="card-hover block p-4 sm:p-5 group transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                  {/* Left: Info */}
                  <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 transition-colors mt-0.5 sm:mt-0">
                      <ShoppingBag className="w-5 h-5 text-forest" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                        <p className="font-semibold text-gray-800 text-sm sm:text-base">
                          ออเดอร์ #{order.id.slice(0, 8).toUpperCase()}
                        </p>
                        <OrderStatusBadge
                          status={order.status}
                          isEquipment={isEquipmentOrder(order)}
                        />
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">
                        {order.order_items?.map(i => i.vegetable_types?.name).filter(Boolean).join(', ') || 'ไม่มีรายละเอียดสินค้า'}
                      </p>
                      <p className="text-[11px] sm:text-xs text-gray-400 mt-1 leading-tight">
                        รับสินค้า: {formatDateTh(order.pickup_date)} • สั่งเมื่อ {formatDateTh(order.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Right: Price & Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t border-gray-100 sm:border-t-0 flex-shrink-0">
                    <div className="text-left sm:text-right">
                      {order.status !== 'pending' && order.final_amount != null && Number(order.final_amount) < Number(order.total_amount) ? (
                        <div>
                          <span className="text-[11px] text-gray-400 line-through block leading-none">฿{Number(order.total_amount).toLocaleString()}</span>
                          <span className="font-bold text-forest text-base sm:text-lg">฿{Number(order.final_amount).toLocaleString()}</span>
                        </div>
                      ) : (
                        <p className="font-bold text-forest text-base sm:text-lg">฿{Number(order.total_amount).toLocaleString()}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleReorder(e, order)}
                        className="btn-sm bg-primary-100 text-forest hover:bg-primary-200 flex items-center gap-1.5 transition-all text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl shadow-xs active:scale-95 flex-shrink-0"
                        title="สั่งซื้อรายการเดิมอีกครั้ง"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>สั่งอีกครั้ง</span>
                      </button>
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300 group-hover:text-forest group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
