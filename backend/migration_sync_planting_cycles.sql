-- ====================================================================
-- Migration: ซิงค์สถานะรอบการปลูก (planting_cycles) กับออเดอร์ (orders)
-- เพื่อแก้ปัญหารอบปลูกค้างในแปลงปลูกทั้งที่ออเดอร์เสร็จสิ้นหรือยกเลิกไปแล้ว
-- ====================================================================

-- 1. อัปเดตรอบปลูกที่ออเดอร์สถานะ 'completed' หรือ 'delivered' ให้เป็น 'done'
UPDATE planting_cycles pc
SET status = 'done',
    actual_harvest_date = COALESCE(pc.actual_harvest_date, CURRENT_DATE)
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE pc.order_item_id = oi.id
  AND o.status IN ('completed', 'delivered')
  AND pc.status IN ('scheduled', 'seeding', 'growing', 'ready');

-- 2. อัปเดตรอบปลูกที่ออเดอร์สถานะ 'cancelled' ให้เป็น 'cancelled'
UPDATE planting_cycles pc
SET status = 'cancelled'
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE pc.order_item_id = oi.id
  AND o.status = 'cancelled'
  AND pc.status IN ('scheduled', 'seeding', 'growing', 'ready');

-- 3. อัปเดตรอบปลูกที่ออเดอร์ถูกลบออกจากฐานข้อมูลไปแล้ว (Orphaned cycles)
UPDATE planting_cycles pc
SET status = 'cancelled'
WHERE pc.order_item_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.id = pc.order_item_id
  )
  AND pc.status IN ('scheduled', 'seeding', 'growing', 'ready');

-- 3.1 อัปเดตรอบปลูกทดสอบที่ไม่มีชนิดผักและไม่มีออเดอร์ หรือมีจำนวนช่องปลูกเป็น 0 (Dummy / 0-slot cycles)
UPDATE planting_cycles pc
SET status = 'cancelled'
WHERE (COALESCE(pc.slots_used, 0) <= 0 OR (pc.order_item_id IS NULL AND pc.vegetable_type_id IS NULL))
  AND pc.status IN ('scheduled', 'seeding', 'growing', 'ready');

-- ====================================================================
-- 4. Database Trigger: ป้องกันไม่ให้เกิดปัญหา desync ในอนาคตที่ระดับ DB
-- เมื่อตาราง orders มีการเปลี่ยนสถานะ ให้ trigger อัปเดต planting_cycles อัตโนมัติ
-- ====================================================================

CREATE OR REPLACE FUNCTION trg_sync_order_to_planting_cycles()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'delivered') THEN
    UPDATE planting_cycles pc
    SET status = 'done',
        actual_harvest_date = COALESCE(pc.actual_harvest_date, CURRENT_DATE)
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND pc.order_item_id = oi.id
      AND pc.status IN ('scheduled', 'seeding', 'growing', 'ready');

  ELSIF NEW.status = 'cancelled' THEN
    UPDATE planting_cycles pc
    SET status = 'cancelled'
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND pc.order_item_id = oi.id
      AND pc.status IN ('scheduled', 'seeding', 'growing', 'ready');

  ELSIF NEW.status = 'ready' THEN
    UPDATE planting_cycles pc
    SET status = 'ready',
        actual_harvest_date = COALESCE(pc.actual_harvest_date, CURRENT_DATE)
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND pc.order_item_id = oi.id
      AND pc.status IN ('scheduled', 'seeding', 'growing');

  ELSIF NEW.status = 'growing' THEN
    UPDATE planting_cycles pc
    SET status = 'growing'
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND pc.order_item_id = oi.id
      AND pc.status IN ('scheduled', 'seeding');

  ELSIF NEW.status = 'seeding' THEN
    UPDATE planting_cycles pc
    SET status = 'seeding'
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND pc.order_item_id = oi.id
      AND pc.status = 'scheduled';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_orders_cycles ON orders;
CREATE TRIGGER trg_sync_orders_cycles
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_order_to_planting_cycles();
