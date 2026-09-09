-- Seed script for master-data menu entries that may be missing from the DB.
-- Safe to run multiple times — uses UPSERT (INSERT ... ON CONFLICT DO UPDATE).
-- Run after the units/suppliers/material-models backend modules are deployed.
--
-- Usage:  psql "$DATABASE_URL" -f scripts/seed-master-data-menus.sql
--
-- What this seeds:
--   1. Three menu entries under the "ข้อมูลหลัก" group (sort_order 90–92)
--   2. UNIT_VIEW / UNIT_CREATE / UNIT_UPDATE / UNIT_DELETE permissions
--      (SUPPLIER_* and MATERIAL_MODEL_* permissions are seeded alongside)
-- The menu entries already exist in seed.ts — this script handles the case where
-- the DB was seeded before those entries were added to seed.ts.

BEGIN;

-- ── 1. Menu entries ───────────────────────────────────────────────────────────

INSERT INTO iam.menus
  (code, name_th, name_en, path, icon, is_visible, is_active, sort_order,
   menu_type, created_at, updated_at)
VALUES
  ('UNIT_MANAGEMENT',
   'จัดการหน่วยนับ', 'Unit Management',
   '/master-data/units', 'ruler',
   true, true, 90,
   'MAIN',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO UPDATE SET
  name_th    = EXCLUDED.name_th,
  name_en    = EXCLUDED.name_en,
  path       = EXCLUDED.path,
  icon       = EXCLUDED.icon,
  is_visible = EXCLUDED.is_visible,
  is_active  = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO iam.menus
  (code, name_th, name_en, path, icon, is_visible, is_active, sort_order,
   menu_type, created_at, updated_at)
VALUES
  ('SUPPLIER_MANAGEMENT',
   'จัดการผู้จัดจำหน่าย', 'Supplier Management',
   '/master-data/suppliers', 'truck',
   true, true, 91,
   'MAIN',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO UPDATE SET
  name_th    = EXCLUDED.name_th,
  name_en    = EXCLUDED.name_en,
  path       = EXCLUDED.path,
  icon       = EXCLUDED.icon,
  is_visible = EXCLUDED.is_visible,
  is_active  = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO iam.menus
  (code, name_th, name_en, path, icon, is_visible, is_active, sort_order,
   menu_type, created_at, updated_at)
VALUES
  ('MATERIAL_MODEL_MANAGEMENT',
   'จัดการรุ่นวัสดุ', 'Material Model Management',
   '/master-data/material-models', 'box',
   true, true, 92,
   'MAIN',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO UPDATE SET
  name_th    = EXCLUDED.name_th,
  name_en    = EXCLUDED.name_en,
  path       = EXCLUDED.path,
  icon       = EXCLUDED.icon,
  is_visible = EXCLUDED.is_visible,
  is_active  = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ── 2. Permissions ─────────────────────────────────────────────────────────────
-- Each menu needs VIEW / CREATE / UPDATE / DELETE permission rows.
-- The seed loop creates these for every menu, but only if they don't exist yet.
-- We UPSERT them here so re-running is always safe.

-- Helper: upsert a single permission row
CREATE TEMP TABLE IF NOT EXISTS _upsert_permission(
  menu_code    TEXT,
  action_code  TEXT,
  permission_code TEXT
);
TRUNCATE _upsert_permission;

INSERT INTO _upsert_permission VALUES
  ('UNIT_MANAGEMENT',            'READ',   'UNIT_VIEW'),
  ('UNIT_MANAGEMENT',            'CREATE', 'UNIT_CREATE'),
  ('UNIT_MANAGEMENT',            'UPDATE', 'UNIT_UPDATE'),
  ('UNIT_MANAGEMENT',            'DELETE', 'UNIT_DELETE'),
  ('SUPPLIER_MANAGEMENT',        'READ',   'SUPPLIER_VIEW'),
  ('SUPPLIER_MANAGEMENT',        'CREATE', 'SUPPLIER_CREATE'),
  ('SUPPLIER_MANAGEMENT',        'UPDATE', 'SUPPLIER_UPDATE'),
  ('SUPPLIER_MANAGEMENT',        'DELETE', 'SUPPLIER_DELETE'),
  ('MATERIAL_MODEL_MANAGEMENT',  'READ',   'MATERIAL_MODEL_VIEW'),
  ('MATERIAL_MODEL_MANAGEMENT',  'CREATE', 'MATERIAL_MODEL_CREATE'),
  ('MATERIAL_MODEL_MANAGEMENT',  'UPDATE', 'MATERIAL_MODEL_UPDATE'),
  ('MATERIAL_MODEL_MANAGEMENT',  'DELETE', 'MATERIAL_MODEL_DELETE');

INSERT INTO iam.permissions
  (menu_id, action_id, code, is_active, created_at, updated_at)
SELECT
  m.id,
  a.id,
  p.permission_code,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _upsert_permission p
JOIN iam.menus       m ON m.code = p.menu_code
JOIN iam.actions     a ON a.code = p.action_code
ON CONFLICT (code) DO UPDATE SET
  menu_id    = EXCLUDED.menu_id,
  action_id  = EXCLUDED.action_id,
  is_active  = EXCLUDED.is_active,
  updated_at = CURRENT_TIMESTAMP;

DROP TABLE _upsert_permission;

COMMIT;

SELECT 'Seed complete: UNIT_MANAGEMENT, SUPPLIER_MANAGEMENT, MATERIAL_MODEL_MANAGEMENT menus and permissions are in place.' AS status;
