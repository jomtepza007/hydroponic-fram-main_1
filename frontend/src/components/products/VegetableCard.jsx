import { Link } from 'react-router-dom'
import { Clock, Leaf, ShoppingBag } from 'lucide-react'

/**
 * VegetableCard — แสดงการ์ดผัก/อุปกรณ์
 */
export default function VegetableCard({ vegetable }) {
  const { id, name, description, image_url, price_per_kg, unit, harvest_days, category } = vegetable

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

      {/* Order Button hint */}
      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-forest opacity-0 group-hover:opacity-100 transition-all duration-200">
        <ShoppingBag className="w-3.5 h-3.5" />
        สั่งจองล่วงหน้า
      </div>
    </Link>
  )
}
