import { useEffect, useState } from 'react'
import { Plus, Pencil, PackageMinus, X } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import {
  getResources,
  createResource,
  updateResource,
  addResourceTransaction,
} from '../../api/resources'
import { supabase } from '../../api/supabaseClient'
import toast from 'react-hot-toast'

const TYPE_OPTIONS = ['seed', 'fertilizer', 'equipment', 'other']
const TYPE_LABEL = { seed: 'เมล็ดพันธุ์', fertilizer: 'ปุ๋ย', equipment: 'อุปกรณ์', other: 'อื่นๆ' }

const EMPTY_RESOURCE = { name: '', type: 'seed', unit: '', current_qty: 0, min_threshold: 0, max_qty: 1000, description: '' }

export default function AdminResources() {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)

  // modal states
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null) // null = add new
  const [form, setForm] = useState(EMPTY_RESOURCE)
  const [saving, setSaving] = useState(false)

  // stock adjust modal
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustForm, setAdjustForm] = useState({ transaction_type: 'in', quantity: 1, notes: '' })
  const [adjusting, setAdjusting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    getResources().then(d => setResources(d || [])).catch(console.error).finally(() => setLoading(false))
  }

  // --- Add / Edit Resource ---
  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY_RESOURCE)
    setShowForm(true)
  }

  function openEdit(r) {
    setEditTarget(r)
    setForm({ name: r.name, type: r.type, unit: r.unit, current_qty: r.current_qty, min_threshold: r.min_threshold, max_qty: r.max_qty || 1000, description: r.description || '' })
    setShowForm(true)
  }

  async function handleSaveResource(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editTarget) {
        await updateResource(editTarget.id, {
          name: form.name, type: form.type, unit: form.unit,
          min_threshold: Number(form.min_threshold), max_qty: Number(form.max_qty),
          description: form.description,
        })
        toast.success('แก้ไขทรัพยากรสำเร็จ ✅')
      } else {
        await createResource({
          name: form.name, type: form.type, unit: form.unit,
          current_qty: Number(form.current_qty),
          min_threshold: Number(form.min_threshold),
          max_qty: Number(form.max_qty),
          description: form.description,
        })
        toast.success('เพิ่มทรัพยากรสำเร็จ ✅')
      }
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }

  // --- Adjust Stock ---
  function openAdjust(r) {
    setAdjustTarget(r)
    setAdjustForm({ transaction_type: 'in', quantity: 1, notes: '' })
    setShowAdjust(true)
  }

  async function handleAdjust(e) {
    e.preventDefault()
    setAdjusting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await addResourceTransaction(adjustTarget.id, {
        transaction_type: adjustForm.transaction_type,
        quantity: Number(adjustForm.quantity),
        notes: adjustForm.notes,
        created_by: user?.id,
      })
      toast.success('ปรับสต็อกสำเร็จ ✅')
      setShowAdjust(false)
      load()
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาด')
    } finally { setAdjusting(false) }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="page-title">จัดการทรัพยากร</h1>
              <p className="page-subtitle">สต็อกเมล็ดพันธุ์ ปุ๋ย และอุปกรณ์ (อุปกรณ์ถูกตัดอัตโนมัติเมื่อขาย)</p>
            </div>
            <button id="btn-add-resource" onClick={openAdd} className="btn-primary">
              <Plus className="w-4 h-4" /> เพิ่มทรัพยากร
            </button>
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>ทรัพยากร</th><th>ประเภท</th><th>คงเหลือ</th>
                  <th>ขั้นต่ำ</th><th>ระดับสต็อก</th><th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10"><div className="spinner w-8 h-8 mx-auto" /></td></tr>
                ) : resources.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">ยังไม่มีทรัพยากร</td></tr>
                ) : resources.map(r => {
                  const pct = r.max_qty ? Math.round((r.current_qty / r.max_qty) * 100) : 100
                  const isLow = r.current_qty <= r.min_threshold
                  return (
                    <tr key={r.id}>
                      <td>
                        <p className="font-semibold">{r.name}</p>
                        <p className="text-xs text-gray-400">{r.description}</p>
                      </td>
                      <td>
                        <span className="badge bg-blue-50 text-blue-700">{TYPE_LABEL[r.type] || r.type}</span>
                      </td>
                      <td className="font-bold text-forest">{r.current_qty} {r.unit}</td>
                      <td className="text-sm text-gray-500">{r.min_threshold} {r.unit}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${isLow ? 'bg-red-400' : pct < 50 ? 'bg-yellow-400' : 'bg-forest'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${isLow ? 'text-red-500' : 'text-gray-500'}`}>{pct}%</span>
                          {isLow && <span className="badge badge-cancelled">⚠️</span>}
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            id={`btn-edit-resource-${r.id}`}
                            onClick={() => openEdit(r)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-forest transition-colors"
                            title="แก้ไข"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            id={`btn-adjust-stock-${r.id}`}
                            onClick={() => openAdjust(r)}
                            className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-500 hover:text-forest transition-colors"
                            title="ปรับสต็อก"
                          >
                            <PackageMinus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ====== Modal: Add / Edit Resource ====== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-forest-dark">
                {editTarget ? 'แก้ไขทรัพยากร' : 'เพิ่มทรัพยากรใหม่'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveResource} className="space-y-4">
              <div>
                <label className="label">ชื่อทรัพยากร *</label>
                <input required value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                  className="input" placeholder="เช่น เมล็ดกรีนโอ๊ค" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ประเภท *</label>
                  <select required value={form.type} onChange={e => setForm(s => ({ ...s, type: e.target.value }))} className="input">
                    {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">หน่วย *</label>
                  <input required value={form.unit} onChange={e => setForm(s => ({ ...s, unit: e.target.value }))}
                    className="input" placeholder="เช่น กก. / ชุด" />
                </div>
              </div>

              {!editTarget && (
                <div>
                  <label className="label">จำนวนเริ่มต้น</label>
                  <input type="number" min="0" value={form.current_qty}
                    onChange={e => setForm(s => ({ ...s, current_qty: e.target.value }))} className="input" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ขั้นต่ำ (แจ้งเตือน)</label>
                  <input type="number" min="0" value={form.min_threshold}
                    onChange={e => setForm(s => ({ ...s, min_threshold: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">สูงสุด</label>
                  <input type="number" min="1" value={form.max_qty}
                    onChange={e => setForm(s => ({ ...s, max_qty: e.target.value }))} className="input" />
                </div>
              </div>

              <div>
                <label className="label">รายละเอียด</label>
                <textarea value={form.description}
                  onChange={e => setForm(s => ({ ...s, description: e.target.value }))}
                  rows={2} className="input resize-none" placeholder="รายละเอียดเพิ่มเติม..." />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">ยกเลิก</button>
                <button type="submit" disabled={saving} id="btn-save-resource" className="btn-primary flex-1">
                  {saving ? <><div className="spinner w-4 h-4" /> กำลังบันทึก...</> : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====== Modal: Adjust Stock ====== */}
      {showAdjust && adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-forest-dark">ปรับสต็อก</h2>
                <p className="text-sm text-gray-400">{adjustTarget.name} — คงเหลือ {adjustTarget.current_qty} {adjustTarget.unit}</p>
              </div>
              <button onClick={() => setShowAdjust(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjust} className="space-y-4">
              <div>
                <label className="label">ประเภทการปรับ *</label>
                <select value={adjustForm.transaction_type}
                  onChange={e => setAdjustForm(s => ({ ...s, transaction_type: e.target.value }))} className="input">
                  <option value="in">รับเข้า (+)</option>
                  <option value="out">เบิกออก (-)</option>
                  <option value="adjust">ปรับตามจริง</option>
                </select>
              </div>
              <div>
                <label className="label">จำนวน ({adjustTarget.unit}) *</label>
                <input required type="number" min="0.01" step="0.01" value={adjustForm.quantity}
                  onChange={e => setAdjustForm(s => ({ ...s, quantity: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">หมายเหตุ</label>
                <input value={adjustForm.notes}
                  onChange={e => setAdjustForm(s => ({ ...s, notes: e.target.value }))}
                  className="input" placeholder="เช่น รับเมล็ดพันธุ์จากซัพพลายเออร์" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdjust(false)} className="btn-secondary flex-1">ยกเลิก</button>
                <button type="submit" disabled={adjusting} id="btn-confirm-adjust" className="btn-primary flex-1">
                  {adjusting ? <><div className="spinner w-4 h-4" /> กำลังบันทึก...</> : 'ยืนยัน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
