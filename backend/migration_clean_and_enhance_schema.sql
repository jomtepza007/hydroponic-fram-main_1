-- ====================================================================
-- HydroFarm Preorder System: Database Schema Clean & Enhancement
-- รันคำสั่งนี้ใน Supabase Dashboard → SQL Editor
-- URL โครงการ: https://supabase.com/dashboard/project/ubelccnaljxlfesuarav/sql
-- ====================================================================

-- 1. ลบคอลัมน์ที่ไม่ได้ใช้งานออกจากตาราง growing_areas (แปลงปลูก)
ALTER TABLE public.growing_areas DROP COLUMN IF EXISTS hydro_system;
ALTER TABLE public.growing_areas DROP COLUMN IF EXISTS current_slots_used;
ALTER TABLE public.growing_areas DROP COLUMN IF EXISTS farmer_id;

-- 2. ลบคอลัมน์ที่ไม่ได้ใช้งานออกจากตาราง vegetable_types (ชนิดผัก)
ALTER TABLE public.vegetable_types DROP COLUMN IF EXISTS transfer_days;

-- 3. ตรวจสอบและรับรองความพร้อมของคอลัมน์ที่ใช้งานจริง
-- actual_harvest_date ใน planting_cycles (มีอยู่แล้ว มั่นใจว่าเป็น type date)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'planting_cycles' AND column_name = 'actual_harvest_date'
  ) THEN
    ALTER TABLE public.planting_cycles ADD COLUMN actual_harvest_date date;
  END IF;
END $$;

-- updated_by ใน farm_settings (มีอยู่แล้ว มั่นใจว่าผูกกับ profiles)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'farm_settings' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE public.farm_settings ADD COLUMN updated_by uuid REFERENCES public.profiles(id);
  END IF;
END $$;
