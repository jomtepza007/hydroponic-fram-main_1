-- ========================================================
-- แก้ไข RLS Policy ของตาราง vegetable_types
-- เพื่อให้ Admin และ Farmer สามารถ เพิ่ม แก้ไข และลบ ผัก & หมวดหมู่อุปกรณ์ ได้
-- ========================================================

ALTER TABLE vegetable_types ENABLE ROW LEVEL SECURITY;

-- 1. ลบ Policy เดิม
DROP POLICY IF EXISTS "Anyone can read vegetables" ON vegetable_types;
DROP POLICY IF EXISTS "Farmers and admins manage vegetables" ON vegetable_types;

-- 2. ให้ทุกคนอ่านข้อมูลได้
CREATE POLICY "Anyone can read vegetables" ON vegetable_types
  FOR SELECT USING (true);

-- 3. ให้ Farmer และ Admin จัดการได้ทั้งหมด (INSERT, UPDATE, DELETE)
CREATE POLICY "Farmers and admins manage vegetables" ON vegetable_types
  FOR ALL USING (get_my_role() IN ('farmer', 'admin'))
  WITH CHECK (get_my_role() IN ('farmer', 'admin'));
