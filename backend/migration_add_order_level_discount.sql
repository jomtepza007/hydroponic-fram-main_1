-- ====================================================================
-- HydroFarm Preorder System: Migration สำหรับเพิ่มระบบส่วนลดทั้งออเดอร์ (Order-Level Discount)
-- คัดลอกคำสั่งทั้งหมดนี้ไปวางและกด Run ใน Supabase Dashboard → SQL Editor
-- URL โครงการ: https://supabase.com/dashboard/project/ubelccnaljxlfesuarav/sql
-- ====================================================================

-- 1. เพิ่มคอลัมน์ส่วนลดระดับออเดอร์ในตาราง orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS order_discount_type text DEFAULT NULL,    -- 'amount' (บาท) หรือ 'percent' (%)
ADD COLUMN IF NOT EXISTS order_discount_value decimal(10,2) DEFAULT 0, -- ค่าที่กรอก (เช่น 100 บาท หรือ 10%)
ADD COLUMN IF NOT EXISTS order_discount_amount decimal(10,2) DEFAULT 0, -- จำนวนเงินส่วนลดที่คำนวณได้เป็นบาท
ADD COLUMN IF NOT EXISTS order_discount_note text DEFAULT NULL;     -- หมายเหตุส่วนลด

-- 2. ปรับปรุงตาราง discount_logs ให้ order_item_id สามารถเป็น NULL ได้ (สำหรับส่วนลดทั้งออเดอร์)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'discount_logs' AND column_name = 'order_item_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE discount_logs ALTER COLUMN order_item_id DROP NOT NULL;
  END IF;
END $$;

-- 3. เพิ่มคอลัมน์ discount_type และ discount_value ใน discount_logs
ALTER TABLE discount_logs 
ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'item',
ADD COLUMN IF NOT EXISTS discount_value decimal(10,2) DEFAULT 0;

-- 4. สร้างหรืออัปเดตฟังก์ชัน RPC apply_order_discount สำหรับบันทึกส่วนลดระดับออเดอร์แบบ Atomic
CREATE OR REPLACE FUNCTION apply_order_discount(
  p_order_id uuid,
  p_discount_type text,       -- 'amount', 'percent', หรือ NULL (ล้างส่วนลด)
  p_discount_value decimal,   -- จำนวนเงิน หรือ เปอร์เซ็นต์
  p_note text DEFAULT NULL,
  p_changed_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_subtotal decimal := 0;
  v_val decimal := 0;
  v_discount_amount decimal := 0;
  v_final_amount decimal := 0;
BEGIN
  -- 1. ค้นหา Order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ไม่พบออเดอร์ที่ระบุ');
  END IF;

  -- ป้องกันการแก้ไขส่วนลดหากออเดอร์ได้รับการยืนยันแล้ว
  IF v_order.status NOT IN ('waiting_cycle', 'pending', 'scheduling') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่สามารถแก้ไขส่วนลดได้เนื่องจากออเดอร์ได้รับการยืนยันแล้ว');
  END IF;

  -- 2. คำนวณ Subtotal จาก order_items (หลังหักส่วนลดต่อรายการ)
  SELECT COALESCE(SUM(COALESCE(final_price, quantity * price_at_order)), 0)
  INTO v_subtotal
  FROM order_items
  WHERE order_id = p_order_id;

  v_val := GREATEST(0, COALESCE(p_discount_value, 0));

  -- 3. คำนวณยอดเงินส่วนลดตามประเภท
  IF p_discount_type = 'percent' THEN
    v_val := LEAST(100, v_val);
    v_discount_amount := ROUND((v_subtotal * (v_val / 100.0)), 2);
  ELSIF p_discount_type = 'amount' THEN
    v_discount_amount := LEAST(v_subtotal, v_val);
  ELSE
    p_discount_type := NULL;
    v_val := 0;
    v_discount_amount := 0;
  END IF;

  v_final_amount := GREATEST(0, v_subtotal - v_discount_amount);

  -- 4. อัปเดตตาราง orders
  UPDATE orders
  SET 
    order_discount_type = p_discount_type,
    order_discount_value = v_val,
    order_discount_amount = v_discount_amount,
    order_discount_note = p_note,
    final_amount = v_final_amount,
    updated_at = now()
  WHERE id = p_order_id;

  -- 5. บันทึก Log ลง discount_logs
  INSERT INTO discount_logs (
    order_id,
    order_item_id,
    changed_by,
    discount_type,
    discount_value,
    discount_amount,
    note
  ) VALUES (
    p_order_id,
    NULL,
    p_changed_by,
    CASE 
      WHEN p_discount_type IS NULL THEN 'order_clear'
      WHEN p_discount_type = 'percent' THEN 'order_percent'
      ELSE 'order_amount'
    END,
    v_val,
    v_discount_amount,
    p_note
  );

  RETURN json_build_object(
    'success', true,
    'order_discount_type', p_discount_type,
    'order_discount_value', v_val,
    'order_discount_amount', v_discount_amount,
    'final_amount', v_final_amount,
    'subtotal', v_subtotal
  );
END;
$$;

-- ให้สิทธิ์รันฟังก์ชันสำหรับ authenticated และ anon
GRANT EXECUTE ON FUNCTION apply_order_discount(uuid, text, decimal, text, uuid) TO authenticated, anon;
