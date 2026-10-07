import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Clock, Leaf, ShoppingCart } from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

/**
 * VegetableCard — แสดงการ์ดผัก/อุปกรณ์
 */
export default function VegetableCard({ vegetable }) {
  const { id, name, description, image_url, price_per_kg, unit, harvest_days, category } = vegetable
  const { addToCart } = useCart()
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  function handleQuickAdd(e) {
    e.preventDefault()
    e.stopPropagation()

    if (!isLoggedIn) {
      toast.error('กรุณาเข้าสู่ระบบก่อนเพิ่มสินค้าลงตะกร้า 🔒')
      navigate('/login', { state: { from: location } })
      return
    }

    const qty = category === 'vegetable' ? 1.0 : 1
    addToCart(vegetable, qty)
    toast.success(`เพิ่ม ${name} ${qty} ${unit} ลงตะกร้าแล้ว 🌱`, { duration: 2500 })
  }

  return (
    <Link to={`/products/${id}`} className="card-hover group block">
      {/* Image */}
      <div className="relative overflow-hidden rounded-xl mb-4 aspect-[4/3] bg-primary-50">
        {image_url ? (
          <img
            src={image_url}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Leaf className="w-12 h-12 text-primary-200" />
          </div>
        )}
        {/* Category Badge */}
        <span className={`absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full
          ${category === 'vegetable' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {category === 'vegetable' ? '🥬 ผัก' : '🌱 อุปกรณ์'}
        </span>
      </div>

      {/* Info */}
      <h3 className="font-semibold text-gray-800 text-base mb-1 group-hover:text-forest transition-colors">
        {name}
      </h3>
      {description && (
        <p className="text-gray-400 text-xs line-clamp-2 mb-3">{description}</p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-forest font-bold text-lg">
          ฿{Number(price_per_kg).toLocaleString()}
          <span className="text-sm font-normal text-gray-400">/{unit}</span>
        </p>
        {harvest_days && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            {harvest_days} วัน
          </span>
        )}
      </div>

      {/* Bottom bar with Quick Add */}
      <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
        <span className="text-gray-500 group-hover:text-forest font-medium transition-colors">
          {category === 'vegetable' ? 'เลือกปริมาณ (กก.)' : 'ดูรายละเอียด'}
        </span>
        <button
          type="button"
          onClick={handleQuickAdd}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-50 text-forest hover:bg-forest hover:text-white transition-all font-medium"
          title={`เพิ่ม 1 ${unit} ลงตะกร้า`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>ใส่ตะกร้า</span>
        </button>
      </div>
    </Link>
  )
}

