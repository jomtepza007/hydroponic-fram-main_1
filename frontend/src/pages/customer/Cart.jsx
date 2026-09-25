import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, Leaf, ArrowLeft } from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'

export default function Cart() {
  const { cart, removeFromCart, updateQty, totalItems, totalPrice } = useCart()
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-28 w-full">

        <Link to="/products?category=equipment" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-forest mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> กลับรายการสินค้า
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <ShoppingCart className="w-6 h-6 text-forest" />
          <h1 className="page-title">ตะกร้าสินค้า</h1>
          {totalItems > 0 && (
            <span className="bg-forest text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalItems}</span>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="card text-center py-20">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-gray-400 mb-6">ตะกร้าของคุณว่างเปล่า</p>
            <Link to="/products?category=equipment" className="btn-primary">
              เลือกสินค้า
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Items */}
            <div className="lg:col-span-2 space-y-3">
              {cart.map(item => (
                <div key={item.id} className="card flex items-center gap-4">
                  {/* Image */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-primary-50 flex-shrink-0 flex items-center justify-center">
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      : <Leaf className="w-7 h-7 text-primary-200" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{item.name}</p>
                    <p className="text-sm text-forest font-medium">
                      ฿{Number(item.price_per_kg).toLocaleString()} / {item.unit}
                    </p>
                  </div>

                  {/* Qty */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Subtotal */}
                  <p className="text-sm font-bold text-gray-800 w-20 text-right flex-shrink-0">
                    ฿{(item.qty * Number(item.price_per_kg)).toLocaleString()}
                  </p>

                  {/* Remove */}
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="lg:col-span-1">
              <div className="card sticky top-28">
                <h2 className="font-bold text-gray-800 mb-4">สรุปคำสั่งซื้อ</h2>

                <div className="space-y-2 mb-4">
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between text-sm text-gray-500">
                      <span className="truncate pr-2">{item.name} × {item.qty}</span>
                      <span className="flex-shrink-0">฿{(item.qty * Number(item.price_per_kg)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-3 mb-5">
                  <div className="flex justify-between font-bold text-gray-800">
                    <span>รวมทั้งหมด</span>
                    <span className="text-forest text-lg">฿{totalPrice.toLocaleString()}</span>
                  </div>
                </div>

                {isLoggedIn ? (
                  <button
                    id="btn-proceed-checkout"
                    onClick={() => navigate('/equipment/checkout')}
                    className="btn-primary w-full"
                  >
                    ดำเนินการชำระเงิน <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <Link to="/login" className="btn-primary w-full text-center">
                    เข้าสู่ระบบเพื่อสั่งซื้อ
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
