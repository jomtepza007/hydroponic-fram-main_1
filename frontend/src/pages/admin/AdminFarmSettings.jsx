import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { getFarmSettings, updateFarmSettings } from '../../api/reports'
import toast from 'react-hot-toast'

export default function AdminFarmSettings() {
  const [settings, setSettings] = useState({ farm_name: '', total_slots: 0, description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getFarmSettings().then(d => d && setSettings(d)).catch(console.error)
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateFarmSettings(settings)
      toast.success('บันทึกการตั้งค่าสำเร็จ ✅')
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="page-title mb-2">ตั้งค่าฟาร์ม</h1>
          <p className="page-subtitle mb-8">กำหนดความจุและข้อมูลพื้นฐานของฟาร์ม</p>
          <form onSubmit={handleSave} className="card space-y-5">
            <div>
              <label className="label">ชื่อฟาร์ม</label>
              <input
                value={settings.farm_name || ''}
                onChange={e => setSettings(s => ({ ...s, farm_name: e.target.value }))}
                className="input" placeholder="HydroFarm"
              />
            </div>
            <div>
              <label className="label">จำนวนช่องปลูกทั้งหมด (slots)</label>
              <input
                type="number"
                value={settings.total_slots || 0}
                onChange={e => setSettings(s => ({ ...s, total_slots: Number(e.target.value) }))}
                className="input"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                ⚙️ ระบบจะใช้ตัวเลขนี้ตรวจสอบความจุก่อนรับออเดอร์ทุกครั้ง
              </p>
            </div>
            <div>
              <label className="label">รายละเอียดฟาร์ม</label>
              <textarea
                value={settings.description || ''}
                onChange={e => setSettings(s => ({ ...s, description: e.target.value }))}
                rows={3} className="input resize-none"
                placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับฟาร์ม..."
              />
            </div>

            <div className="p-4 bg-primary-50 rounded-xl border border-primary-200">
              <h3 className="font-semibold text-forest mb-2">ℹ️ วิธีคำนวณความจุ</h3>
              <p className="text-sm text-gray-600">
                เมื่อลูกค้าสั่งผัก ระบบจะคำนวณ: จำนวน × ช่องปลูก/หน่วย
                แล้วเปรียบเทียบกับช่องว่างในวันที่เลือก
              </p>
            </div>

            <button type="submit" disabled={saving} id="btn-save-settings" className="btn-primary w-full">
              {saving ? <><div className="spinner w-4 h-4" /> กำลังบันทึก...</> : <><Save className="w-4 h-4" /> บันทึกการตั้งค่า</>}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
