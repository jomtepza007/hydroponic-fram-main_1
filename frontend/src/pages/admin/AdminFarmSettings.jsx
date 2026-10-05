import { useEffect, useState } from 'react'
import { Save, UserCheck, Clock, Layers, AlertTriangle } from 'lucide-react'
import Sidebar from '../../components/layout/Sidebar'
import { getFarmSettings, updateFarmSettings } from '../../api/reports'
import { supabase } from '../../api/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { formatDateTh } from '../../utils/dateUtils'
import toast from 'react-hot-toast'

export default function AdminFarmSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState({ farm_name: '', total_slots: 0, description: '' })
  const [currentAreaSlots, setCurrentAreaSlots] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [settingsData, { data: areasData }] = await Promise.all([
        getFarmSettings(),
        supabase.from('growing_areas').select('total_slots')
      ])
      if (settingsData) setSettings(settingsData)
      if (areasData) {
        const sum = areasData.reduce((s, a) => s + (Number(a.total_slots) || 0), 0)
        setCurrentAreaSlots(sum)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    const targetSlots = Number(settings.total_slots) || 0
    if (currentAreaSlots > 0 && targetSlots < currentAreaSlots) {
      toast.error(
        `ไม่สามารถบันทึกได้: ไม่สามารถตั้งค่าความจุฟาร์ม (${targetSlots.toLocaleString()} ช่อง) ต่ำกว่าจำนวนช่องปลูกของแปลงที่มีอยู่แล้ว (${currentAreaSlots.toLocaleString()} ช่อง) กรุณาปรับขนาดแปลงในหน้า "จัดการพื้นที่ปลูก" ก่อน`
      )
      return
    }

    setSaving(true)
    try {
      const updated = await updateFarmSettings(settings, user?.id)
      if (updated) setSettings(updated)
      toast.success('บันทึกการตั้งค่าสำเร็จ ✅')
    } catch {
      toast.error('เกิดข้อผิดพลาดในการบันทึก')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="page-title mb-2">ตั้งค่าฟาร์ม</h1>
          <p className="page-subtitle mb-8">กำหนดเพดานความจุสูงสุดและข้อมูลพื้นฐานของฟาร์ม</p>
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">จำนวนช่องปลูกสูงสุดทั้งฟาร์ม (slots)</label>
                <span className="text-xs text-gray-500 font-medium">
                  แปลงจริงใช้งานแล้ว: <strong className="text-forest font-bold">{currentAreaSlots.toLocaleString()} ช่อง</strong>
                </span>
              </div>
              <input
                type="number"
                min={currentAreaSlots || 1}
                value={settings.total_slots || 0}
                onChange={e => setSettings(s => ({ ...s, total_slots: Number(e.target.value) }))}
                className="input"
              />
              {currentAreaSlots > (Number(settings.total_slots) || 0) ? (
                <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>
                      แปลงปลูกจริงรวมกัน ({currentAreaSlots} ช่อง) เกินกว่าความจุที่ตั้งไว้ ({settings.total_slots || 0} ช่อง)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, total_slots: currentAreaSlots }))}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs whitespace-nowrap transition-colors self-end sm:self-auto"
                  >
                    ปรับเป็น {currentAreaSlots} ช่อง ทันที
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1.5">
                  ⚙️ เพดานความจุสูงสุดของฟาร์ม: ผลรวมของช่องปลูกในหน้า "จัดการพื้นที่ปลูก" จะถูกควบคุมไม่ให้เกินตัวเลขนี้
                </p>
              )}
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

            {settings.updated_at && (
              <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-forest" />
                  แก้ไขล่าสุดโดย: <strong className="text-gray-700 font-semibold">{settings.profiles?.full_name || settings.profiles?.email || 'ผู้ดูแลระบบ'}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDateTh(settings.updated_at, 'd MMMM yyyy HH:mm')}
                </span>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
