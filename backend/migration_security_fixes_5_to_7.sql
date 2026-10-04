-- ====================================================================
-- HydroFarm Preorder System: Migration สำหรับข้อ 6 และ ข้อ 7
-- คัดลอกคำสั่งทั้งหมดนี้ไปวางและกด Run ใน Supabase Dashboard → SQL Editor
-- URL โครงการ: https://supabase.com/dashboard/project/ubelccnaljxlfesuarav/sql
-- ====================================================================

-- ====================================================================
-- ข้อ 6: อัปเดต check_farm_capacity ให้นับสถานะ waiting_cycle ด้วย
-- เพื่อป้องกันลูกค้าจองผักเกินความจุแปลงปลูกจริง
-- ====================================================================

CREATE OR REPLACE FUNCTION check_farm_capacity(
  target_pickup_date date,
  target_harvest_days integer DEFAULT 35,
  needed_slots integer DEFAULT 0,
  target_vegetable_type_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  farm_total_slots integer := 0;
  target_start_date date;
  target_end_date date;
  used_slots integer := 0;
  available_slots integer := 0;
  order_count integer := 0;
  area_name text := '';
BEGIN
  -- 1. หาพื้นที่ปลูกที่ผูกกับผักชนิดนี้โดยเฉพาะก่อน
  IF target_vegetable_type_id IS NOT NULL THEN
    SELECT COALESCE(SUM(total_slots), 0), string_agg(name, ', ')
    INTO farm_total_slots, area_name
    FROM growing_areas
    WHERE vegetable_type_id = target_vegetable_type_id AND is_active = true;
  END IF;

  -- 2. ถ้าไม่มีแปลงเฉพาะ ให้ดึงแปลงทั่วไป (vegetable_type_id IS NULL) หรือรวมทุกแปลงที่ active
  IF farm_total_slots = 0 THEN
    SELECT COALESCE(SUM(total_slots), 0), string_agg(name, ', ')
    INTO farm_total_slots, area_name
    FROM growing_areas
    WHERE is_active = true;
  END IF;

  -- 3. Fallback: ถ้ายังไม่มีการตั้งค่าพื้นที่ปลูก ให้ใช้ค่าจาก farm_settings
  IF farm_total_slots = 0 THEN
    SELECT COALESCE(total_slots, 500) INTO farm_total_slots FROM farm_settings LIMIT 1;
    farm_total_slots := COALESCE(farm_total_slots, 500);
    area_name := 'แปลงรวม';
  END IF;

  -- คำนวณช่วงเวลาการปลูกของออเดอร์เป้าหมาย
  target_end_date := target_pickup_date;
  target_start_date := target_pickup_date - (target_harvest_days || ' days')::interval;

  -- คำนวณจำนวนช่องที่ถูกจองแล้วในช่วงเวลานี้ (รวมทั้ง waiting_cycle, pending, confirmed, seeding, growing, ready)
  WITH active_items AS (
    SELECT 
      oi.order_id,
      oi.vegetable_type_id,
      COALESCE(
        oi.slots_required,
        CEIL(oi.quantity * COALESCE(vt.slots_per_kg, 4))
      )::integer as slots,
      o.pickup_date as item_end,
      (o.pickup_date - (COALESCE(vt.harvest_days, 35) || ' days')::interval)::date as item_start
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN vegetable_types vt ON oi.vegetable_type_id = vt.id
    WHERE o.status IN ('waiting_cycle', 'pending', 'confirmed', 'seeding', 'growing', 'ready')
      AND (target_vegetable_type_id IS NULL OR oi.vegetable_type_id = target_vegetable_type_id)
  ),
  overlapping_items AS (
    SELECT * FROM active_items
    WHERE item_start <= target_end_date AND item_end >= target_start_date
  ),
  standalone_cycles AS (
    SELECT 
      pc.id,
      COALESCE(pc.slots_used, 0) as slots,
      COALESCE(pc.expected_harvest_date, pc.planting_start_date + interval '35 days')::date as cycle_end,
      pc.planting_start_date as cycle_start
    FROM planting_cycles pc
    WHERE pc.order_item_id IS NULL
      AND pc.status NOT IN ('done', 'cancelled')
      AND (target_vegetable_type_id IS NULL OR pc.vegetable_type_id = target_vegetable_type_id)
      AND pc.planting_start_date <= target_end_date
      AND COALESCE(pc.expected_harvest_date, pc.planting_start_date + interval '35 days') >= target_start_date
  )
  SELECT 
    COALESCE((SELECT SUM(slots) FROM overlapping_items), 0) +
    COALESCE((SELECT SUM(slots) FROM standalone_cycles), 0),
    COALESCE((SELECT COUNT(DISTINCT order_id) FROM overlapping_items), 0)
  INTO used_slots, order_count;

  available_slots := GREATEST(0, farm_total_slots - used_slots);

  RETURN json_build_object(
    'total', farm_total_slots,
    'used', used_slots,
    'available', available_slots,
    'slots_needed', needed_slots,
    'can_accept', (farm_total_slots > 0 AND available_slots >= needed_slots AND available_slots > 0),
    'occupancy_rate', CASE WHEN farm_total_slots > 0 THEN LEAST(100, ROUND((used_slots::numeric / farm_total_slots::numeric) * 100)) ELSE 100 END,
    'active_orders_count', order_count,
    'target_start_date', target_start_date,
    'target_end_date', target_end_date,
    'area_name', area_name
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ====================================================================
-- ข้อ 7: กระชับสิทธิ์ INSERT ตาราง notifications ป้องกันการยัดแจ้งเตือนสแปม
-- ====================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated users or staff can insert notifications" ON notifications;

-- อนุญาตเฉพาะผู้ใช้ที่ล็อกอินแล้วส่งแจ้งเตือนให้ตนเอง หรือ Farmer/Admin ส่งแจ้งเตือนหาลูกค้าได้
CREATE POLICY "Authenticated users or staff can insert notifications" ON notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth.uid() = user_id 
      OR get_my_role() IN ('farmer', 'admin')
    )
  );
