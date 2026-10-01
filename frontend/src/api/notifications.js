import { supabase } from './supabaseClient'
import { ORDER_STATUS_LABELS, EQUIPMENT_STATUS_LABELS } from '../utils/dateUtils'

/**
 * ดึงรายการแจ้งเตือนของผู้ใช้
 * @param {string} userId
 * @param {number} limit
 */
export async function getMyNotifications(userId, limit = 25) {
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('Could not load notifications:', error.message)
      return []
    }
    return data || []
  } catch (err) {
    console.warn('Error fetching notifications:', err)
    return []
  }
}

/**
 * นับจำนวนแจ้งเตือนที่ยังไม่ได้อ่าน
 * @param {string} userId
 */
export async function getUnreadCount(userId) {
  if (!userId) return 0
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) return 0
    return count || 0
  } catch {
    return 0
  }
}

/**
 * มาร์กแจ้งเตือนรายการหนึ่งว่าอ่านแล้ว
 * @param {string} notificationId
 */
export async function markAsRead(notificationId) {
  if (!notificationId) return
  try {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
  } catch (err) {
    console.warn('Error marking notification as read:', err)
  }
}

/**
 * มาร์กแจ้งเตือนทั้งหมดของผู้ใช้ว่าอ่านแล้ว
 * @param {string} userId
 */
export async function markAllAsRead(userId) {
  if (!userId) return
  try {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
  } catch (err) {
    console.warn('Error marking all notifications as read:', err)
  }
}

/**
 * สร้างการแจ้งเตือนใหม่
 */
export async function createNotification({ userId, title, message, type = 'general', relatedId = null }) {
  if (!userId || !title) return null
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        title,
        message,
        type,
        related_id: relatedId,
        is_read: false,
      }])
      .select()
      .single()

    if (error) {
      console.warn('Could not create notification:', error.message)
      return null
    }
    return data
  } catch (err) {
    console.warn('Error creating notification:', err)
    return null
  }
}

/**
 * แจ้งเตือนลูกค้าเมื่อสถานะออเดอร์เปลี่ยน
 */
export async function notifyOrderStatus(orderId, customerId, newStatus, isEquipment = false) {
  if (!customerId || !orderId || !newStatus) return

  const labelMap = isEquipment ? EQUIPMENT_STATUS_LABELS : ORDER_STATUS_LABELS
  const statusLabel = labelMap[newStatus] || newStatus
  const shortId = orderId.slice(0, 8).toUpperCase()

  let iconPrefix = '📦'
  if (newStatus === 'seeding') iconPrefix = '🌱'
  else if (newStatus === 'growing') iconPrefix = '🌿'
  else if (newStatus === 'ready') iconPrefix = '🎉'
  else if (newStatus === 'completed') iconPrefix = '✅'
  else if (newStatus === 'cancelled') iconPrefix = '❌'

  const title = `${iconPrefix} ออเดอร์ #${shortId} อัปเดตสถานะ`
  const message = `สถานะออเดอร์ของคุณเปลี่ยนเป็น "${statusLabel}" เรียบร้อยแล้ว`

  return createNotification({
    userId: customerId,
    title,
    message,
    type: 'order_status',
    relatedId: orderId,
  })
}

/**
 * แจ้งเตือนลูกค้าเมื่อเกษตรกรอัปโหลดรูปภาพการปลูกใหม่
 */
export async function notifyPlantingPhoto(orderId, customerId, caption = '') {
  if (!customerId || !orderId) return
  const shortId = orderId.slice(0, 8).toUpperCase()

  const title = `📸 มีรูปภาพการปลูกใหม่ในออเดอร์ #${shortId}`
  const message = caption
    ? `ฟาร์มอัปเดตรูปภาพ: "${caption}"`
    : `ฟาร์มได้อัปเดตรูปภาพการเจริญเติบโตของผักในออเดอร์ #${shortId} แล้ว คลิกเพื่อรับชม`

  return createNotification({
    userId: customerId,
    title,
    message,
    type: 'planting_photo',
    relatedId: orderId,
  })
}

/**
 * แจ้งเตือน Farmer & Admin เมื่อมีลูกค้าส่งออเดอร์ใหม่เข้ามา
 */
export async function notifyStaffNewOrder(orderId, totalAmount, customerName = '') {
  if (!orderId) return
  try {
    // ดึงรายชื่อ staff (farmer & admin)
    const { data: staffUsers } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['farmer', 'admin'])

    if (!staffUsers || staffUsers.length === 0) return

    const shortId = orderId.slice(0, 8).toUpperCase()
    const title = `🛒 มีออเดอร์ใหม่ #${shortId}`
    const message = customerName
      ? `ลูกค้า "${customerName}" สั่งซื้อ ยอด ฿${Number(totalAmount || 0).toLocaleString()}`
      : `มีคำสั่งซื้อใหม่ ยอด ฿${Number(totalAmount || 0).toLocaleString()} รอยืนยันรอบปลูก`

    const inserts = staffUsers.map(s => ({
      user_id: s.id,
      title,
      message,
      type: 'new_order',
      related_id: orderId,
      is_read: false,
    }))

    await supabase.from('notifications').insert(inserts)
  } catch (err) {
    console.warn('Could not notify staff:', err)
  }
}

/**
 * แจ้งเตือนลูกค้าเมื่อสร้างคำสั่งซื้อสำเร็จ
 */
export async function notifyCustomerNewOrder(orderId, customerId) {
  if (!customerId || !orderId) return
  const shortId = orderId.slice(0, 8).toUpperCase()
  return createNotification({
    userId: customerId,
    title: `🎉 คำสั่งซื้อ #${shortId} สำเร็จ`,
    message: `คำสั่งซื้อของคุณได้รับการบันทึกแล้ว กำลังรอฟาร์มตรวจสอบและยืนยันรอบปลูก`,
    type: 'new_order',
    relatedId: orderId,
  })
}

