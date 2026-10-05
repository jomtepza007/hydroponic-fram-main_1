-- ==============================================================================
-- Migration: Waterfall Dedicated -> Shared Allocation for Farm Capacity
-- คำนวณความจุแปลงปลูกแบบจัดสรรลงแปลงเฉพาะก่อน แล้วส่วนเกินจึงล้นลงแปลงรวม
-- ป้องกันการที่ผักชนิดอื่นแย่งโควต้าแปลงเฉพาะ และป้องกัน Overbooking
-- ==============================================================================

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
