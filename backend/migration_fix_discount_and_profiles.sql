-- ====================================================================
-- HydroFarm Preorder System: Migration สำหรับแก้ไขปัญหาตารางและคอลัมน์ที่ขาดหาย
-- คัดลอกคำสั่งทั้งหมดนี้ไปวางและกด Run ใน Supabase Dashboard → SQL Editor
-- URL โครงการ: https://supabase.com/dashboard/project/ubelccnaljxlfesuarav/sql
-- ====================================================================

-- 1. เพิ่มคอลัมน์ประเภทลูกค้า (customer_type) ในตาราง profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'ทั่วไป';

-- 2. เพิ่มคอลัมน์ยอดรวมหลังหักส่วนลด (final_amount) ในตาราง orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS final_amount decimal(10,2);

-- 2.1 อัปเดต CHECK constraint ของตาราง orders เพื่อให้รองรับสถานะ 'waiting_cycle'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('waiting_cycle', 'pending', 'confirmed', 'seeding', 'growing', 'ready', 'completed', 'cancelled'));

-- 3. เพิ่มคอลัมน์ส่วนลดต่อรายการในตาราง order_items
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS discount_rate decimal(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_price decimal(10,2);

-- 4. เพิ่มคอลัมน์ current_slots_used ในตาราง growing_areas (แปลงปลูก)
ALTER TABLE growing_areas 
ADD COLUMN IF NOT EXISTS current_slots_used integer DEFAULT 0;

-- 5. สร้างตาราง discount_logs สำหรับบันทึกประวัติการให้ส่วนลด
CREATE TABLE IF NOT EXISTS discount_logs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id   uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  changed_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  old_rate        decimal(5,2) DEFAULT 0,
  new_rate        decimal(5,2) DEFAULT 0,
  discount_amount decimal(10,2) DEFAULT 0,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 6. กำหนด Row Level Security (RLS) สำหรับ discount_logs
ALTER TABLE discount_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view discount logs" ON discount_logs;
CREATE POLICY "Anyone can view discount logs" ON discount_logs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Farmers and admins manage discount logs" ON discount_logs;
CREATE POLICY "Farmers and admins manage discount logs" ON discount_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('farmer', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('farmer', 'admin')
    )
  );

-- 7. สร้างฟังก์ชัน RPC apply_item_discount สำหรับคำนวณและบันทึกส่วนลดแบบ Atomic
CREATE OR REPLACE FUNCTION apply_item_discount(
  p_order_item_id uuid,
  p_discount_rate decimal,
  p_note text DEFAULT NULL,
  p_changed_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_old_rate decimal;
  v_new_rate decimal;
  v_total_before decimal;
  v_discount_amount decimal;
  v_final_price decimal;
  v_order_final_amount decimal;
BEGIN
  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Item not found');
  END IF;

  v_old_rate := COALESCE(v_item.discount_rate, 0);
  v_new_rate := GREATEST(0, LEAST(100, COALESCE(p_discount_rate, 0)));
  v_total_before := v_item.quantity * v_item.price_at_order;
  v_discount_amount := ROUND((v_total_before * (v_new_rate / 100.0)), 2);
  v_final_price := v_total_before - v_discount_amount;

  -- 1. อัปเดตรายการสินค้า order_items
  UPDATE order_items
  SET 
    discount_rate = v_new_rate,
    discount_amount = v_discount_amount,
    final_price = v_final_price
  WHERE id = p_order_item_id;

  -- 2. บันทึก Log การปรับเปลี่ยนลง discount_logs
  INSERT INTO discount_logs (
    order_id,
    order_item_id,
    changed_by,
    old_rate,
    new_rate,
    discount_amount,
    note
  ) VALUES (
    v_item.order_id,
    p_order_item_id,
    p_changed_by,
    v_old_rate,
    v_new_rate,
    v_discount_amount,
    p_note
  );

  -- 3. หากออเดอร์ได้รับการยืนยันแล้ว ให้คำนวณและอัปเดตยอดสุทธิของ order (orders.final_amount)
  SELECT * INTO v_order FROM orders WHERE id = v_item.order_id;
  IF v_order.status NOT IN ('pending', 'cancelled') THEN
    SELECT COALESCE(SUM(COALESCE(final_price, quantity * price_at_order)), 0)
    INTO v_order_final_amount
    FROM order_items
    WHERE order_id = v_item.order_id;

    UPDATE orders
    SET final_amount = v_order_final_amount, updated_at = now()
    WHERE id = v_item.order_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'discount_rate', v_new_rate,
    'discount_amount', v_discount_amount,
    'final_price', v_final_price
  );
END;
$$;

-- ให้สิทธิ์รันฟังก์ชันสำหรับ authenticated และ anon
GRANT EXECUTE ON FUNCTION apply_item_discount(uuid, decimal, text, uuid) TO authenticated, anon;

-- ====================================================================
-- 8. ปรับปรุง Row Level Security (RLS) สำหรับตาราง notifications
-- เพื่อให้ทุก role สามารถส่ง Notification ข้ามผู้ใช้ได้ (INSERT)
-- และเจ้าของแจ้งเตือนสามารถอ่าน/อัปเดตสถานะการอ่านของตนเองได้ (SELECT, UPDATE)
-- ====================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Anyone can insert notifications" ON notifications;

CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

