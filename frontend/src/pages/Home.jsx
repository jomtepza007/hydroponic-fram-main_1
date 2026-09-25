import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Leaf, ShoppingBag, BarChart2, CheckCircle, ArrowRight, Droplets, Sun, Wind, TrendingUp } from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { supabase } from '../api/supabaseClient'

const features = [
  {
    icon: ShoppingBag,
    title: 'สั่งจองล่วงหน้า',
    desc: 'เลือกผักที่ต้องการ ระบุจำนวน และเลือกวันรับสินค้าได้เลย',
    color: 'bg-green-50 text-green-600',
  },
  {
    icon: BarChart2,
    title: 'ติดตามสถานะ Real-time',
    desc: 'ดูความคืบหน้าการปลูกพร้อมรูปภาพอัปเดตทุก 7 วัน',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: CheckCircle,
    title: 'ออร์แกนิก 100%',
    desc: 'ผักไฮโดรโปนิกสด สะอาด ปลอดสารพิษ ตรงจากฟาร์ม',
    color: 'bg-emerald-50 text-emerald-600',
  },
]

const stats = [
  { value: 'ผักสด สะอาด', label: 'ปลอดสารพิษ' },
  { value: 'ระบบไฮโดรโปนิกส์', label: 'มาตรฐานสากล' },
  { value: 'พลังงานสะอาด', label: 'เป็นมิตรกับสิ่งแวดล้อม' },
  { value: 'เรียนรู้ ลงมือทํา', label: 'ต่อยอดอาชีพ' },
]

const howItWorks = [
  { step: '01', title: 'เลือกผัก', desc: 'เลือกชนิดผักและระบุจำนวนที่ต้องการ' },
  { step: '02', title: 'เลือกวันรับ', desc: 'ระบุวันที่ต้องการรับสินค้า ระบบจะตรวจสอบความพร้อม' },
  { step: '03', title: 'ยืนยันออเดอร์', desc: 'ยืนยันการสั่งจอง ระบบบันทึกทันที' },
  { step: '04', title: 'ติดตามการปลูก', desc: 'ดูความคืบหน้าพร้อมรูปภาพจริงจากฟาร์ม' },
]

/** ดึงผักยอดนิยมจากยอดสั่งจองจริง
 *  ถ้ายังไม่มีออเดอร์ → fallback แสดงผักทั้งหมดที่ active */
async function fetchTopVegetables() {
  // ลอง query ผักยอดนิยมจาก order_items
  const { data: topData } = await supabase
    .from('order_items')
    .select(`
      quantity,
      vegetable_type_id,
      vegetable_types!inner(id, name, harvest_days, category, is_active),
      orders!inner(status)
    `)
    .neq('orders.status', 'cancelled')
    .eq('vegetable_types.is_active', true)
    .eq('vegetable_types.category', 'vegetable')

  if (topData && topData.length > 0) {
    // รวม quantity ตาม vegetable_type_id
    const totals = {}
    for (const item of topData) {
      const id = item.vegetable_type_id
      const vt = item.vegetable_types
      if (!totals[id]) totals[id] = { id, name: vt.name, harvest_days: vt.harvest_days, total: 0 }
      totals[id].total += Number(item.quantity)
    }
    return Object.values(totals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }

  // Fallback: แสดงผักที่ active ทั้งหมด (ยังไม่มีออเดอร์)
  const { data: allVeg } = await supabase
    .from('vegetable_types')
    .select('id, name, harvest_days')
    .eq('is_active', true)
    .eq('category', 'vegetable')
    .limit(6)

  return (allVeg || []).map(v => ({ ...v, total: null }))
}

export default function Home() {
  const [topVegetables, setTopVegetables] = useState([])
  const [vegLoading, setVegLoading] = useState(true)

  useEffect(() => {
    fetchTopVegetables()
      .then(setTopVegetables)
      .finally(() => setVegLoading(false))
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-mint-100" />
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-primary-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-mint-200/40 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Left Content */}
            <div className="animate-slide-up">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-100 text-forest rounded-full text-sm font-medium mb-6">
                <Leaf className="w-4 h-4" />
                🌱 Hydroponic Fresh Farm
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-forest-dark leading-tight mb-6">
                ผักสด{' '}
                <span className="text-gradient">ออร์แกนิก</span>
                <br />ตรงจากฟาร์ม<br />
                ถึงมือคุณ
              </h1>

              <p className="text-lg text-gray-500 mb-8 leading-relaxed max-w-lg">
                สั่งจองผักไฮโดรโปนิกล่วงหน้า เลือกวันรับสินค้าได้เอง
                พร้อมติดตามการเจริญเติบโตของผักของคุณแบบ Real-time
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/products" className="btn-primary btn-lg group">
                  สั่งจองเลย
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link to="/products" className="btn-outline btn-lg">
                  ดูรายการผัก
                </Link>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-4 gap-4 mt-12 pt-8 border-t border-primary-100">
                {stats.map(s => (
                  <div key={s.label}>
                    <p className="text-base font-bold text-forest">{s.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Visual Card — ผักยอดนิยม (Real-time) */}
            <div className="relative animate-fade-in hidden lg:block">
              <div className="card-glass p-8 max-w-sm mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-forest-dark text-lg">ผักยอดนิยม</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {topVegetables.length > 0 && topVegetables[0]?.total !== null
                        ? 'จากยอดสั่งจองจริง'
                        : 'ผักที่มีในระบบ'}
                    </p>
                  </div>
                  <TrendingUp className="w-5 h-5 text-forest" />
                </div>

                <div className="space-y-3">
                  {vegLoading ? (
                    // Skeleton loading
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-primary-50 animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary-200" />
                          <div className="h-3 w-24 bg-primary-200 rounded" />
                        </div>
                        <div className="h-3 w-12 bg-primary-200 rounded" />
                      </div>
                    ))
                  ) : topVegetables.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">
                      <Leaf className="w-8 h-8 mx-auto mb-2 text-primary-300" />
                      ยังไม่มีผักในระบบ
                    </div>
                  ) : (
                    topVegetables.map((v, idx) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-primary-50 hover:bg-primary-100 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-gradient-green rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {idx + 1}
                          </div>
                          <span className="font-medium text-gray-700 text-sm">{v.name}</span>
                        </div>
                        <div className="text-right">
                          {v.total !== null ? (
                            <span className="text-xs text-forest font-semibold">{v.total.toFixed(0)} กก.</span>
                          ) : (
                            <span className="text-xs text-gray-400">{v.harvest_days} วัน</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <Link to="/products" className="btn-primary w-full mt-5">
                  ดูทั้งหมด
                </Link>
              </div>

              {/* Floating Cards */}
              <div className="absolute -top-4 -right-4 card p-3 shadow-glow animate-bounce-soft">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">ออเดอร์ #001</p>
                    <p className="text-xs text-green-600">พร้อมส่งมอบ ✓</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-forest-dark mb-3">ทำไมต้องเลือก HydroFarm?</h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              เราใช้เทคโนโลยีไฮโดรโปนิกที่ทันสมัย ควบคุมสภาพแวดล้อมอย่างแม่นยำ
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map(f => (
              <div key={f.title} className="card-hover text-center">
                <div className={`w-14 h-14 ${f.color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                  <f.icon className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-gray-800 text-lg mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 bg-gradient-soft">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-forest-dark mb-3">วิธีการสั่งจอง</h2>
            <p className="text-gray-400">ง่ายแค่ 4 ขั้นตอน</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {howItWorks.map((step, i) => (
              <div key={step.step} className="relative">
                <div className="card text-center">
                  <div className="w-12 h-12 bg-gradient-green text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg shadow-glow">
                    {step.step}
                  </div>
                  <h3 className="font-bold text-gray-800 mb-2">{step.title}</h3>
                  <p className="text-gray-400 text-sm">{step.desc}</p>
                </div>
                {i < howItWorks.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-300 z-10" />
                )}
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link to="/login" className="btn-primary btn-lg">
              เริ่มต้นสั่งจองเลย <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>


      <Footer />
    </div>
  )
}
