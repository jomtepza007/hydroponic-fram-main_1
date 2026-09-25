import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag, Plus, Package, ChevronRight } from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import OrderStatusBadge from '../../components/orders/OrderStatusBadge'
import { getMyOrders } from '../../api/orders'
import { useAuth } from '../../context/AuthContext'
import { formatDateTh, isEquipmentOrder } from '../../utils/dateUtils'

export default function OrderHistory() {
  const { user } = useAuth()
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-28">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">ออเดอร์ของฉัน</h1>
            <p className="page-subtitle">ติดตามสถานะการปลูกทั้งหมด</p>
          </div>
          <Link to="/products" className="btn-primary">
            <Plus className="w-4 h-4" />
            สั่งจองใหม่
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
          <div className="space-y-4">
            {orders.map(order => (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="card-hover flex items-center justify-between gap-4 group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 transition-colors">
                    <ShoppingBag className="w-5 h-5 text-forest" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-800">
                        ออเดอร์ #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <OrderStatusBadge
                        status={order.status}
                        isEquipment={isEquipmentOrder(order)}
                      />
                    </div>
                    <p className="text-sm text-gray-400">
                      {order.order_items?.map(i => i.vegetable_types?.name).join(', ')}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      รับสินค้า: {formatDateTh(order.pickup_date)} • สั่งเมื่อ {formatDateTh(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="font-bold text-forest">฿{Number(order.total_amount).toLocaleString()}</p>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-forest transition-colors" />
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
