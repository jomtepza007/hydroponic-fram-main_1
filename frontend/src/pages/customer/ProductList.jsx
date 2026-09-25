import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter } from 'lucide-react'
import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'
import VegetableCard from '../../components/products/VegetableCard'
import { getVegetables } from '../../api/vegetables'

const CATEGORIES = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'vegetable', label: '🥬 ผักไฮโดรโปนิก' },
  { value: 'equipment', label: '🌱 อุปกรณ์ปลูก' },
]

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [vegetables, setVegetables] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const category = searchParams.get('category') || ''

  useEffect(() => {
    loadVegetables()
  }, [])

  useEffect(() => {
    applyFilter()
  }, [vegetables, search, category])

  async function loadVegetables() {
    try {
      const data = await getVegetables()
      setVegetables(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function applyFilter() {
    let result = vegetables
    if (category) result = result.filter(v => v.category === category)
    if (search) result = result.filter(v =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.description?.toLowerCase().includes(search.toLowerCase())
    )
    setFiltered(result)
  }

  function setCategory(cat) {
    if (cat) setSearchParams({ category: cat })
    else setSearchParams({})
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28">
        {/* Header */}
        <div className="mb-8">
          <h1 className="page-title">รายการสินค้า</h1>
          <p className="page-subtitle">ผักไฮโดรโปนิกออร์แกนิกสด + อุปกรณ์ปลูกผัก</p>
        </div>

        {/* Filter & Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          {/* Category Tabs */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                  ${category === cat.value
                    ? 'bg-forest text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-primary-50 border border-gray-200'
                  }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาผัก..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9"
              id="search-input"
            />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="aspect-[4/3] bg-gray-100 rounded-xl mb-4" />
                <div className="h-4 bg-gray-100 rounded mb-2" />
                <div className="h-3 bg-gray-50 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-gray-400">ไม่พบรายการที่ค้นหา</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-4">
              พบ <span className="font-semibold text-forest">{filtered.length}</span> รายการ
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filtered.map(veg => (
                <VegetableCard key={veg.id} vegetable={veg} />
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
