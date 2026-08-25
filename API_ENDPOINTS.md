# API Endpoints (cps-api)

Base path: `/api/v1`  ·  Auth: `Bearer <accessToken>`  ·  Schema: `master` (business), `iam` (auth/menus/permissions)

> All endpoints require `Authorization: Bearer <token>` unless marked **Public**. Permissions are documented per-route. SUPER_ADMIN bypasses all permission checks.

## Conventions

- Response envelope (when not auto-unwrapped by an interceptor):
  ```json
  { "success": true, "message": "OK", "data": <T>, "timestamp": "..." }
  ```
- Errors use NestJS HTTP exceptions; body shape:
  ```json
  { "statusCode": 400, "message": "Validation failed", "error": "Bad Request" }
  ```
- IDs are `bigint` (string in JSON). All `*_id` columns are foreign keys.

---

## 1. Auth (`/api/v1/auth`) — `auth` module

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | Public | — | Returns `{ authentication: { accessToken, refreshToken, ... }, user, currentDepartmentRole, accessControl: { menus, permissions } }` |
| POST | `/auth/select-department` | Bearer | — | After login, pick a department if user has multiple |
| POST | `/auth/switch-department` | Bearer | — | Switch active department/role |
| POST | `/auth/refresh` | Public | — | Refresh access token |
| POST | `/auth/refresh-token` | Public | — | Alias of `/refresh` |
| POST | `/auth/logout` | Bearer | — | Revoke current session |
| GET  | `/auth/me` | Bearer | — | Current user profile |
| GET  | `/auth/me/menus` | Bearer | — | Menus visible to current user |
| GET  | `/auth/me/permissions` | Bearer | — | Permissions granted to current user |

## 2. Products (`/api/v1/products`) — `products` module

### Fields (products table)

| Field | Type | Notes |
|---|---|---|
| `id` | bigint (auto) | PK |
| `code` | varchar(50) UNIQUE | Required, uppercase recommended |
| `name` | varchar(255) | Required — single name (TH/EN) |
| `unit_id` | bigint FK → `units` | Required |
| `model_id` | bigint FK → `product_models` | Required |
| `customer_id` | bigint FK → `customers` | Required |
| `packing` | integer | Default 1 — จำนวนชิ้นต่อ pack |
| `location_id` | bigint FK → `locations` | Required |
| `safety_stock` | integer | **Auto-computed** = `lot_size` (overridable) |
| `product_type_id` | bigint FK → `product_types` | Required |
| `lot_size` | integer | Default 1 — ชิ้นต่อ lot |
| `min_stock` | integer | **Auto-computed** = `packing` (overridable) |
| `delivery_type_id` | bigint FK → `delivery_types` | Required |
| `scale` | varchar(50) nullable | สเกล/อัตราส่วน |
| `loading_point_id` | bigint FK → `loading_points` | Required |
| `process_line_id` | bigint FK → `process_lines` | Required |
| `product_image_path` | varchar(500) nullable | |
| `is_active` | boolean | Default true |

### Safety stock / Min stock formulas

```
safety_stock = safetyStock ?? lotSize
min_stock     = minStock ?? packing
```

Re-applied on every create/update unless the caller passes `safetyStock` / `minStock` explicitly (override).

### Routes

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/products` | `PRODUCTS_VIEW` | Query: `search, isActive, modelId, customerId, productTypeId, locationId, processLineId, sortBy, sortOrder` |
| GET | `/products/lookups` | `PRODUCTS_VIEW` | Returns `{ units, productModels, customers, locations, productTypes, deliveryTypes, loadingPoints, processLines }` |
| GET | `/products/:id` | `PRODUCTS_VIEW` | Returns product with all 8 relations |
| POST | `/products` | `PRODUCTS_CREATE` | Body: `CreateProductDto`. Validates every FK; computes safety/min stock |
| PATCH | `/products/:id` | `PRODUCTS_UPDATE` | Body: `UpdateProductDto` (must include `updatedAt`) |
| DELETE | `/products/:id` | `PRODUCTS_DELETE` | Soft delete (sets `is_active=false`) |
| PATCH | `/products/:id/restore` | `PRODUCTS_RESTORE` | Restore soft-deleted |

### Response shape (single product)

```json
{
  "id": "1", "code": "PRD-001", "name": "เครื่องยนต์ 4 สูบ",
  "unitId": "1", "modelId": "4", "customerId": "1", "packing": 1,
  "locationId": "1", "safetyStock": 100, "productTypeId": "1",
  "lotSize": 100, "minStock": 1, "deliveryTypeId": "2",
  "scale": "1:1", "loadingPointId": "2", "processLineId": "1",
  "productImagePath": null, "isActive": true,
  "createdAt": "...", "updatedAt": "...",
  "unit":         { "id": "1", "code": "PCS", "nameTh": "ชิ้น" },
  "model":        { "id": "4", "code": "HILX-2024", "nameTh": "Toyota Hilux Revo 2024", "brand": "Toyota" },
  "customer":     { "id": "1", "code": "CUST-TOY", "nameTh": "บริษัท โตโยต้า..." },
  "location":     { "id": "1", "code": "WH-A1", "nameTh": "คลัง A1" },
  "productType":  { "id": "1", "code": "FG", "nameTh": "สินค้าสำเร็จรูป" },
  "deliveryType": { "id": "2", "code": "NORMAL", "nameTh": "จัดส่งปกติ" },
  "loadingPoint": { "id": "2", "code": "DOCK-1", "nameTh": "จุดขนถ่าย 1" },
  "processLine":  { "id": "1", "code": "ASM-1", "nameTh": "สายประกอบ 1" }
}
```

## 3. BOMs (`/api/v1/boms`) — `boms` module

### Fields

- `product_boms`: `id, product_id, version, status (DRAFT|ACTIVE|INACTIVE), specification, remark, effective_from, effective_to`
- `product_bom_items`: `id, bom_id, material_id, sort_order, quantity, unit_id, is_scrap, wastage_percent, remark`

### Routes

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/boms/product/:productId` | `BOMS_VIEW` | Array of BOMs for product (with `items[]` and joined `material.unit`) |
| GET | `/boms/:id` | `BOMS_VIEW` | Single BOM |
| POST | `/boms` | `BOMS_CREATE` | Auto-increments `version` (v1, v2…). Body: `{ productId, specification?, remark?, effectiveFrom?, effectiveTo?, items: [{ materialId, quantity, unitId, isScrap?, wastagePercent?, remark? }] }` |
| PATCH | `/boms/:id` | `BOMS_UPDATE` | Edit spec/remark/dates (cannot edit ACTIVE BOM — deactivate first) |
| POST | `/boms/:id/items` | `BOMS_UPDATE` | Append an item to a DRAFT/INACTIVE BOM |
| DELETE | `/boms/:id/items/:itemId` | `BOMS_UPDATE` | Remove an item |
| PATCH | `/boms/:id/activate` | `BOMS_UPDATE` | Activate a BOM (deactivates others for same product) |
| PATCH | `/boms/:id/deactivate` | `BOMS_UPDATE` | Deactivate |
| DELETE | `/boms/:id` | `BOMS_DELETE` | Hard delete (not allowed for ACTIVE) |

## 4. Master Data (CRUD with `soft delete` via `is_active`)

All return lists with `select: id, code, name_th, name_en`; all support `lookups`-style usage for FK dropdowns.

| Module | Path | Notes |
|---|---|---|
| Materials | `/materials`, `/materials/lookups`, `/materials/:id` | has `unit_id, model_id, delivery_type_id, loading_point_id, material_type, packing_quantity, ratio, image_path` |
| Units | `/units` | code, name_th, name_en, symbol |
| Suppliers | `/suppliers` | code, name_th, name_en, tax_id, contact_name, address |
| Material Models | `/material-models` | code, name_th, name_en |
| Delivery Types | `/delivery-types` | code, name_th, name_en |
| Loading Points | `/loading-points` | code, name_th, name_en |
| Organizations | `/organizations` | code, name_th, name_en, tax_id, type, parent_id, logo_url |
| Categories | `/categories` | code, name_th, name_en, parent_id, sort_order, icon_color |
| **Product Models** | `/product-models` | NEW — code, name_th, name_en, brand |
| **Customers** | `/customers` | NEW — code, name_th, name_en, tax_id, contact_name, telephone, email, address |
| **Locations** | `/locations` | NEW — code, name_th, name_en, zone, warehouse |
| **Product Types** | `/product-types` | NEW — code, name_th, name_en, sort_order |
| **Process Lines** | `/process-lines` | NEW — code, name_th, name_en |
| Status Items | `/status-items` | code, name_th, name_en, color, module, is_default, sort_order |
| Reject Reasons | `/reject-reasons` | code, name_th, name_en, description |

## 5. Goods Receipts & Materials (operations)

| Path | Notes |
|---|---|
| `/goods-receipts` (+ `/lookups`, `/:id`, `/post`, `/cancel`, `/attachments`) | Goods receipt CRUD with post/cancel workflow |
| `/materials-receiving` (+ `/report`, `/unified-report`, `/lookups`, `/suppliers`, `/by-lot/:lot`, `/:id`, `/:id/confirm`, `/:id/cancel`, `/pieces-qr`, `/packages/:id/qr`) | Receiving with QR/lot tracking |
| `/materials-disbursement` (+ `/report`, `/lookups`, `/:id`, `/:id/confirm`, `/:id/cancel`) | Material disbursement |
| `/stock-balances` (+ `/:materialId`) | Current stock per material |

## 6. Access Control (admin)

| Path | Notes |
|---|---|
| `/users` (CRUD + `/:id/status`, `/:id/reset-password`, `/:id/access-summary`, `/:id/assignments` CRUD) | User management |
| `/departments` (CRUD) | Department tree |
| `/roles` (CRUD) | Roles |
| `/menus` (+ `/tree`, CRUD) | Menu registry |
| `/permissions` (+ `/options`, CRUD + `/:id/departments`) | Permission registry |
| `/sessions` (+ `/:id`, `/:id/revoke`, `/revoke-all/:userId`) | Active sessions |
| `/audit-logs` (+ `/:id`) | Audit trail |

---

## Migration history (most recent first)

| Migration | Description |
|---|---|
| `1786700000004` | (legacy) Initial products + BOMs schema (now superseded) |
| `1786700000005` | **Rebuild products schema** — drop old, add 5 master tables (product_models, customers, locations, product_types, process_lines), recreate products with FKs, add safety_stock/min_stock formulas |

## Seed data

- `src/database/seeds/seed.ts` — base iam + master data (categories, units, suppliers, …)
- `src/database/seeds/seed-master-data.ts` — **5 product_models + 4 customers + 3 locations + 3 product_types + 4 process_lines + 4 products + 2 BOMs**
