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
  customer_type text NOT NULL DEFAULT 'ทั่วไป',
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
  vegetable_type_id uuid REFERENCES vegetable_types(id) ON DELETE SET NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- 5. ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  uuid NOT NULL REFERENCES profiles(id),
  status       text NOT NULL DEFAULT 'waiting_cycle'
               CHECK (status IN ('waiting_cycle','pending','confirmed','seeding','growing','ready','completed','cancelled')),
  pickup_date  date NOT NULL,
  total_amount decimal(10,2) NOT NULL DEFAULT 0,
  final_amount decimal(10,2),
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
  slots_required    integer DEFAULT 0,
  discount_rate     decimal(5,2) DEFAULT 0,
  discount_amount   decimal(10,2) DEFAULT 0,
  final_price       decimal(10,2)
);

-- ============================================
-- 6.1 DISCOUNT LOGS (ประวัติการปรับส่วนลด)
-- ============================================
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

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (get_my_role() = 'admin');

-- Trigger ป้องกันผู้ใช้ทั่วไปแก้ไข role, is_banned, หรือ customer_type (ข้อ 1)
CREATE OR REPLACE FUNCTION protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (OLD.role IS DISTINCT FROM NEW.role OR 
      OLD.is_banned IS DISTINCT FROM NEW.is_banned OR 
      OLD.customer_type IS DISTINCT FROM NEW.customer_type) THEN
    IF get_my_role() != 'admin' THEN
      RAISE EXCEPTION 'ไม่อนุญาตให้แก้ไขสิทธิ์ผู้ใช้งานหรือสถานะบัญชี (role, is_banned, customer_type) ยกเว้น Admin เท่านั้น';
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

-- ลูกค้ายกเลิกคำสั่งซื้อของตนเองได้เมื่อสถานะเป็น waiting_cycle หรือ pending (ข้อ 3)
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

-- Trigger ป้องกันการดัดแปลงข้อมูลคำสั่งซื้อสำคัญเมื่อลูกค้ายกเลิก (ข้อ 3)
CREATE OR REPLACE FUNCTION protect_order_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' OR auth.uid() IS NULL OR get_my_role() IN ('farmer', 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.customer_id THEN
    IF OLD.status NOT IN ('waiting_cycle', 'pending') THEN
      RAISE EXCEPTION 'ไม่สามารถยกเลิกคำสั่งซื้อที่ได้รับการดำเนินการแล้วได้';
    END IF;

    IF NEW.status != 'cancelled' THEN
      RAISE EXCEPTION 'ลูกค้าสามารถเปลี่ยนสถานะเป็นยกเลิก (cancelled) ได้เท่านั้น';
    END IF;

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

CREATE POLICY "Farmers and admins update order items" ON order_items
  FOR UPDATE USING (get_my_role() IN ('farmer', 'admin'));

-- Discount Logs: ทุกคนดูได้, Farmer/Admin จัดการได้
ALTER TABLE discount_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view discount logs" ON discount_logs;
DROP POLICY IF EXISTS "Farmers and admins manage discount logs" ON discount_logs;
CREATE POLICY "Anyone can view discount logs" ON discount_logs
  FOR SELECT USING (true);
CREATE POLICY "Farmers and admins manage discount logs" ON discount_logs
  FOR ALL USING (get_my_role() IN ('farmer', 'admin'));

-- Notifications: ดูและแก้ไขเฉพาะของตัวเอง, อนุญาตให้ส่งแจ้งเตือนเฉพาะผู้ล็อกอินหรือทีมงาน
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Anyone can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated users or staff can insert notifications" ON notifications;

CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users or staff can insert notifications" ON notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth.uid() = user_id 
      OR get_my_role() IN ('farmer', 'admin')
    )
  );


-- Vegetable Types: ทุกคนอ่านได้, Farmer/Admin จัดการได้ทั้งหมด
ALTER TABLE vegetable_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read vegetables" ON vegetable_types;
DROP POLICY IF EXISTS "Farmers and admins manage vegetables" ON vegetable_types;

CREATE POLICY "Anyone can read vegetables" ON vegetable_types
  FOR SELECT USING (true);

CREATE POLICY "Farmers and admins manage vegetables" ON vegetable_types
  FOR ALL USING (get_my_role() IN ('farmer', 'admin'))
  WITH CHECK (get_my_role() IN ('farmer', 'admin'));

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

-- ปรับสต็อกแบบ Atomic ป้องกัน Race Condition และข้าม RLS ด้วย SECURITY DEFINER (เฉพาะทีมงาน farmer/admin)
CREATE OR REPLACE FUNCTION adjust_resource_qty(r_id uuid, delta decimal)
RETURNS decimal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_qty decimal;
BEGIN
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

-- ตัดสต็อกอุปกรณ์ของคำสั่งซื้อแบบ Atomic ทั้งชุด (เฉพาะเจ้าของออเดอร์ หรือ farmer/admin)
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

  IF v_order.customer_id != auth.uid() AND get_my_role() NOT IN ('farmer', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่มีสิทธิ์ตัดสต็อกสำหรับคำสั่งซื้อนี้');
  END IF;

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
REVOKE EXECUTE ON FUNCTION deduct_order_equipment_stock(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION deduct_order_equipment_stock(uuid) TO authenticated;

-- ดึงทรัพยากรที่ใกล้หมด (current_qty <= min_threshold)
CREATE OR REPLACE FUNCTION get_low_stock_resources()
RETURNS SETOF resources AS $$
  SELECT * FROM resources
  WHERE current_qty <= min_threshold
  ORDER BY current_qty ASC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION get_low_stock_resources() FROM anon, public;
GRANT EXECUTE ON FUNCTION get_low_stock_resources() TO authenticated;

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

-- คำนวณพื้นที่การปลูกที่ใช้จริงตามออเดอร์ลูกค้า และแปลงปลูกแบบ Waterfall (Dedicated -> Shared Allocation)
CREATE OR REPLACE FUNCTION check_farm_capacity(
  target_pickup_date date,
  target_harvest_days integer DEFAULT 35,
  needed_slots integer DEFAULT 0,
  target_vegetable_type_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_target_start_date date;
  v_target_end_date date;
  
  v_dedicated_capacity integer := 0;
  v_dedicated_used integer := 0;
  v_dedicated_area_name text := '';
  
  v_shared_capacity integer := 0;
  v_shared_used integer := 0;
  v_shared_area_name text := '';
  
  v_total_capacity integer := 0;
  v_total_available integer := 0;
  v_total_used integer := 0;
  v_available_dedicated integer := 0;
  v_available_shared integer := 0;
  
  v_order_count integer := 0;
  v_area_name text := '';
  v_reason text := 'พื้นที่เพียงพอ';
  v_can_accept boolean := false;
  
  v_caps_map jsonb := '{}'::jsonb;
  v_used_map jsonb := '{}'::jsonb;
  
  r RECORD;
  v_key text;
  v_cap integer;
  v_cur_used integer;
  v_slots integer;
  v_room integer;
BEGIN
  v_target_end_date := target_pickup_date;
  v_target_start_date := (target_pickup_date - (COALESCE(target_harvest_days, 35) || ' days')::interval)::date;

  -- 1. สร้าง Map ความจุของแปลงเฉพาะของทุกผัก และหาความจุแปลงรวม
  SELECT jsonb_object_agg(vegetable_type_id::text, cap)
  INTO v_caps_map
  FROM (
    SELECT vegetable_type_id, SUM(total_slots)::integer AS cap
    FROM growing_areas
    WHERE is_active = true AND vegetable_type_id IS NOT NULL
    GROUP BY vegetable_type_id
  ) t;
  
  IF v_caps_map IS NULL THEN
    v_caps_map := '{}'::jsonb;
  END IF;

  -- แปลงรวม (shared) คือแปลงที่ไม่มี vegetable_type_id
  SELECT COALESCE(SUM(total_slots), 0)::integer, COALESCE(string_agg(name, ', '), '')
  INTO v_shared_capacity, v_shared_area_name
  FROM growing_areas
  WHERE is_active = true AND vegetable_type_id IS NULL;

  -- Fallback หากไม่มีแปลงปลูกเลยในระบบ
  IF (SELECT COUNT(*) FROM growing_areas WHERE is_active = true) = 0 THEN
    SELECT COALESCE(total_slots, 500)::integer, 'ฟาร์มโดยรวม'
    INTO v_shared_capacity, v_shared_area_name
    FROM farm_settings
    LIMIT 1;
  END IF;

  -- 2. วนลูปคำนวณ Waterfall สำหรับออเดอร์ของลูกค้าที่ทับซ้อนช่วงเวลานี้
  FOR r IN
    SELECT 
      oi.order_id,
      oi.vegetable_type_id,
      COALESCE(
        NULLIF(oi.slots_required, 0),
        CEIL(oi.quantity * COALESCE(vt.slots_per_kg, 4))
      )::integer AS slots
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN vegetable_types vt ON oi.vegetable_type_id = vt.id
    WHERE o.status IN ('waiting_cycle', 'pending', 'confirmed', 'seeding', 'growing', 'ready')
      AND o.pickup_date >= v_target_start_date
      AND (o.pickup_date - (COALESCE(vt.harvest_days, 35) || ' days')::interval)::date <= v_target_end_date
  LOOP
    v_slots := r.slots;
    IF r.vegetable_type_id IS NOT NULL THEN
      v_key := r.vegetable_type_id::text;
      v_cap := COALESCE((v_caps_map ->> v_key)::integer, 0);
      
      IF v_cap > 0 THEN
        v_cur_used := COALESCE((v_used_map ->> v_key)::integer, 0);
        IF v_cur_used + v_slots <= v_cap THEN
          v_used_map := jsonb_set(v_used_map, ARRAY[v_key], to_jsonb(v_cur_used + v_slots));
        ELSE
          v_room := GREATEST(0, v_cap - v_cur_used);
          v_used_map := jsonb_set(v_used_map, ARRAY[v_key], to_jsonb(v_cap));
          v_shared_used := v_shared_used + (v_slots - v_room);
        END IF;
      ELSE
        v_shared_used := v_shared_used + v_slots;
      END IF;
    ELSE
      v_shared_used := v_shared_used + v_slots;
    END IF;
  END LOOP;

  -- 3. วนลูปคำนวณรอบปลูก standalone ที่ทับซ้อน
  FOR r IN
    SELECT 
      pc.vegetable_type_id,
      COALESCE(pc.slots_used, 0)::integer AS slots
    FROM planting_cycles pc
    WHERE pc.order_item_id IS NULL
      AND pc.status NOT IN ('done', 'cancelled')
      AND pc.planting_start_date <= v_target_end_date
      AND COALESCE(pc.expected_harvest_date, pc.planting_start_date + interval '35 days')::date >= v_target_start_date
  LOOP
    v_slots := r.slots;
    IF r.vegetable_type_id IS NOT NULL THEN
      v_key := r.vegetable_type_id::text;
      v_cap := COALESCE((v_caps_map ->> v_key)::integer, 0);
      
      IF v_cap > 0 THEN
        v_cur_used := COALESCE((v_used_map ->> v_key)::integer, 0);
        IF v_cur_used + v_slots <= v_cap THEN
          v_used_map := jsonb_set(v_used_map, ARRAY[v_key], to_jsonb(v_cur_used + v_slots));
        ELSE
          v_room := GREATEST(0, v_cap - v_cur_used);
          v_used_map := jsonb_set(v_used_map, ARRAY[v_key], to_jsonb(v_cap));
          v_shared_used := v_shared_used + (v_slots - v_room);
        END IF;
      ELSE
        v_shared_used := v_shared_used + v_slots;
      END IF;
    ELSE
      v_shared_used := v_shared_used + v_slots;
    END IF;
  END LOOP;

  -- นับจำนวนออเดอร์ที่ทับซ้อน
  SELECT COUNT(DISTINCT o.id) INTO v_order_count
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN vegetable_types vt ON oi.vegetable_type_id = vt.id
  WHERE o.status IN ('waiting_cycle', 'pending', 'confirmed', 'seeding', 'growing', 'ready')
    AND o.pickup_date >= v_target_start_date
    AND (o.pickup_date - (COALESCE(vt.harvest_days, 35) || ' days')::interval)::date <= v_target_end_date;

  -- 4. คำนวณสรุปตามเป้าหมาย (target_vegetable_type_id)
  IF target_vegetable_type_id IS NOT NULL THEN
    v_key := target_vegetable_type_id::text;
    v_dedicated_capacity := COALESCE((v_caps_map ->> v_key)::integer, 0);
    v_dedicated_used := COALESCE((v_used_map ->> v_key)::integer, 0);
    
    SELECT COALESCE(string_agg(name, ', '), '')
    INTO v_dedicated_area_name
    FROM growing_areas
    WHERE is_active = true AND vegetable_type_id = target_vegetable_type_id;
  ELSE
    SELECT COALESCE(SUM(value::integer), 0) INTO v_dedicated_capacity FROM jsonb_each_text(v_caps_map);
    SELECT COALESCE(SUM(value::integer), 0) INTO v_dedicated_used FROM jsonb_each_text(v_used_map);
  END IF;

  v_available_dedicated := GREATEST(0, v_dedicated_capacity - v_dedicated_used);
  v_available_shared := GREATEST(0, v_shared_capacity - v_shared_used);
  v_total_available := v_available_dedicated + v_available_shared;
  v_total_capacity := v_dedicated_capacity + v_shared_capacity;
  v_total_used := v_dedicated_used + v_shared_used;

  IF v_dedicated_area_name <> '' AND v_shared_area_name <> '' THEN
    v_area_name := 'แปลงเฉพาะ (' || v_dedicated_area_name || ') + แปลงรวม (' || v_shared_area_name || ')';
  ELSIF v_dedicated_area_name <> '' THEN
    v_area_name := 'แปลงเฉพาะ (' || v_dedicated_area_name || ')';
  ELSIF v_shared_area_name <> '' THEN
    v_area_name := 'แปลงรวม (' || v_shared_area_name || ')';
  ELSE
    v_area_name := 'แปลงปลูก';
  END IF;

  IF v_total_capacity = 0 THEN
    v_reason := 'ไม่มีแปลงปลูกที่รองรับผักชนิดนี้';
  ELSIF v_total_available <= 0 THEN
    v_reason := 'พื้นที่แปลงปลูกเต็มแล้วในวันที่เลือก';
  ELSIF v_total_available < needed_slots THEN
    v_reason := 'พื้นที่ว่างไม่พอ (ต้องการ ' || needed_slots || ' ช่อง แต่ว่างเพียง ' || v_total_available || ' ช่อง)';
  ELSE
    v_reason := 'พื้นที่เพียงพอ';
  END IF;

  v_can_accept := (v_total_capacity > 0 AND v_total_available >= needed_slots AND v_total_available > 0);

  RETURN json_build_object(
    'total', v_total_capacity,
    'used', v_total_used,
    'available', v_total_available,
    'slots_needed', needed_slots,
    'can_accept', v_can_accept,
    'occupancy_rate', CASE WHEN v_total_capacity > 0 THEN LEAST(100, ROUND((v_total_used::numeric / v_total_capacity::numeric) * 100)) ELSE 100 END,
    'active_orders_count', v_order_count,
    'target_start_date', v_target_start_date,
    'target_end_date', v_target_end_date,
    'area_name', v_area_name,
    'dedicated_capacity', v_dedicated_capacity,
    'dedicated_used', v_dedicated_used,
    'available_dedicated', v_available_dedicated,
    'shared_capacity', v_shared_capacity,
    'shared_used', v_shared_used,
    'available_shared', v_available_shared,
    'reason', v_reason
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- บันทึกและปรับส่วนลดต่อรายการแบบ Atomic พร้อมบันทึกประวัติ (Discount System)
-- บันทึกและปรับส่วนลดต่อรายการแบบ Atomic พร้อมบันทึกประวัติ (เฉพาะ farmer/admin)
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
  v_caller_role := get_my_role();
  IF v_caller_role NOT IN ('farmer', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่มีสิทธิ์กำหนดส่วนลด (เฉพาะทีมงานเกษตรกรและแอดมินเท่านั้น)');
  END IF;

  SELECT * INTO v_item FROM order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Item not found');
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

  -- 2. บันทึก Log การแก้ไข
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

  -- 3. หากออเดอร์ได้รับการยืนยันแล้ว ให้คำนวณและอัปเดตยอดสุทธิของ order (orders.final_amount) ทันที
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
REVOKE EXECUTE ON FUNCTION apply_item_discount(uuid, decimal, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION apply_item_discount(uuid, decimal, text, uuid) TO authenticated;

-- บันทึกและปรับส่วนลดทั้งออเดอร์ (เฉพาะ farmer/admin)
CREATE OR REPLACE FUNCTION apply_order_discount(
  p_order_id uuid,
  p_discount_type text,
  p_discount_value decimal,
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
  v_caller_role := get_my_role();
  IF v_caller_role NOT IN ('farmer', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่มีสิทธิ์กำหนดส่วนลด (เฉพาะทีมงานเกษตรกรและแอดมินเท่านั้น)');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ไม่พบออเดอร์ที่ระบุ');
  END IF;

  IF v_order.status NOT IN ('waiting_cycle', 'pending', 'scheduling') THEN
    RETURN json_build_object('success', false, 'error', 'ไม่สามารถแก้ไขส่วนลดได้เนื่องจากออเดอร์ได้รับการยืนยันแล้ว');
  END IF;

  SELECT COALESCE(SUM(COALESCE(final_price, quantity * price_at_order)), 0)
  INTO v_subtotal
  FROM order_items
  WHERE order_id = p_order_id;

  v_val := GREATEST(0, COALESCE(p_discount_value, 0));

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

  UPDATE orders
  SET 
    order_discount_type = p_discount_type,
    order_discount_value = v_val,
    order_discount_amount = v_discount_amount,
    order_discount_note = p_note,
    final_amount = v_final_amount,
    updated_at = now()
  WHERE id = p_order_id;

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

-- RPC notify_staff สำหรับส่งการแจ้งเตือนไปยัง Farmer & Admin ทุกคน (ข้าม RLS)
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

-- Trigger แจ้งเตือน Farmer & Admin และลูกค้า อัตโนมัติเมื่อมีคำสั่งซื้อใหม่ (AFTER INSERT ON orders)
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
  
  SELECT full_name INTO v_customer FROM profiles WHERE id = NEW.customer_id;
  IF FOUND AND v_customer.full_name IS NOT NULL AND v_customer.full_name != '' THEN
    v_customer_name := v_customer.full_name;
  END IF;

  v_is_equipment := (NEW.notes ILIKE '%จัดส่งถึงบ้าน%' OR NEW.notes ILIKE '%📦 จัดส่ง%');

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

-- Trigger แจ้งเตือน Farmer & Admin อัตโนมัติเมื่อลูกค้ายกเลิกคำสั่งซื้อ (AFTER UPDATE OF status ON orders)
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

-- ============================================
-- MIGRATION STATEMENTS (สำหรับอัปเดต DB เดิม)
-- ============================================
ALTER TABLE vegetable_types ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES resources(id) ON DELETE SET NULL;
ALTER TABLE growing_areas ADD COLUMN IF NOT EXISTS vegetable_type_id uuid REFERENCES vegetable_types(id) ON DELETE SET NULL;

-- Migrations สำหรับระบบส่วนลดต่อรายการและประเภทลูกค้า
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS customer_type text DEFAULT 'ทั่วไป';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_rate decimal(5,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount decimal(10,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS final_price decimal(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_amount decimal(10,2);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('waiting_cycle','pending','confirmed','seeding','growing','ready','completed','cancelled'));

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
