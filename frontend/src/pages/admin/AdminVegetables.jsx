import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Clock, Leaf, Upload, Camera, X, Search, Image as ImageIcon } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { getVegetables, createVegetable, updateVegetable, deleteVegetable } from '../../api/vegetables'
import { getResources } from '../../api/resources'
import { supabase } from '../../api/supabaseClient'
import toast from 'react-hot-toast'

const EMPTY_FORM = {
  name: '', description: '', price_per_kg: '', unit: 'กก.',
  harvest_days: 30, germination_days: 7, transfer_days: 14,
  slots_per_kg: 4, category: 'vegetable', image_url: '', is_active: true,
  resource_id: null,
}

const CATEGORY_TABS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'vegetable', label: '🥬 ผักไฮโดรโปนิก' },
  { value: 'equipment', label: '🌱 หมวดหมู่อุปกรณ์ & ชุดปลูก' },
]

export default function AdminVegetables() {
  const [vegetables, setVegetables] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => { loadVegetables() }, [])

  async function loadVegetables() {
    try {
      const [vegs, res] = await Promise.all([getVegetables(), getResources()])
      setVegetables(vegs || [])
      setResources(res || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(veg) {
    setForm({ ...veg })
    setEditingId(veg.id)
    setShowForm(true)
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      let finalUrl = ''
      const fileExt = file.name.split('.').pop()
      const fileName = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`

      // 1. ลองอัปโหลดเข้า Supabase Storage
      try {
        const { error: uploadError } = await supabase.storage
          .from('vegetables')
          .upload(fileName, file, { cacheControl: '3600', upsert: true })

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('vegetables')
            .getPublicUrl(fileName)
          finalUrl = publicUrl
        } else {
          // ลอง bucket growth-photos แทน
          const { error: photoErr } = await supabase.storage
            .from('growth-photos')
            .upload(`vegetables/${fileName}`, file, { cacheControl: '3600', upsert: true })
          if (!photoErr) {
            const { data: { publicUrl } } = supabase.storage
              .from('growth-photos')
              .getPublicUrl(`vegetables/${fileName}`)
            finalUrl = publicUrl
          }
        }
      } catch (storageErr) {
        console.warn('Storage upload failed, falling back to base64 Data URL', storageErr)
      }

      // 2. Fallback: แปลงเป็น Data URL เพื่อให้ใช้งานได้ 100%
      if (!finalUrl) {
        finalUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }

      setForm(prev => ({ ...prev, image_url: finalUrl }))
      toast.success('อัปโหลดรูปภาพสำเร็จ 📸')
    } catch (err) {
      console.error(err)
      toast.error('ไม่สามารถอัปโหลดรูปได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        await updateVegetable(editingId, form)
        toast.success('แก้ไขสินค้าสำเร็จ')
      } else {
        await createVegetable(form)
        toast.success('เพิ่มสินค้าสำเร็จ 🌱')
      }
      setShowForm(false)
      await loadVegetables()
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการบันทึก')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`ต้องการลบ "${name}" ใช่ไหม?`)) return
    try {
      await deleteVegetable(id)
      toast.success('ลบสำเร็จ')
      await loadVegetables()
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    }
  }

  const handleChange = e => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  // Filtered list
  const filteredVegetables = vegetables.filter(item => {
    const matchCategory =
      categoryFilter === 'all' || item.category === categoryFilter
    const matchSearch =
      !searchTerm.trim() ||
      item.name?.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase().trim())
    return matchCategory && matchSearch
  })

  // Counts
  const vegCount = vegetables.filter(v => v.category === 'vegetable').length
  const equipCount = vegetables.filter(v => v.category === 'equipment').length

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="page-title">จัดการผัก & หมวดหมู่อุปกรณ์</h1>
              <p className="page-subtitle">จัดการรายการผักไฮโดรโปนิกและอุปกรณ์ชุดปลูกของฟาร์ม</p>
            </div>
            <button id="btn-add-vegetable" onClick={openAdd} className="btn-primary">
              <Plus className="w-4 h-4" />
              เพิ่มสินค้าใหม่
            </button>
          </div>

          {/* Filters & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
            {/* Category Tabs */}
            <div className="flex gap-2 border-b sm:border-b-0 border-gray-200 pb-2 sm:pb-0">
              {CATEGORY_TABS.map(tab => {
                const count =
                  tab.value === 'all'
                    ? vegetables.length
                    : tab.value === 'vegetable'
                    ? vegCount
                    : equipCount
                return (
                  <button
                    key={tab.value}
                    onClick={() => setCategoryFilter(tab.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2
                      ${categoryFilter === tab.value
                        ? 'bg-forest text-white shadow-sm'
                        : 'bg-white text-gray-600 hover:bg-primary-50 border border-gray-200'
                      }`}
                  >
                    {tab.label}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        categoryFilter === tab.value
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า..."
                className="input pl-9 text-sm"
              />
            </div>
          </div>

          {/* Modal Form */}
          {showForm && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-xl text-forest-dark">
                    {editingId ? '✏️ แก้ไขสินค้า' : '🌱 เพิ่มสินค้าใหม่'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSave} className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">ชื่อสินค้า *</label>
                      <input name="name" value={form.name} onChange={handleChange} className="input" required placeholder="เช่น กรีนโอ๊ค หรือ ชุดปลูก 36 ช่อง" />
                    </div>
                    <div>
                      <label className="label">หมวดหมู่ *</label>
                      <select name="category" value={form.category} onChange={handleChange} className="select font-medium">
                        <option value="vegetable">🥬 ผักไฮโดรโปนิก</option>
                        <option value="equipment">🌱 อุปกรณ์และชุดปลูก</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">ราคา (บาท) *</label>
                      <input name="price_per_kg" type="number" step="0.01" value={form.price_per_kg} onChange={handleChange} className="input" required />
                    </div>
                    <div>
                      <label className="label">หน่วยนับ</label>
                      <select name="unit" value={form.unit} onChange={handleChange} className="select">
                        <option>กก.</option>
                        <option>ต้น</option>
                        <option>ชุด</option>
                        <option>ชิ้น</option>
                        <option>ขวด</option>
                        <option>แพ็ค</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label">คำอธิบายสินค้า</label>
                    <textarea name="description" value={form.description} onChange={handleChange} rows={2} className="input resize-none" placeholder="รายละเอียด รสชาติ หรือการใช้งาน..." />
                  </div>

                  {/* Image Upload Component */}
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200">
                    <label className="label mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold text-gray-700">
                        <Camera className="w-4 h-4 text-forest" />
                        รูปภาพสินค้า
                      </span>
                      {form.image_url && (
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                          className="text-xs text-red-500 hover:underline flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> ลบรูปภาพ
                        </button>
                      )}
                    </label>

                    {form.image_url ? (
                      <div className="flex items-center gap-4 p-2 bg-white rounded-xl border border-gray-200">
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                          <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 truncate mb-1">
                            มีรูปภาพพร้อมใช้งาน
                          </p>
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-forest text-xs font-medium rounded-lg cursor-pointer hover:bg-primary-100 transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            {uploadingImage ? 'กำลังอัปโหลด...' : 'เปลี่ยนรูปภาพใหม่'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleImageUpload}
                              disabled={uploadingImage}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className={`w-full flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed rounded-xl cursor-pointer transition-all bg-white
                        ${uploadingImage ? 'opacity-50 border-gray-300' : 'border-primary-200 hover:border-forest hover:bg-primary-50/50'}`}>
                        {uploadingImage ? (
                          <div className="spinner w-6 h-6 text-forest" />
                        ) : (
                          <>
                            <Upload className="w-7 h-7 text-primary-400" />
                            <span className="text-sm font-medium text-gray-700">
                              คลิกเพื่ออัปโหลดรูปภาพจากอุปกรณ์
                            </span>
                            <span className="text-xs text-gray-400">PNG, JPG, WebP</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                        />
                      </label>
                    )}

                    <div className="mt-3">
                      <p className="text-[11px] text-gray-400 mb-1">หรือระบุ URL รูปภาพโดยตรง:</p>
                      <input
                        name="image_url"
                        value={form.image_url}
                        onChange={handleChange}
                        className="input text-xs py-1.5"
                        placeholder="https://images.unsplash.com/..."
                      />
                    </div>
                  </div>

                  {/* Lifecycle Settings for vegetables */}
                  {form.category === 'vegetable' && (
                    <div className="p-4 bg-primary-50 rounded-xl border border-primary-200">
                      <h3 className="font-semibold text-forest mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        ตั้งค่าวงจรชีวิตผัก (วัน)
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="label text-xs">เวลาปลูกทั้งหมด</label>
                          <input name="harvest_days" type="number" value={form.harvest_days} onChange={handleChange} className="input" />
                        </div>
                        <div>
                          <label className="label text-xs">เพาะเมล็ด</label>
                          <input name="germination_days" type="number" value={form.germination_days} onChange={handleChange} className="input" />
                        </div>
                        <div>
                          <label className="label text-xs">ช่องปลูก/หน่วย</label>
                          <input name="slots_per_kg" type="number" value={form.slots_per_kg} onChange={handleChange} className="input" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Equipment: เชื่อมกับ resource */}
                  {form.category === 'equipment' && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                      <h3 className="font-semibold text-amber-700 mb-3 text-sm">🔗 ผูกกับทรัพยากร (ตัดสต็อกอัตโนมัติเมื่อขาย)</h3>
                      <select
                        name="resource_id"
                        value={form.resource_id || ''}
                        onChange={e => setForm(f => ({ ...f, resource_id: e.target.value || null }))}
                        className="select"
                      >
                        <option value="">— ไม่ผูกกับทรัพยากร —</option>
                        {resources.map(r => (
                          <option key={r.id} value={r.id}>{r.name} (คงเหลือ: {r.current_qty} {r.unit})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                    <button type="submit" disabled={saving || uploadingImage} className="btn-primary flex-1">
                      {saving ? <><div className="spinner w-4 h-4" /> กำลังบันทึก...</> : 'บันทึก'}
                    </button>
                    <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">
                      ยกเลิก
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>หมวดหมู่</th>
                  <th>ราคา</th>
                  <th>วงจรชีวิต</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10"><div className="spinner w-8 h-8 mx-auto" /></td></tr>
                ) : filteredVegetables.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">
                      <Leaf className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p>ไม่พบรายการสินค้าในหมวดหมู่นี้</p>
                    </td>
                  </tr>
                ) : (
                  filteredVegetables.map(veg => (
                    <tr key={veg.id} className="hover:bg-primary-50/40 transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          {veg.image_url ? (
                            <img src={veg.image_url} alt={veg.name} className="w-10 h-10 rounded-xl object-cover border border-gray-100" />
                          ) : (
                            <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                              <Leaf className="w-5 h-5 text-primary-300" />
                            </div>
                          )}
                          <div>
                            <span className="font-semibold text-gray-800 block text-sm">{veg.name}</span>
                            {veg.description && (
                              <span className="text-xs text-gray-400 line-clamp-1 max-w-[220px]">
                                {veg.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${veg.category === 'vegetable' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                          {veg.category === 'vegetable' ? '🥬 ผักไฮโดร' : '🌱 อุปกรณ์ & ชุดปลูก'}
                        </span>
                      </td>
                      <td className="font-semibold text-forest">฿{Number(veg.price_per_kg).toLocaleString()} / {veg.unit}</td>
                      <td>
                        {veg.category === 'vegetable' && veg.harvest_days ? (
                          <span className="flex items-center gap-1 text-sm text-gray-600">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {veg.harvest_days} วัน
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">— พร้อมจัดส่ง —</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${veg.is_active ? 'badge-ready' : 'badge-cancelled'}`}>
                          {veg.is_active ? 'เปิดขาย' : 'ปิด'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(veg)}
                            className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-forest transition-colors"
                            title="แก้ไข"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(veg.id, veg.name)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="ลบ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
