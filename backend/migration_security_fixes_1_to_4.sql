-- ====================================================================
-- HydroFarm Preorder System: Security & Reliability Migration (ข้อ 1-4)
-- คัดลอกคำสั่งทั้งหมดนี้ไปวางและกด Run ใน Supabase Dashboard → SQL Editor
-- URL โครงการ: https://supabase.com/dashboard/project/ubelccnaljxlfesuarav/sql
-- ====================================================================

-- ====================================================================
-- ข้อ 1: ป้องกันผู้ใช้ทั่วไปเลื่อนสิทธิ์ตนเองเป็น admin และปลดแบนตนเอง
-- (Privilege Escalation Protection & Profile Immutability)
-- ====================================================================

-- 1.1 สร้างฟังก์ชัน Trigger ตรวจสอบการแก้ไขฟิลด์สำคัญใน profiles
CREATE OR REPLACE FUNCTION protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- อนุญาตให้ service_role หรือ database admin ข้ามการตรวจสอบได้ (สำหรับการ migrate หรือ script ภายใน)
  IF (auth.jwt() ->> 'role') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- หากมีการพยายามเปลี่ยนแปลง role, is_banned หรือ customer_type
  IF (OLD.role IS DISTINCT FROM NEW.role OR 
      OLD.is_banned IS DISTINCT FROM NEW.is_banned OR 
      OLD.customer_type IS DISTINCT FROM NEW.customer_type) THEN
    -- ต้องเป็นผู้ใช้ที่มีบทบาทเป็น admin เท่านั้น
    IF get_my_role() != 'admin' THEN
      RAISE EXCEPTION 'ไม่อนุญาตให้แก้ไขสิทธิ์ผู้ใช้งานหรือสถานะบัญชี (role, is_banned, customer_type) ยกเว้นผู้ดูแลระบบ (Admin) เท่านั้น';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_profile_fields();

-- 1.2 ปรับปรุง RLS Policy สำหรับการ UPDATE ตาราง profiles
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ====================================================================
-- ข้อ 2: ป้องกันการเรียกใช้ Stored Procedures / RPC Functions โดยไม่ได้รับอนุญาต
-- (Restricting Anon Access & Enforcing Role Checks inside SECURITY DEFINER Functions)
-- ====================================================================

-- 2.1 RPC: apply_item_discount (ปรับส่วนลดรายสินค้า - สิทธิ์เฉพาะ farmer และ admin)
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
  v_caller_role text;
  v_item RECORD;
  v_order RECORD;
  v_old_rate decimal;
  v_new_rate decimal;
  v_total_before decimal;
  v_discount_amount decimal;
  v_final_price decimal;
  v_order_final_amount decimal;
BEGIN
  -- ตรวจสอบสิทธิ์ผู้เรียกใช้งาน: ต้องเป็น farmer หรือ admin เท่านั้น
  v_caller_role := get_my_role();
  IF v_caller_role NOT IN ('farmer', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่มีสิทธิ์กำหนดส่วนลด (เฉพาะทีมงานเกษตรกรและแอดมินเท่านั้น)');
  END IF;

  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ไม่พบรายการสินค้าที่ระบุ');
  END IF;

  v_old_rate := COALESCE(v_item.discount_rate, 0);
  v_new_rate := GREATEST(0, LEAST(100, COALESCE(p_discount_rate, 0)));
  v_total_before := v_item.quantity * v_item.price_at_order;
  v_discount_amount := ROUND((v_total_before * (v_new_rate / 100.0)), 2);
  v_final_price := v_total_before - v_discount_amount;

  -- 1. อัปเดตรายการสินค้า
  UPDATE order_items
  SET 
    discount_rate = v_new_rate,
    discount_amount = v_discount_amount,
    final_price = v_final_price
  WHERE id = p_order_item_id;

  -- 2. บันทึกประวัติลง discount_logs
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
    COALESCE(p_changed_by, auth.uid()),
    v_old_rate,
    v_new_rate,
    v_discount_amount,
    p_note
  );

  -- 3. หากออเดอร์ได้รับการยืนยันแล้ว ให้คำนวณและอัปเดตยอดสุทธิของ order ทันที
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

-- ถอดถอนสิทธิ์ anon และ public, อนุญาตเฉพาะ authenticated
REVOKE EXECUTE ON FUNCTION apply_item_discount(uuid, decimal, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION apply_item_discount(uuid, decimal, text, uuid) TO authenticated;

-- 2.2 RPC: apply_order_discount (ปรับส่วนลดทั้งออเดอร์ - สิทธิ์เฉพาะ farmer และ admin)
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
  v_caller_role text;
  v_order RECORD;
  v_subtotal decimal := 0;
  v_val decimal := 0;
  v_discount_amount decimal := 0;
  v_final_amount decimal := 0;
BEGIN
  -- ตรวจสอบสิทธิ์ผู้เรียกใช้งาน: ต้องเป็น farmer หรือ admin เท่านั้น
  v_caller_role := get_my_role();
  IF v_caller_role NOT IN ('farmer', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่มีสิทธิ์กำหนดส่วนลด (เฉพาะทีมงานเกษตรกรและแอดมินเท่านั้น)');
  END IF;

  -- 1. ค้นหา Order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ไม่พบออเดอร์ที่ระบุ');
  END IF;

  -- ป้องกันการแก้ไขส่วนลดหากออเดอร์พ้นสถานะเตรียมการแล้ว
  IF v_order.status NOT IN ('waiting_cycle', 'pending', 'scheduling') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่สามารถแก้ไขส่วนลดได้เนื่องจากออเดอร์ได้รับการยืนยันแล้ว');
  END IF;

  -- 2. คำนวณ Subtotal จาก order_items
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
    COALESCE(p_changed_by, auth.uid()),
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

REVOKE EXECUTE ON FUNCTION apply_order_discount(uuid, text, decimal, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION apply_order_discount(uuid, text, decimal, text, uuid) TO authenticated;

-- 2.3 RPC: adjust_resource_qty (ปรับสต็อกทรัพยากร - สิทธิ์เฉพาะ farmer และ admin)
CREATE OR REPLACE FUNCTION adjust_resource_qty(r_id uuid, delta decimal)
RETURNS decimal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_qty decimal;
BEGIN
  -- ตรวจสอบสิทธิ์ผู้เรียกใช้งาน: ต้องเป็น farmer หรือ admin เท่านั้น
  IF get_my_role() NOT IN ('farmer', 'admin') THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ปรับสต็อกทรัพยากร (เฉพาะทีมงานเกษตรกรและแอดมินเท่านั้น)';
  END IF;

  UPDATE public.resources
  SET current_qty = GREATEST(0, current_qty + delta)
  WHERE id = r_id
  RETURNING current_qty INTO new_qty;
  
  RETURN new_qty;
END;
$$;

REVOKE EXECUTE ON FUNCTION adjust_resource_qty(uuid, decimal) FROM anon, public;
GRANT EXECUTE ON FUNCTION adjust_resource_qty(uuid, decimal) TO authenticated;

-- 2.4 RPC: deduct_order_equipment_stock (ตัดสต็อกอุปกรณ์ของออเดอร์ - เฉพาะเจ้าของออเดอร์ หรือ farmer/admin)
CREATE OR REPLACE FUNCTION deduct_order_equipment_stock(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_deducted_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ไม่พบคำสั่งซื้อที่ระบุ');
  END IF;

  -- อนุญาตเฉพาะเจ้าของออเดอร์ หรือเจ้าหน้าที่ (farmer/admin)
  IF v_order.customer_id != auth.uid() AND get_my_role() NOT IN ('farmer', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่มีสิทธิ์ตัดสต็อกสำหรับคำสั่งซื้อนี้');
  END IF;

  -- ตรวจสอบว่า order นี้เคยตัดสต็อกไปแล้วหรือไม่ เพื่อป้องกันการตัดซ้ำ (Idempotent)
  IF EXISTS (SELECT 1 FROM public.resource_transactions WHERE related_order_id = p_order_id) THEN
    RETURN json_build_object('success', true, 'message', 'Already deducted', 'deducted_count', 0);
  END IF;

  FOR v_item IN
    SELECT 
      oi.id as order_item_id,
      oi.quantity,
      vt.name as vegetable_name,
      vt.resource_id
    FROM public.order_items oi
    JOIN public.vegetable_types vt ON oi.vegetable_type_id = vt.id
    WHERE oi.order_id = p_order_id
      AND vt.category = 'equipment'
      AND vt.resource_id IS NOT NULL
  LOOP
    -- ตัดสต็อกใน resources
    UPDATE public.resources
    SET current_qty = GREATEST(0, current_qty - v_item.quantity)
    WHERE id = v_item.resource_id;

    -- บันทึกประวัติใน resource_transactions
    INSERT INTO public.resource_transactions (
      resource_id,
      transaction_type,
      quantity,
      related_order_id,
      notes
    ) VALUES (
      v_item.resource_id,
      'out',
      v_item.quantity,
      p_order_id,
      'ตัดสต็อกอัตโนมัติ: ออเดอร์ ' || UPPER(SUBSTRING(p_order_id::text, 1, 8)) || ' (' || v_item.vegetable_name || ')'
    );

    v_deducted_count := v_deducted_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'deducted_count', v_deducted_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION deduct_order_equipment_stock(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION deduct_order_equipment_stock(uuid) TO authenticated;

-- 2.5 RPC: get_low_stock_resources (ถอดถอนสิทธิ์ anon)
REVOKE EXECUTE ON FUNCTION get_low_stock_resources() FROM anon, public;
GRANT EXECUTE ON FUNCTION get_low_stock_resources() TO authenticated;


-- ====================================================================
-- ข้อ 3: เปิดให้ลูกค้ายกเลิกคำสั่งซื้อของตนเองได้จริง (Customer Order Cancellation)
-- ====================================================================

-- 3.1 RLS Policy ให้ลูกค้ายกเลิกคำสั่งซื้อที่อยู่ในสถานะ waiting_cycle หรือ pending ได้
DROP POLICY IF EXISTS "Customers can cancel own pending orders" ON orders;
CREATE POLICY "Customers can cancel own pending orders" ON orders
  FOR UPDATE
  USING (
    auth.uid() = customer_id 
    AND status IN ('waiting_cycle', 'pending')
  )
  WITH CHECK (
    auth.uid() = customer_id 
    AND status = 'cancelled'
  );

-- 3.2 Trigger ตรวจสอบความถูกต้องของการอัปเดต orders เพื่อป้องกันการแก้ไขราคา/สิทธิ์โดยไม่ได้รับอนุญาต
CREATE OR REPLACE FUNCTION protect_order_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- อนุญาตให้ service_role, admin, และ farmer ดำเนินการอัปเดตคำสั่งซื้อได้เต็มรูปแบบ
  IF (auth.jwt() ->> 'role') = 'service_role' OR auth.uid() IS NULL OR get_my_role() IN ('farmer', 'admin') THEN
    RETURN NEW;
  END IF;

  -- กรณีลูกค้าแก้ไขออเดอร์ของตนเอง
  IF auth.uid() = OLD.customer_id THEN
    -- สามารถยกเลิกได้เฉพาะเมื่อสถานะเดิมเป็น waiting_cycle หรือ pending
    IF OLD.status NOT IN ('waiting_cycle', 'pending') THEN
      RAISE EXCEPTION 'ไม่สามารถยกเลิกคำสั่งซื้อที่ได้รับการดำเนินการแล้วได้';
    END IF;

    -- สถานะใหม่ต้องเป็น cancelled เท่านั้น
    IF NEW.status != 'cancelled' THEN
      RAISE EXCEPTION 'ลูกค้าสามารถเปลี่ยนสถานะเป็นยกเลิก (cancelled) ได้เท่านั้น';
    END IF;

    -- ป้องกันการดัดแปลงข้อมูลสำคัญ เช่น ราคา ยอดเงิน หรือผู้เป็นเจ้าของ
    IF NEW.customer_id != OLD.customer_id OR 
       NEW.total_amount IS DISTINCT FROM OLD.total_amount OR 
       NEW.final_amount IS DISTINCT FROM OLD.final_amount THEN
      RAISE EXCEPTION 'ไม่อนุญาตให้แก้ไขยอดเงินหรือข้อมูลสำคัญของคำสั่งซื้อ';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ไม่มีสิทธิ์แก้ไขคำสั่งซื้อนี้';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_order_updates ON orders;
CREATE TRIGGER trg_protect_order_updates
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION protect_order_updates();


-- ====================================================================
-- ข้อ 4: ย้ายระบบแจ้งเตือนทีมงานไปยัง Database Trigger & RPC ที่ปลอดภัย
-- (Automatic Staff & Customer Notifications on Order Events)
-- ====================================================================

-- 4.1 ฟังก์ชัน RPC notify_staff สำหรับส่งการแจ้งเตือนไปยัง Farmer & Admin ทุกคน (ข้ามข้อจำกัด RLS)
CREATE OR REPLACE FUNCTION notify_staff(
  p_title text,
  p_message text,
  p_type text DEFAULT 'order_status',
  p_order_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff RECORD;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  FOR v_staff IN 
    SELECT id FROM profiles WHERE role IN ('farmer', 'admin')
  LOOP
    INSERT INTO notifications (user_id, title, message, type, related_id, is_read)
    VALUES (v_staff.id, p_title, p_message, p_type, p_order_id, false);
    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'count', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_staff(text, text, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION notify_staff(text, text, text, uuid) TO authenticated;

-- 4.2 Trigger แจ้งเตือน Farmer & Admin และลูกค้า อัตโนมัติเมื่อมีคำสั่งซื้อใหม่ (AFTER INSERT ON orders)
CREATE OR REPLACE FUNCTION trg_on_order_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff RECORD;
  v_customer RECORD;
  v_short_id text;
  v_customer_name text := 'ลูกค้า';
  v_is_equipment boolean;
  v_display_amount decimal;
BEGIN
  v_short_id := UPPER(SUBSTRING(NEW.id::text, 1, 8));
  v_display_amount := COALESCE(NEW.final_amount, NEW.total_amount, 0);
  
  -- ดึงชื่อลูกค้าเพื่อแสดงในการแจ้งเตือน
  SELECT full_name INTO v_customer FROM profiles WHERE id = NEW.customer_id;
  IF FOUND AND v_customer.full_name IS NOT NULL AND v_customer.full_name != '' THEN
    v_customer_name := v_customer.full_name;
  END IF;

  v_is_equipment := (NEW.notes ILIKE '%จัดส่งถึงบ้าน%' OR NEW.notes ILIKE '%📦 จัดส่ง%');

  -- แจ้งเตือน Farmer และ Admin ทุกคนโดยอัตโนมัติ
  FOR v_staff IN 
    SELECT id FROM profiles WHERE role IN ('farmer', 'admin')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM notifications 
      WHERE user_id = v_staff.id 
        AND related_id = NEW.id 
        AND type = 'new_order'
    ) THEN
      INSERT INTO notifications (user_id, title, message, type, related_id, is_read)
      VALUES (
        v_staff.id,
        '🛒 มีออเดอร์ใหม่ #' || v_short_id,
        'ลูกค้า "' || v_customer_name || '" สั่งซื้อ ยอด ฿' || TO_CHAR(v_display_amount, 'FM999,999,990.00') || (CASE WHEN v_is_equipment THEN ' (อุปกรณ์ปลูก)' ELSE ' (รอยืนยันรอบปลูก)' END),
        'new_order',
        NEW.id,
        false
      );
    END IF;
  END LOOP;

  -- แจ้งเตือนยืนยันไปยังลูกค้าเจ้าของคำสั่งซื้อ
  IF NEW.customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM notifications 
      WHERE user_id = NEW.customer_id 
        AND related_id = NEW.id 
        AND type = 'new_order'
    ) THEN
      INSERT INTO notifications (user_id, title, message, type, related_id, is_read)
      VALUES (
        NEW.customer_id,
        '🎉 คำสั่งซื้อ #' || v_short_id || ' สำเร็จ',
        'คำสั่งซื้อของคุณได้รับการบันทึกแล้ว กำลังรอฟาร์มตรวจสอบและยืนยันรอบปลูก',
        'new_order',
        NEW.id,
        false
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_order ON orders;
CREATE TRIGGER trg_notify_new_order
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_on_order_created();

-- 4.3 Trigger แจ้งเตือน Farmer & Admin อัตโนมัติเมื่อลูกค้ายกเลิกคำสั่งซื้อ (AFTER UPDATE OF status ON orders)
CREATE OR REPLACE FUNCTION trg_on_order_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff RECORD;
  v_short_id text;
BEGIN
  -- ทำงานเมื่อคำสั่งซื้อถูกเปลี่ยนสถานะเป็น cancelled
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    v_short_id := UPPER(SUBSTRING(NEW.id::text, 1, 8));

    FOR v_staff IN 
      SELECT id FROM profiles WHERE role IN ('farmer', 'admin')
    LOOP
      INSERT INTO notifications (user_id, title, message, type, related_id, is_read)
      VALUES (
        v_staff.id,
        '⚠️ ลูกค้ายกเลิกออเดอร์ #' || v_short_id,
        'คำสั่งซื้อ #' || v_short_id || ' ถูกยกเลิกโดยลูกค้า',
        'order_status',
        NEW.id,
        false
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_cancelled ON orders;
CREATE TRIGGER trg_notify_order_cancelled
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_on_order_cancelled();
