import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, ShoppingBag, Leaf, Minus, Plus, ShoppingCart, Check, Calendar } from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import { getVegetableById } from '../../api/vegetables'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import toast from 'react-hot-toast'

export default function ProductDetail() {
  const { id } = useParams()
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()
  const { addToCart, cart } = useCart()

  const [vegetable, setVegetable] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    getVegetableById(id)
      .then(data => {
        setVegetable(data)
        // ตั้งค่าปริมาณเริ่มต้น: ผักเริ่มที่ 1 กก. (หรือ 0.5), อุปกรณ์เริ่มที่ 1 ชิ้น
        setQuantity(data?.category === 'vegetable' ? 1.0 : 1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner w-10 h-10" />
      </div>
    )
  }

  if (!vegetable) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">ไม่พบสินค้า</p>
        <Link to="/products" className="btn-outline">กลับรายการสินค้า</Link>
      </div>
    )
  }

  const isVeg = vegetable.category === 'vegetable'
  const inCartItem = cart.find(i => i.id === vegetable.id)
  const step = isVeg ? 0.5 : 1
  const minQty = isVeg ? 0.5 : 1

  function handleDecrement() {
    setQuantity(prev => {
      const next = isVeg ? Math.round((prev - step) * 10) / 10 : prev - step
      return next >= minQty ? next : minQty
    })
  }

  function handleIncrement() {
    setQuantity(prev => {
      const next = isVeg ? Math.round((prev + step) * 10) / 10 : prev + step
      return next
    })
  }

  function handleDirectChange(val) {
    const num = parseFloat(val)
    if (isNaN(num)) return
    if (num < minQty) {
      setQuantity(minQty)
      return
    }
    setQuantity(isVeg ? Math.round(num * 10) / 10 : Math.round(num))
  }

  function handleAddToCart() {
    addToCart(vegetable, quantity)
    toast.success(
      (t) => (
        <div className="flex items-center justify-between gap-3 w-full">
          <div>
            <p className="font-semibold text-sm">เพิ่มลงตะกร้าแล้ว 🌱</p>
            <p className="text-xs text-gray-500">
              {vegetable.name} {quantity} {vegetable.unit} (฿{(quantity * Number(vegetable.price_per_kg)).toLocaleString()})
            </p>
          </div>
          <button
            onClick={() => {
              toast.dismiss(t.id)
              navigate('/cart')
            }}
            className="px-2.5 py-1 bg-forest text-white text-xs font-semibold rounded-lg hover:bg-forest-dark transition-colors flex-shrink-0"
          >
            ดูตะกร้า
          </button>
        </div>
      ),
      { duration: 3500 }
    )
  }

  function handleBuyNow() {
    addToCart(vegetable, quantity)
    navigate('/cart')
  }

  const calculatedTotal = (quantity * Number(vegetable.price_per_kg || 0))

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-28">
        <Link to="/products" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-forest mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> กลับรายการสินค้า
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Image */}
          <div className="aspect-square rounded-3xl overflow-hidden bg-primary-50 flex items-center justify-center shadow-sm border border-gray-100">
            {vegetable.image_url
              ? <img src={vegetable.image_url} alt={vegetable.name} className="w-full h-full object-cover" />
              : <Leaf className="w-24 h-24 text-primary-200" />
            }
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <span className={`badge ${isVeg ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {isVeg ? '🥬 ผักไฮโดรโปนิก (พรีออเดอร์)' : '🌱 อุปกรณ์ปลูก (พร้อมส่ง)'}
              </span>
              {inCartItem && (
                <span className="badge bg-amber-50 text-amber-700 border border-amber-200 text-xs flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3" />
                  ในตะกร้ามีแล้ว: {inCartItem.qty} {vegetable.unit}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-forest-dark mb-2">{vegetable.name}</h1>
            <p className="text-gray-500 mb-5 leading-relaxed">{vegetable.description || 'ผักสดกรอบ สะอาด ปลอดสารเคมี ปลูกด้วยระบบไฮโดรโปนิกมาตรฐาน'}</p>

            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-4xl font-bold text-forest">฿{Number(vegetable.price_per_kg).toLocaleString()}</span>
              <span className="text-gray-400 font-medium">/{vegetable.unit}</span>
            </div>

            {vegetable.harvest_days && isVeg && (
              <div className="flex items-center gap-3 mb-6 p-4 bg-primary-50/70 border border-primary-100 rounded-2xl">
                <Clock className="w-5 h-5 text-forest flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-forest-dark">ระยะเวลาเก็บเกี่ยว</p>
                  <p className="text-xs text-gray-500">
                    {vegetable.harvest_days} วัน (เพาะเมล็ด {vegetable.germination_days || 7} วัน + ลงแปลงปลูก)
                  </p>
                </div>
              </div>
            )}

            {/* Quantity Selector Section */}
            <div className="bg-gray-50/80 border border-gray-200/70 p-4 rounded-2xl mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  {isVeg ? 'เลือกปริมาณน้ำหนัก' : 'เลือกจำนวนชิ้น'}
                </span>
                {isVeg && (
                  <span className="text-xs text-forest font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    เลือกได้ครั้งละ 0.5 กก.
                  </span>
                )}
              </div>

              {/* Stepper */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDecrement}
                  className="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-700 shadow-sm transition-all"
                  title={`ลด ${step} ${vegetable.unit}`}
                >
                  <Minus className="w-4 h-4" />
                </button>

                <div className="relative flex-1">
                  <input
                    type="number"
                    step={step}
                    min={minQty}
                    value={quantity}
                    onChange={e => handleDirectChange(e.target.value)}
                    className="input text-center font-bold text-lg w-full py-2 bg-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 pointer-events-none">
                    {vegetable.unit}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleIncrement}
                  className="w-11 h-11 rounded-xl bg-forest text-white flex items-center justify-center hover:bg-forest-dark shadow-sm transition-all"
                  title={`เพิ่ม ${step} ${vegetable.unit}`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick weight buttons for vegetables */}
              {isVeg && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-xs text-gray-400 mr-1">ทางลัด:</span>
                  {[0.5, 1.0, 1.5, 2.0, 3.0].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setQuantity(w)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                        quantity === w
                          ? 'bg-forest text-white border-forest shadow-xs'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-emerald-50 hover:border-emerald-300'
                      }`}
                    >
                      {w} กก.
                    </button>
                  ))}
                </div>
              )}

              {/* Real-time Subtotal */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 text-sm">
                <span className="text-gray-500">ราคารวม ({quantity} {vegetable.unit})</span>
                <span className="text-lg font-bold text-forest">฿{calculatedTotal.toLocaleString()}</span>
              </div>
            </div>

            {/* Actions */}
            {isLoggedIn ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  id="btn-add-to-cart"
                  onClick={handleAddToCart}
                  className="btn-outline flex-1 py-3.5 flex items-center justify-center gap-2 border-forest text-forest hover:bg-forest hover:text-white"
                >
                  <ShoppingCart className="w-5 h-5" />
                  เพิ่มลงตะกร้า
                </button>
                <button
                  id="btn-order-now"
                  onClick={handleBuyNow}
                  className="btn-primary flex-1 py-3.5 flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="w-5 h-5" />
                  {isVeg ? 'สั่งจองผักทันที' : 'สั่งซื้อทันที'}
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn-primary btn-lg w-full text-center">
                เข้าสู่ระบบเพื่อสั่งซื้อ
              </Link>
            )}

            {isVeg && (
              <p className="text-xs text-gray-400 text-center mt-4">
                💡 สามารถเลือกผักหลายชนิดใส่ตะกร้า (เช่น กรีนโอ๊ค 1.5 กก. + เรดโอ๊ค 2 กก.) แล้วกดสั่งรวมกันได้
              </p>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

