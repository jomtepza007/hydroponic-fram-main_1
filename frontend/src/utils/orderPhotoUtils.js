/**
 * Utility functions for robust order photo management
 * Dual-stores photos in planting_updates (relational) AND order.notes (in-document)
 * to guarantee 100% visibility for customers regardless of remote Supabase RLS restrictions.
 */

const PHOTO_REGEX = /<!--PHOTOS:([\s\S]*?)-->/

/**
 * ดึงรูปภาพทั้งหมดของออเดอร์จากทั้ง planting_updates และ order.notes
 */
export function extractPhotosFromOrder(order) {
  if (!order) return []

  const photosMap = new Map()

  // 1. ดึงจาก order_items -> planting_cycles -> planting_updates (โครงสร้าง Supabase)
  if (order.order_items && Array.isArray(order.order_items)) {
    for (const item of order.order_items) {
      if (item.planting_cycles && Array.isArray(item.planting_cycles)) {
        for (const cycle of item.planting_cycles) {
          if (cycle.planting_updates && Array.isArray(cycle.planting_updates)) {
            for (const update of cycle.planting_updates) {
              if (update.photo_url) {
                const key = update.photo_url.slice(0, 100)
                photosMap.set(key, {
                  id: update.id || `upd_${Date.now()}_${Math.random()}`,
                  photo_url: update.photo_url,
                  caption: update.caption || '',
                  status: update.status || order.status || '',
                  created_at: update.created_at || new Date().toISOString(),
                })
              }
            }
          }
        }
      }
    }
  }

  // 2. ดึงจาก order.notes (แท็ก <!--PHOTOS:[...]-->)
  if (order.notes && typeof order.notes === 'string') {
    const match = order.notes.match(PHOTO_REGEX)
    if (match && match[1]) {
      try {
        const embeddedPhotos = JSON.parse(match[1])
        if (Array.isArray(embeddedPhotos)) {
          for (const p of embeddedPhotos) {
            if (p && p.photo_url) {
              const key = p.photo_url.slice(0, 100)
              if (!photosMap.has(key)) {
                photosMap.set(key, {
                  id: p.id || `emb_${Date.now()}_${Math.random()}`,
                  photo_url: p.photo_url,
                  caption: p.caption || '',
                  status: p.status || order.status || '',
                  created_at: p.created_at || new Date().toISOString(),
                })
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to parse embedded photos from order notes', err)
      }
    }
  }

  // แปลง Map เป็น Array และเรียงลำดับตามวันที่สร้าง (เก่าไปใหม่ หรือ ใหม่ไปเก่า)
  const list = Array.from(photosMap.values())
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

/**
 * เพิ่มรูปภาพใหม่ลงใน order.notes
 */
export function appendPhotoToOrderNotes(currentNotes = '', photoObj) {
  let existingPhotos = []
  let baseNotes = currentNotes || ''

  const match = baseNotes.match(PHOTO_REGEX)
  if (match && match[1]) {
    try {
      existingPhotos = JSON.parse(match[1])
      if (!Array.isArray(existingPhotos)) existingPhotos = []
    } catch {
      existingPhotos = []
    }
    baseNotes = baseNotes.replace(PHOTO_REGEX, '').trim()
  }

  // ตรวจสอบรูปซ้ำ
  const alreadyExists = existingPhotos.some(p => p.photo_url === photoObj.photo_url)
  if (!alreadyExists) {
    existingPhotos.push({
      id: photoObj.id || `p_${Date.now()}`,
      photo_url: photoObj.photo_url,
      caption: photoObj.caption || '',
      status: photoObj.status || '',
      created_at: photoObj.created_at || new Date().toISOString(),
    })
  }

  const tag = `<!--PHOTOS:${JSON.stringify(existingPhotos)}-->`
  return baseNotes ? `${baseNotes}\n\n${tag}` : tag
}

/**
 * ตัดแท็กรูปภาพออกจาก order.notes เพื่อให้แสดงข้อความโน้ต/ที่อยู่จัดส่งได้อย่างสะอาดตา
 */
export function cleanOrderNotes(notes = '') {
  if (!notes) return ''
  return notes.replace(PHOTO_REGEX, '').trim()
}
