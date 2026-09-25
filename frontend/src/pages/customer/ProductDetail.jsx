import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, ShoppingBag, Leaf, Star } from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import { getVegetableById } from '../../api/vegetables'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { useNavigate as _useNavigate } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'

function AddToCartButton({ vegetable }) {
  const { addToCart, cart } = useCart()
  const navigate = _useNavigate()
  const inCart = cart.find(i => i.id === vegetable.id)

  function handleAdd() {
    addToCart(vegetable)
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={handleAdd} className="btn-primary btn-lg w-full">
        <ShoppingCart className="w-5 h-5" />
        {inCart ? `เพิ่มอีก (ในตะกร้า: ${inCart.qty})` : 'เพิ่มลงตะกร้า'}
      </button>
      {inCart && (
        <button onClick={() => navigate('/cart')} className="btn-secondary btn-lg w-full">
          ดูตะกร้า
        </button>
      )}
    </div>
  )
}

export default function ProductDetail() {
  const { id } = useParams()
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()
  const [vegetable, setVegetable] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getVegetableById(id)
      .then(data => setVegetable(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="spinner w-10 h-10" /></div>
  if (!vegetable) return <div className="min-h-screen flex items-center justify-center text-gray-400">ไม่พบสินค้า</div>

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-28">
        <Link to="/products" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-forest mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> กลับรายการผัก
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Image */}
          <div className="aspect-square rounded-3xl overflow-hidden bg-primary-50 flex items-center justify-center">
            {vegetable.image_url
              ? <img src={vegetable.image_url} alt={vegetable.name} className="w-full h-full object-cover" />
              : <Leaf className="w-24 h-24 text-primary-200" />
            }
          </div>

          {/* Details */}
          <div>
            <span className={`badge mb-3 ${vegetable.category === 'vegetable' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {vegetable.category === 'vegetable' ? '🥬 ผักไฮโดรโปนิก' : '🌱 อุปกรณ์ปลูก'}
            </span>
            <h1 className="text-3xl font-bold text-forest-dark mb-2">{vegetable.name}</h1>
            <p className="text-gray-400 mb-6">{vegetable.description}</p>

            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-4xl font-bold text-forest">฿{Number(vegetable.price_per_kg).toLocaleString()}</span>
              <span className="text-gray-400">/{vegetable.unit}</span>
            </div>

            {vegetable.harvest_days && (
              <div className="flex items-center gap-3 mb-6 p-4 bg-primary-50 rounded-xl">
                <Clock className="w-5 h-5 text-forest" />
                <div>
                  <p className="text-sm font-semibold text-forest-dark">ระยะเวลาปลูก</p>
                  <p className="text-sm text-gray-500">{vegetable.harvest_days} วัน (เพาะเมล็ด {vegetable.germination_days || 7} วัน + ลงราง)</p>
                </div>
              </div>
            )}

            {isLoggedIn ? (
              vegetable.category === 'equipment' ? (
                <AddToCartButton vegetable={vegetable} />
              ) : (
                <Link to={`/order/new/${id}`} className="btn-primary btn-lg w-full">
                  <ShoppingBag className="w-5 h-5" />
                  สั่งจองล่วงหน้า
                </Link>
              )
            ) : (
              <Link to="/login" className="btn-primary btn-lg w-full">
                เข้าสู่ระบบเพื่อสั่งซื้อ
              </Link>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
