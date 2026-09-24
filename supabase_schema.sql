-- ============================================
-- HydroFarm Preorder System — Supabase Schema
-- วาง SQL นี้ใน Supabase Dashboard → SQL Editor
-- ============================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text,
  avatar_url    text,
  email         text,
  role          text NOT NULL DEFAULT 'customer'
                CHECK (role IN ('admin', 'farmer', 'customer')),
  phone         text,
  is_banned     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url, email)
  VALUES (
    new.id,
    COALESCE(
      NULLIF(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, profiles.email),
    full_name = COALESCE(NULLIF(profiles.full_name, ''), EXCLUDED.full_name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 2. RESOURCES (สต็อกทรัพยากร)
-- ============================================
CREATE TABLE IF NOT EXISTS resources (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  type          text CHECK (type IN ('seed', 'fertilizer', 'equipment', 'other')),
  unit          text NOT NULL,
  current_qty   decimal(10,2) NOT NULL DEFAULT 0,
  min_threshold decimal(10,2) NOT NULL DEFAULT 0,
  max_qty       decimal(10,2) DEFAULT 1000,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 3. VEGETABLE TYPES
-- ============================================
CREATE TABLE IF NOT EXISTS vegetable_types (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              text NOT NULL,
  description       text,
  image_url         text,
  harvest_days      integer DEFAULT 35,
  germination_days  integer DEFAULT 7,
  transfer_days     integer DEFAULT 14,
  price_per_kg      decimal(10,2) NOT NULL,
  unit              text NOT NULL DEFAULT 'กก.',
  slots_per_kg      integer DEFAULT 4,
  category          text NOT NULL DEFAULT 'vegetable'
                    CHECK (category IN ('vegetable', 'equipment')),
  resource_id       uuid REFERENCES resources(id) ON DELETE SET NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 4. FARM SETTINGS (Single row)
-- ============================================
CREATE TABLE IF NOT EXISTS farm_settings (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_name    text DEFAULT 'HydroFarm',
  total_slots  integer NOT NULL DEFAULT 500,
  description  text,
  updated_at   timestamptz DEFAULT now(),
  updated_by   uuid REFERENCES profiles(id)
);

-- Insert default settings
INSERT INTO farm_settings (farm_name, total_slots) 
VALUES ('HydroFarm', 500)
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. GROWING AREAS
-- ============================================
CREATE TABLE IF NOT EXISTS growing_areas (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              text NOT NULL,
  zone_code         text,
  total_slots       integer DEFAULT 100,
  farmer_id         uuid REFERENCES profiles(id),
  vegetable_type_id uuid REFERENCES vegetable_types(id) ON DELETE SET NULL,
  hydro_system      text DEFAULT 'NFT',
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 5. ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  uuid NOT NULL REFERENCES profiles(id),
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','confirmed','seeding','growing','ready','completed','cancelled')),
  pickup_date  date NOT NULL,
  total_amount decimal(10,2) NOT NULL DEFAULT 0,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 6. ORDER ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vegetable_type_id uuid NOT NULL REFERENCES vegetable_types(id),
  quantity          decimal(10,2) NOT NULL,
  unit              text NOT NULL,
  price_at_order    decimal(10,2) NOT NULL,
  slots_required    integer DEFAULT 0
);

-- ============================================
-- 7. PLANTING CYCLES
-- ============================================
CREATE TABLE IF NOT EXISTS planting_cycles (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id         uuid REFERENCES order_items(id) ON DELETE CASCADE,
  vegetable_type_id     uuid REFERENCES vegetable_types(id),
  growing_area_id       uuid REFERENCES growing_areas(id),
  farmer_id             uuid REFERENCES profiles(id),
  planting_start_date   date,
  expected_harvest_date date,
  actual_harvest_date   date,
  slots_used            integer DEFAULT 0,
  status                text DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','seeding','growing','ready','done','cancelled')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 8. PLANTING UPDATES (รูปภาพ + สถานะ)
-- ============================================
CREATE TABLE IF NOT EXISTS planting_updates (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  planting_cycle_id uuid NOT NULL REFERENCES planting_cycles(id) ON DELETE CASCADE,
  status            text,
  photo_url         text,
  caption           text,
  updated_by        uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 9. RESOURCES TABLE defined in Section 2 above

-- ============================================
-- 10. RESOURCE TRANSACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS resource_transactions (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id      uuid NOT NULL REFERENCES resources(id),
  transaction_type text CHECK (transaction_type IN ('in', 'out', 'adjust')),
  quantity         decimal(10,2) NOT NULL,
  notes            text,
  created_by       uuid REFERENCES profiles(id),
  related_order_id uuid REFERENCES orders(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 11. NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id),
  title      text NOT NULL,
  message    text,
  type       text DEFAULT 'general',
  is_read    boolean NOT NULL DEFAULT false,
  related_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper function: เช็ค role โดยไม่ผ่าน RLS (ป้องกัน infinite recursion)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- Profiles: ดูได้เฉพาะของตัวเอง
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Profiles: Admin และ Farmer ดู profiles ได้ทั้งหมด (เพื่อดูชื่อ/อีเมลลูกค้าในออเดอร์)
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins and farmers can view all profiles" ON profiles;
CREATE POLICY "Admins and farmers can view all profiles" ON profiles
  FOR SELECT USING (get_my_role() IN ('admin', 'farmer'));

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (get_my_role() = 'admin');

-- Orders: Customer ดูเฉพาะของตัวเอง, Farmer/Admin ดูได้ทั้งหมด
CREATE POLICY "Customers view own orders" ON orders
  FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Farmers and admins view all orders" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('farmer', 'admin')
    )
  );

CREATE POLICY "Customers create orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Farmers and admins update orders" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('farmer', 'admin')
    )
  );

-- Order Items: Customer ดูเฉพาะของตัวเอง, Farmer/Admin ดูได้ทั้งหมด
CREATE POLICY "Customers view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
        AND orders.customer_id = auth.uid()
    )
  );

CREATE POLICY "Farmers and admins view all order items" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('farmer', 'admin')
    )
  );

CREATE POLICY "Customers create order items" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
        AND orders.customer_id = auth.uid()
    )
  );

-- Notifications: ดูเฉพาะของตัวเอง
CREATE POLICY "Users view own notifications" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- Vegetable Types: ทุกคนอ่านได้
ALTER TABLE vegetable_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read vegetables" ON vegetable_types
  FOR SELECT USING (is_active = true);

-- Resources: ทุกคนดูสต็อกได้, Farmer/Admin จัดการได้ทั้งหมด
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Farmers and admins manage resources" ON resources;
DROP POLICY IF EXISTS "Anyone can view resources" ON resources;
CREATE POLICY "Anyone can view resources" ON resources
  FOR SELECT USING (true);
CREATE POLICY "Farmers and admins manage resources" ON resources
  FOR ALL USING (get_my_role() IN ('farmer', 'admin'));

-- Resource Transactions: ทุกคนดูได้, บันทึกการตัดสต็อกตาม order ได้, Farmer/Admin จัดการได้ทั้งหมด
ALTER TABLE resource_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Farmers and admins manage resource transactions" ON resource_transactions;
DROP POLICY IF EXISTS "Anyone view resource transactions" ON resource_transactions;
DROP POLICY IF EXISTS "Allow insert order transactions" ON resource_transactions;
CREATE POLICY "Anyone view resource transactions" ON resource_transactions
  FOR SELECT USING (true);
CREATE POLICY "Allow insert order transactions" ON resource_transactions
  FOR INSERT WITH CHECK (
    transaction_type = 'out' AND related_order_id IS NOT NULL
  );
CREATE POLICY "Farmers and admins manage resource transactions" ON resource_transactions
  FOR ALL USING (get_my_role() IN ('farmer', 'admin'));

-- Planting Cycles: ลูกค้าและผู้ใช้งานทุกคนดูได้, Farmer/Admin จัดการได้ทั้งหมด
ALTER TABLE planting_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Farmers and admins manage planting cycles" ON planting_cycles;
DROP POLICY IF EXISTS "Anyone can view planting cycles" ON planting_cycles;
CREATE POLICY "Anyone can view planting cycles" ON planting_cycles
  FOR SELECT USING (true);
CREATE POLICY "Farmers and admins manage planting cycles" ON planting_cycles
  FOR ALL USING (get_my_role() IN ('farmer', 'admin'));

-- Planting Updates: ลูกค้าและผู้ใช้งานทุกคนดูรูปภาพได้, Farmer/Admin จัดการได้ทั้งหมด
ALTER TABLE planting_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Farmers and admins manage planting updates" ON planting_updates;
DROP POLICY IF EXISTS "Anyone can view planting updates" ON planting_updates;
CREATE POLICY "Anyone can view planting updates" ON planting_updates
  FOR SELECT USING (true);
CREATE POLICY "Farmers and admins manage planting updates" ON planting_updates
  FOR ALL USING (get_my_role() IN ('farmer', 'admin'));

-- Growing Areas: ทุกคนอ่านได้, Farmer/Admin แก้ไขได้
ALTER TABLE growing_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read growing areas" ON growing_areas
  FOR SELECT USING (is_active = true);
CREATE POLICY "Farmers and admins manage growing areas" ON growing_areas
  FOR ALL USING (get_my_role() IN ('farmer', 'admin'));

-- Farm Settings: ทุกคนอ่านได้, Admin แก้ไขได้
ALTER TABLE farm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read farm settings" ON farm_settings
  FOR SELECT USING (true);
CREATE POLICY "Admins manage farm settings" ON farm_settings
  FOR ALL USING (get_my_role() = 'admin');

-- ============================================
-- STORED FUNCTIONS / PROCEDURES (ATOMIC OPERATIONS)
-- ============================================

-- ปรับสต็อกแบบ Atomic ป้องกัน Race Condition และข้าม RLS ด้วย SECURITY DEFINER
CREATE OR REPLACE FUNCTION adjust_resource_qty(r_id uuid, delta decimal)
RETURNS decimal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_qty decimal;
BEGIN
  UPDATE public.resources
  SET current_qty = GREATEST(0, current_qty + delta)
  WHERE id = r_id
  RETURNING current_qty INTO new_qty;
  RETURN new_qty;
END;
$$;
GRANT EXECUTE ON FUNCTION adjust_resource_qty(uuid, decimal) TO authenticated, anon;

-- ตัดสต็อกอุปกรณ์ของคำสั่งซื้อแบบ Atomic ทั้งชุด (Idempotent + Security Definer)
CREATE OR REPLACE FUNCTION deduct_order_equipment_stock(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_deducted_count int := 0;
BEGIN
  -- ตรวจสอบว่า order นี้เคยตัดสต็อกไปแล้วหรือไม่ เพื่อป้องกันการตัดซ้ำ
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
GRANT EXECUTE ON FUNCTION deduct_order_equipment_stock(uuid) TO authenticated, anon;

-- ดึงทรัพยากรที่ใกล้หมด (current_qty <= min_threshold)
CREATE OR REPLACE FUNCTION get_low_stock_resources()
RETURNS SETOF resources AS $$
  SELECT * FROM resources
  WHERE current_qty <= min_threshold
  ORDER BY current_qty ASC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ผักที่สั่งซื้อมากที่สุด คำนวณฝั่ง Database (ไม่จำกัดจำนวนรายการ)
CREATE OR REPLACE FUNCTION get_top_vegetables(limit_count int DEFAULT 10)
RETURNS TABLE (name text, total decimal) AS $$
  SELECT vt.name, COALESCE(SUM(oi.quantity), 0)::decimal as total
  FROM order_items oi
  JOIN vegetable_types vt ON oi.vegetable_type_id = vt.id
  GROUP BY vt.name
  ORDER BY total DESC
  LIMIT limit_count;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- คำนวณพื้นที่การปลูกที่ใช้จริงตามออเดอร์ลูกค้า และแปลงปลูกที่กำหนดไว้เฉพาะของผักชนิดนั้น (Real-time Capacity Calculation)
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
    WHERE is_active = true AND vegetable_type_id = target_vegetable_type_id;
  END IF;

  -- 2. ถ้าไม่มีแปลงเฉพาะของผักชนิดนี้ ให้ดึงจากแปลงทั่วไป หรือ farm_settings
  IF farm_total_slots IS NULL OR farm_total_slots <= 0 THEN
    SELECT COALESCE(SUM(total_slots), 0), 'แปลงรวมทั่วไป'
    INTO farm_total_slots, area_name
    FROM growing_areas
    WHERE is_active = true AND vegetable_type_id IS NULL;
  END IF;

  IF farm_total_slots IS NULL OR farm_total_slots <= 0 THEN
    SELECT COALESCE(total_slots, 500), 'ฟาร์มโดยรวม'
    INTO farm_total_slots, area_name
    FROM farm_settings
    LIMIT 1;
  END IF;

  target_end_date := target_pickup_date;
  target_start_date := (target_pickup_date - (COALESCE(target_harvest_days, 35) || ' days')::interval)::date;

  -- 3. คำนวณ slots ที่ใช้จริงจากออเดอร์ของลูกค้าที่ทับซ้อนช่วงเวลานี้
  WITH active_items AS (
    SELECT 
      oi.id,
      oi.order_id,
      COALESCE(
        NULLIF(oi.slots_required, 0),
        CEIL(oi.quantity * COALESCE(vt.slots_per_kg, 4))
      )::integer as slots,
      o.pickup_date as item_end,
      (o.pickup_date - (COALESCE(vt.harvest_days, 35) || ' days')::interval)::date as item_start
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN vegetable_types vt ON oi.vegetable_type_id = vt.id
    WHERE o.status IN ('pending', 'confirmed', 'seeding', 'growing', 'ready')
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

-- ============================================
-- MIGRATION STATEMENTS (สำหรับอัปเดต DB เดิม)
-- ============================================
ALTER TABLE vegetable_types ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES resources(id) ON DELETE SET NULL;
ALTER TABLE growing_areas ADD COLUMN IF NOT EXISTS vegetable_type_id uuid REFERENCES vegetable_types(id) ON DELETE SET NULL;
ALTER TABLE growing_areas ADD COLUMN IF NOT EXISTS hydro_system text DEFAULT 'NFT';

-- ============================================
-- SUPABASE STORAGE BUCKET
-- สร้าง bucket "growth-photos" ใน Supabase Dashboard → Storage
-- ============================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('growth-photos', 'growth-photos', true);

-- ============================================
-- SAMPLE DATA (ตัวอย่างผัก)
-- ============================================
INSERT INTO vegetable_types (name, description, harvest_days, germination_days, price_per_kg, unit, slots_per_kg, category) VALUES
  ('กรีนโอ๊ค', 'ผักกาดแก้วกรีนโอ๊ค สดกรอบ รสหวาน', 35, 7, 120, 'กก.', 4, 'vegetable'),
  ('เรดโอ๊ค', 'ผักกาดแก้วเรดโอ๊ค สีแดงสวย รสอ่อน', 35, 7, 130, 'กก.', 4, 'vegetable'),
  ('คอสเลตทูซ', 'ผักกาดโรมัน กรอบหวาน เหมาะทำสลัด', 40, 7, 150, 'กก.', 5, 'vegetable'),
  ('บัตเตอร์เฮด', 'ผักกาดบัตเตอร์เฮด ใบนุ่ม เนื้อนิ่ม', 45, 10, 160, 'กก.', 5, 'vegetable'),
  ('ผักชี', 'ผักชีไฮโดรโปนิก กลิ่นหอม สด', 30, 5, 100, 'กก.', 3, 'vegetable'),
  ('ชุดปลูก NFT Starter', 'ชุดปลูกผักไฮโดรโปนิกระบบ NFT สำหรับผู้เริ่มต้น', null, null, 2500, 'ชุด', 0, 'equipment')
ON CONFLICT DO NOTHING;
