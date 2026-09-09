# CPS API Endpoint Reference

> Generated from controllers, DTOs, services, entities and permission constants on branch `develoment`, inspected through 28 August 2026 (base commit `b4114ab`). This file documents the implemented runtime contract, not planned endpoints.

## 1. Global conventions

| Item                        | Value                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| Base URL                    | `http://<host>:3001/api/v1` by default                                 |
| Swagger UI                  | `http://<host>:3001/api/docs`                                          |
| Authentication              | `Authorization: Bearer <accessToken>`                                  |
| Content type                | `application/json`, except multipart image upload and PNG QR responses |
| ID format                   | PostgreSQL `bigint`; represented as string in JSON                     |
| Decimal quantities          | String where entities use `numeric(18,4)`                              |
| Date                        | `YYYY-MM-DD`                                                           |
| Date-time/concurrency token | ISO 8601 string                                                        |

There is no global authentication guard and no global success envelope. Each controller explicitly attaches guards, and responses are returned directly from its service.

### 1.1 Protection labels used below

- **Public** — no access token; some flows use a dedicated token in the body
- **JWT** — valid access token
- **SUPER_ADMIN** — JWT plus `RolesGuard` and active role `SUPER_ADMIN`
- **Permission** — JWT + active assignment + the listed effective permission; SUPER_ADMIN bypasses the permission lookup

### 1.2 Validation

Global validation removes no unknown fields silently: `whitelist: true` and `forbidNonWhitelisted: true` make unknown properties fail with `400`.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "VALIDATION_ERROR",
  "message": "one or more validation messages"
}
```

List responses normally use:

```json
{
  "items": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

Exceptions: Products return only `meta.totalItems`; lookup/report/single endpoints return their module-specific shape.

## 2. Health/root

| Method | Path | Protection | Response                            |
| ------ | ---- | ---------- | ----------------------------------- |
| `GET`  | `/`  | Public     | String from `AppService.getHello()` |

## 3. Authentication — `/auth`

| Method | Path                      | Protection | Body/query                                                                    | Behavior                                                                                   |
| ------ | ------------------------- | ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST` | `/auth/login`             | Public     | `{ username: string, password: string(min 6) }`                               | Validate credentials/user state; return authenticated session or department-selection flow |
| `POST` | `/auth/select-department` | Public     | `{ departmentSelectionToken?: string, userDepartmentRoleId: numeric-string }` | Verify dedicated selection token and issue full session for the selected assignment        |
| `POST` | `/auth/switch-department` | JWT        | `{ userDepartmentRoleId: numeric-string }`                                    | Validate assignment ownership and issue tokens/context for another assignment              |
| `POST` | `/auth/refresh`           | Public     | `{ refreshToken: string }`                                                    | Rotate/refresh access context after session checks                                         |
| `POST` | `/auth/refresh-token`     | Public     | Same as `/refresh`                                                            | Alias                                                                                      |
| `POST` | `/auth/logout`            | JWT        | none                                                                          | Revoke current session; returns `{ success: true, message: "Logout successful" }`          |
| `GET`  | `/auth/me`                | JWT        | none                                                                          | Current user and active assignment context                                                 |
| `GET`  | `/auth/me/menus`          | JWT        | none                                                                          | Returns `{ menus: [...] }` for current role                                                |
| `GET`  | `/auth/me/permissions`    | JWT        | none                                                                          | Returns `{ permissions: string[] }`                                                        |

Login may return either a complete authentication result or a department-selection token when the user must choose an assignment. Failed login can increment failure count and lock the account after the configured threshold.

Common auth failures include `INVALID_CREDENTIALS`, inactive/locked user, invalid or expired selection/refresh token, revoked/expired session, and inactive/invalid assignment.

## 4. SUPER_ADMIN administration

Every route in this section uses `JwtAuthGuard`, `RolesGuard`, and `@Roles(SUPER_ADMIN)`. These controllers do not use per-route permission codes.

### 4.1 Users — `/users`

| Method   | Path                                   | Input                                 | Behavior                                                                |
| -------- | -------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `GET`    | `/users`                               | Query `page=1`, `limit=20`, `search?` | Paginated users                                                         |
| `GET`    | `/users/:id`                           | Path `id`                             | User details with relations                                             |
| `POST`   | `/users`                               | `CreateUserDto`                       | Create user, hash password, create assignments and permission overrides |
| `PATCH`  | `/users/:id`                           | `UpdateUserDto`                       | Update profile and optionally replace assignment aggregate              |
| `PATCH`  | `/users/:id/status`                    | `{ isActive: boolean }`               | Enable/disable account; protects last SUPER_ADMIN                       |
| `POST`   | `/users/:id/reset-password`            | `{ newPassword: string }`             | Replace Argon2id password hash                                          |
| `GET`    | `/users/:id/access-summary`            | none                                  | Effective permissions/menu tree for every assignment                    |
| `GET`    | `/users/:id/assignments`               | none                                  | Assignments plus explicit permissions                                   |
| `POST`   | `/users/:id/assignments`               | `CreateAssignmentDto`                 | Add department/role and optional permission IDs                         |
| `PATCH`  | `/users/:id/assignments/:assignmentId` | `UpdateAssignmentDto`                 | Change department/role and replace explicit permissions                 |
| `DELETE` | `/users/:id/assignments/:assignmentId` | none                                  | Remove assignment; protects last SUPER_ADMIN                            |
| `DELETE` | `/users/:id`                           | none                                  | Delete user and assignment/permission rows                              |

Create body:

```json
{
  "username": "somchai",
  "password": "at-least-6-chars",
  "firstName": "สมชาย",
  "lastName": "ใจดี",
  "email": "somchai@example.com",
  "telephone": "0812345678",
  "assignments": [
    {
      "departmentId": "1",
      "roleId": "3",
      "permissionIds": ["10", "11"]
    }
  ]
}
```

Update body supports optional `firstName`, `lastName`, `email`, `telephone`, and non-empty `assignments`. Each update assignment has optional existing `id`, `departmentId` (`null` only for SYSTEM role), and required `roleId`. The service rejects duplicate assignment pairs, inactive references, invalid SYSTEM/DEPARTMENT scope and removal of the last SUPER_ADMIN.

### 4.2 Departments — `/departments`

| Method   | Path               | Input                                    |
| -------- | ------------------ | ---------------------------------------- |
| `GET`    | `/departments`     | Query `page=1`, `limit=20`, `search?`    |
| `GET`    | `/departments/:id` | none                                     |
| `POST`   | `/departments`     | `{ code, nameTh, nameEn, description? }` |
| `PATCH`  | `/departments/:id` | `{ nameTh?, nameEn?, description? }`     |
| `DELETE` | `/departments/:id` | none                                     |

### 4.3 Roles — `/roles`

| Method   | Path         | Input                                            |
| -------- | ------------ | ------------------------------------------------ |
| `GET`    | `/roles`     | Query `page=1`, `limit=20`, `search?`, `status?` |
| `GET`    | `/roles/:id` | none                                             |
| `POST`   | `/roles`     | `{ code, nameTh, nameEn, scopeType?: SYSTEM      | DEPARTMENT, description?, actionCodes?: string[] }` |
| `PATCH`  | `/roles/:id` | Same fields optional plus `isActive?`            |
| `DELETE` | `/roles/:id` | none                                             |

### 4.4 Menus — `/menus`

| Method   | Path                     | Input                                 |
| -------- | ------------------------ | ------------------------------------- |
| `GET`    | `/menus`                 | Query `page=1`, `limit=20`, `search?` |
| `GET`    | `/menus/tree`            | none; hierarchical tree               |
| `GET`    | `/menus/management-tree` | none                                  |
| `GET`    | `/menus/:id`             | none                                  |
| `POST`   | `/menus`                 | `CreateMenuDto`                       |
| `PATCH`  | `/menus/reorder`         | `ReorderMenusDto`                     |
| `PATCH`  | `/menus/:id`             | `UpdateMenuDto`                       |
| `DELETE` | `/menus/:id`             | none                                  |

Create supports `code`, `nameTh`, `nameEn`, `menuType?` (`MAIN|MENU|BUTTON|SUB`), `path?`, `icon?`, `sortOrder?`, `parentId?`, nested `permissions?`, and nested `submenus?`. A nested permission contains `permissionCode`, `permissionName`, `resource`, and `action`.

`GET /menus/management-tree` returns every menu, including hidden (`isVisible: false`) and inactive (`isActive: false`) records, as an ordered nested tree. The deterministic `version` covers every record's `id`, `parentId`, `sortOrder`, `menuType`, and `updatedAt` and is the concurrency token required by the reorder endpoint.

```json
{
  "version": "sha256:6df2d399b7d89be26f16d4a658c034440f65ee986b5f276d5e1f7c57404c41e9",
  "menus": [
    {
      "id": "1",
      "parentId": null,
      "code": "DASHBOARD",
      "nameTh": "แดชบอร์ด",
      "nameEn": "Dashboard",
      "menuType": "MAIN",
      "path": "/dashboard",
      "icon": "layout-dashboard",
      "sortOrder": 0,
      "isVisible": true,
      "isActive": true,
      "children": []
    }
  ]
}
```

`PATCH /menus/reorder` atomically replaces the complete menu layout. The request must contain the current management-tree `version` and every menu ID exactly once:

```json
{
  "version": "sha256:6df2d399b7d89be26f16d4a658c034440f65ee986b5f276d5e1f7c57404c41e9",
  "items": [
    { "id": "1", "parentId": null, "sortOrder": 0 },
    { "id": "2", "parentId": "1", "sortOrder": 0 }
  ]
}
```

Each `id` must be a non-empty string, `parentId` must be `null` or a non-empty string, and `sortOrder` must be an integer at least `0`. The submitted IDs must exactly match the stored menu set. Parents must exist; self-parenting, cycles, children under `BUTTON` menus, and duplicate sibling positions are rejected. Every sibling list must use contiguous positions starting at `0`, and the maximum tree depth is 4 levels (a root is level 1). Non-button menu types are derived from placement (`MAIN` at the root, otherwise `SUB`); `BUTTON` remains `BUTTON`.

The server starts a transaction, locks the complete menu set, checks the version, validates the complete projected layout, and saves only changed records. A stale version returns `409 Conflict` with `Menu arrangement has changed. Refresh before saving again.` Validation failures return `400 Bad Request`. Any failure rolls back without a partial reorder.

```json
{
  "version": "sha256:38ba2df9784456ae2bbeb8e8bb83c1bdde06dc907304839468520683688656c8",
  "updatedCount": 2
}
```

The response version is computed from the merged post-save menu set. A valid no-op returns `updatedCount: 0` and does not issue menu updates.

### 4.5 Permissions — `/permissions`

| Method   | Path                           | Input                                                  |
| -------- | ------------------------------ | ------------------------------------------------------ |
| `GET`    | `/permissions`                 | Query `page=1`, `limit=20`, `search?`                  |
| `GET`    | `/permissions/options`         | Menu/action options                                    |
| `GET`    | `/permissions/:id`             | none                                                   |
| `PUT`    | `/permissions/:id/departments` | `{ departmentIds: unique string[] }`; replaces mapping |
| `POST`   | `/permissions`                 | `{ menuId, actionId, code, description?, isActive? }`  |
| `PATCH`  | `/permissions/:id`             | Same fields optional                                   |
| `DELETE` | `/permissions/:id`             | none                                                   |

### 4.6 Sessions — `/sessions`

| Method  | Path                           | Input                                 |
| ------- | ------------------------------ | ------------------------------------- |
| `GET`   | `/sessions`                    | Query `page=1`, `limit=20`, `userId?` |
| `GET`   | `/sessions/:id`                | none                                  |
| `PATCH` | `/sessions/:id/revoke`         | Revoke one session                    |
| `POST`  | `/sessions/revoke-all/:userId` | Revoke all sessions of a user         |

### 4.7 Audit logs — `/audit-logs`

| Method | Path              | Input                                            |
| ------ | ----------------- | ------------------------------------------------ |
| `GET`  | `/audit-logs`     | Query `page=1`, `limit=20`, `userId?`, `action?` |
| `GET`  | `/audit-logs/:id` | none                                             |

## 5. Permission-protected master data

### 5.1 Shared CRUD pattern

The following modules expose the same six route shapes:

| Method   | Relative path  | Permission        | Behavior                              |
| -------- | -------------- | ----------------- | ------------------------------------- |
| `GET`    | `/`            | `<PREFIX>_VIEW`   | Paginated/searchable list             |
| `GET`    | `/:id`         | `<PREFIX>_VIEW`   | Single row                            |
| `POST`   | `/`            | `<PREFIX>_CREATE` | Create                                |
| `PATCH`  | `/:id`         | `<PREFIX>_UPDATE` | Update; most DTOs require `updatedAt` |
| `DELETE` | `/:id`         | `<PREFIX>_DELETE` | Soft deactivate                       |
| `PATCH`  | `/:id/restore` | `<PREFIX>_UPDATE` | Restore                               |

| Base path          | Permission prefix | Core fields                                                                                                     |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `/units`           | `UNIT`            | `code(20)`, `nameTh(100)`, `nameEn?`, `symbol?(20)`, `description?`, `isActive?`                                |
| `/suppliers`       | `SUPPLIER`        | `code(50)`, `nameTh(255)`, `nameEn?`, `taxId?`, `contactName?`, `telephone?`, `email?`, `address?`, `isActive?` |
| `/material-models` | `MATERIAL_MODEL`  | `code`, `nameTh`, `nameEn?`, `description?`, `isActive?`                                                        |
| `/delivery-types`  | `DELIVERY_TYPE`   | `code(50)`, `nameTh(100)`, `nameEn?`, `description?`, `isActive?`                                               |
| `/loading-points`  | `LOADING_POINT`   | `code(50)`, `nameTh(100)`, `nameEn?`, `description?`, `isActive?`                                               |
| `/categories`      | `CATEGORY`        | `code`, `nameTh`, `nameEn?`, `parentId?`, `sortOrder?`, `iconColor?`, `description?`, `isActive?`               |
| `/organizations`   | `ORGANIZATION`    | `code`, `nameTh`, `nameEn?`, contact fields, `parentId?`, `type`, `logoUrl?`, `isActive?`                       |
| `/status-items`    | `STATUS_ITEM`     | `code`, `nameTh`, `nameEn?`, `color`, `module`, `isDefault?`, `sortOrder?`, `description?`, `isActive?`         |
| `/reject-reasons`  | `REJECT_REASON`   | `code`, `nameTh`, `nameEn?`, `description?`, `isActive?`                                                        |

Common list query is `page` (default 1), `limit` (default 20, maximum 100), `search?`, `isActive?`, `sortBy`, `sortOrder=asc|desc`. Categories default to `sortOrder`; other simple masters typically default to `code`. Organization adds `type?`.

Organization `type` must be `headquarters`, `branch`, `subsidiary`, or `department`. Status-item colors are constrained by its DTO enum. Empty optional strings are normally transformed to `null`.

### 5.2 Master tables without direct endpoints

There are currently no controllers for these tables:

- `master.product_models`
- `master.customers`
- `master.locations`
- `master.product_types`
- `master.process_lines`

They are returned by `GET /products/lookups` and populated through migrations/seeds. Paths such as `/product-models` or `/customers` are not implemented.

## 6. Materials — `/materials`

All routes use active-assignment permission checks.

| Method   | Path                     | Permission                                  | Input/behavior                                               |
| -------- | ------------------------ | ------------------------------------------- | ------------------------------------------------------------ |
| `GET`    | `/materials`             | `MATERIAL_VIEW`                             | Paginated list; filters below                                |
| `GET`    | `/materials/lookups`     | `MATERIAL_VIEW`                             | `{ units, suppliers, models, deliveryTypes, loadingPoints }` |
| `GET`    | `/materials/:id`         | `MATERIAL_VIEW`                             | Material with active suppliers and relations                 |
| `POST`   | `/materials`             | `MATERIAL_CREATE`                           | Create material and supplier mappings                        |
| `PATCH`  | `/materials/:id`         | `MATERIAL_UPDATE`                           | Update with required `updatedAt`                             |
| `DELETE` | `/materials/:id`         | `MATERIAL_DELETE`                           | Soft deactivate                                              |
| `PATCH`  | `/materials/:id/restore` | `MATERIAL_UPDATE`                           | Restore                                                      |
| `POST`   | `/materials/images`      | any of `MATERIAL_CREATE`, `MATERIAL_UPDATE` | `multipart/form-data`, field `file`; stage image             |

List query:

| Field                                                                 | Rules                       |
| --------------------------------------------------------------------- | --------------------------- |
| `page`, `limit`                                                       | Default 1/20; limit max 100 |
| `search`                                                              | Trimmed text                |
| `isActive`                                                            | Boolean                     |
| `unitId`, `modelId`, `deliveryTypeId`, `loadingPointId`, `supplierId` | Positive numeric strings    |
| `type`                                                                | `PC                         | OF    | OF_MAT`  |
| `materialType`                                                        | `PCS                        | PIPE  | SHEET    | COIL`     |
| `sortBy`                                                              | `code                       | name  | isActive | createdAt | updatedAt` |
| `sortOrder`                                                           | `asc                        | desc` |

Create body:

```json
{
  "code": "MAT-001",
  "name": "Steel pipe",
  "type": "PC",
  "materialType": "PIPE",
  "ratio": 4,
  "unitId": "1",
  "deliveryTypeId": "2",
  "modelId": "3",
  "loadingPointId": "1",
  "processLineName": "Cutting 1",
  "scale": "1:4",
  "imagePath": "/uploads/materials/.tmp/<uuid>.png",
  "specification": "...",
  "description": "...",
  "packingQuantity": 10,
  "minimumStock": 25,
  "supplierIds": ["1", "2"],
  "isActive": true
}
```

`code`, `name`, `materialType`, `unitId` are required. `PCS` requires `ratio` absent/null; PIPE/SHEET/COIL require integer `ratio >= 1`. `minimumStock` is optional, supports up to 4 decimal places, must be `>= 0`, and defaults to `0`. Supplier IDs must be unique and active.

Image upload accepts JPEG, PNG or WebP up to 5 MiB and returns:

```json
{
  "imagePath": "/uploads/materials/.tmp/<uuid>.<ext>",
  "previewUrl": "/uploads/materials/.tmp/<uuid>.<ext>"
}
```

The subsequent material create/update promotes that staged path to `/uploads/materials/<uuid>.<ext>`.

## 7. Products — `/products`

| Method   | Path                    | Permission                             | Input/behavior                              |
| -------- | ----------------------- | -------------------------------------- | ------------------------------------------- |
| `GET`    | `/products`             | `PRODUCTS_VIEW`                        | Filtered list; no page/limit in current DTO |
| `GET`    | `/products/lookups`     | `PRODUCTS_VIEW`                        | Units and all eight FK lookup collections   |
| `POST`   | `/products/images`      | `PRODUCTS_CREATE` or `PRODUCTS_UPDATE` | Stage `multipart/form-data` field `file`    |
| `GET`    | `/products/:id`         | `PRODUCTS_VIEW`                        | Product with all relations                  |
| `POST`   | `/products`             | `PRODUCTS_CREATE`                      | Validate all FK rows and create             |
| `PATCH`  | `/products/:id`         | `PRODUCTS_UPDATE`                      | Partial update; `updatedAt` required by DTO |
| `DELETE` | `/products/:id`         | `PRODUCTS_DELETE`                      | Soft deactivate                             |
| `PATCH`  | `/products/:id/restore` | `PRODUCTS_RESTORE`                     | Restore                                     |

List query supports `search`, `isActive`, `modelId`, `customerId`, `productTypeId`, `locationId`, `processLineId`, `sortBy` (`code|name|isActive|createdAt|updatedAt`) and `sortOrder`. Response is `{ items, meta: { totalItems } }`.

Create fields:

| Field                                                                | Required | Rules                            |
| -------------------------------------------------------------------- | -------- | -------------------------------- |
| `code`                                                               | yes      | string max 50; unique            |
| `name`                                                               | yes      | string max 255                   |
| `unitId`, `modelId`, `customerId`, `locationId`                      | yes      | positive numeric-string FK       |
| `productTypeId`, `deliveryTypeId`, `loadingPointId`, `processLineId` | yes      | positive numeric-string FK       |
| `packing`                                                            | no       | integer `>=1`, default 1         |
| `lotSize`                                                            | no       | integer `>=1`, default 1         |
| `safetyStock`                                                        | no       | integer `>=0`; default `lotSize` |
| `minStock`                                                           | no       | integer `>=0`; default `packing` |
| `scale`                                                              | no       | nullable, max 50                 |
| `productImagePath`                                                   | no       | nullable, max 500                |
| `isActive`                                                           | no       | boolean                          |

Lookup response keys: `units`, `productModels`, `customers`, `locations`, `productTypes`, `deliveryTypes`, `loadingPoints`, `processLines`.

Product image upload accepts JPEG, PNG or WebP up to 5 MiB. The server verifies the file signature, assigns a UUID filename and returns:

```json
{
  "imagePath": "/uploads/products/.tmp/<uuid>.<ext>",
  "previewUrl": "/uploads/products/.tmp/<uuid>.<ext>"
}
```

Send that temporary path as `productImagePath` in `POST /products` or `PATCH /products/:id`. The service promotes it to `/uploads/products/<uuid>.<ext>` before persistence, compensates the promoted file if the transaction fails, and removes the previous image only after a successful replacement. Send `productImagePath: null` in PATCH to remove the current image.

## 8. BOMs — `/boms`

| Method   | Path                       | Permission    | Behavior                                             |
| -------- | -------------------------- | ------------- | ---------------------------------------------------- |
| `GET`    | `/boms/product/:productId` | `BOMS_VIEW`   | BOM versions for product, newest first               |
| `GET`    | `/boms/:id`                | `BOMS_VIEW`   | BOM with material/unit-enriched items                |
| `POST`   | `/boms`                    | `BOMS_CREATE` | Create next version in DRAFT                         |
| `PATCH`  | `/boms/:id`                | `BOMS_UPDATE` | Update header only; ACTIVE prohibited                |
| `POST`   | `/boms/:id/items`          | `BOMS_UPDATE` | Append item; ACTIVE prohibited                       |
| `DELETE` | `/boms/:id/items/:itemId`  | `BOMS_UPDATE` | Remove item; ACTIVE prohibited                       |
| `PATCH`  | `/boms/:id/activate`       | `BOMS_UPDATE` | Activate and deactivate other ACTIVE BOMs of product |
| `PATCH`  | `/boms/:id/deactivate`     | `BOMS_UPDATE` | Set INACTIVE                                         |
| `DELETE` | `/boms/:id`                | `BOMS_DELETE` | Hard delete; ACTIVE prohibited                       |

Create body:

```json
{
  "productId": "1",
  "specification": "Revision A",
  "remark": null,
  "effectiveFrom": "2026-09-01",
  "effectiveTo": null,
  "items": [
    {
      "materialId": "10",
      "quantity": 2.5,
      "unitId": "1",
      "isScrap": false,
      "wastagePercent": 3.5,
      "remark": null
    }
  ]
}
```

Items: 1–200; `quantity >= 0.0001`; `wastagePercent` 0–100. Version is server-generated as `v1`, `v2`, etc. Update accepts `specification?`, `remark?`, `effectiveFrom?`, `effectiveTo?`, and required string `updatedAt`; the current service does not compare this token.

`AddBomItemDto` currently requires `materialId` and `unitId`; its optional numeric fields have less validation than create-BOM items. Use the create constraints client-side until the API validation is tightened.

## 9. Materials Receiving — `/materials-receiving`

### 9.1 Routes

| Method   | Path                                          | Permission                    | Response/behavior                                          |
| -------- | --------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `GET`    | `/materials-receiving`                        | `MATERIALS_RECEIVING_VIEW`    | Paginated list                                             |
| `GET`    | `/materials-receiving/report`                 | VIEW                          | Receiving traceability report                              |
| `GET`    | `/materials-receiving/unified-report`         | VIEW                          | Combined receiving/disbursement report                     |
| `GET`    | `/materials-receiving/lookups`                | VIEW                          | Material lookups                                           |
| `GET`    | `/materials-receiving/suppliers?materialId=`  | VIEW                          | Active suppliers mapped to material; `materialId` required |
| `GET`    | `/materials-receiving/by-lot/:internalLotNo`  | VIEW                          | Full receiving by internal lot                             |
| `GET`    | `/materials-receiving/:id`                    | VIEW                          | Full receiving with packages/relations                     |
| `POST`   | `/materials-receiving`                        | `MATERIALS_RECEIVING_CREATE`  | Create draft receiving/packages/QR in transaction          |
| `PATCH`  | `/materials-receiving/:id`                    | `MATERIALS_RECEIVING_UPDATE`  | Update draft with optimistic concurrency                   |
| `DELETE` | `/materials-receiving/:id`                    | `MATERIALS_RECEIVING_DELETE`  | Delete draft; `204 No Content`                             |
| `POST`   | `/materials-receiving/:id/confirm`            | `MATERIALS_RECEIVING_CONFIRM` | Add stock and ledger; set confirmed                        |
| `POST`   | `/materials-receiving/:id/cancel`             | `MATERIALS_RECEIVING_CANCEL`  | Cancel and reverse confirmed stock                         |
| `GET`    | `/materials-receiving/packages/:packageId/qr` | VIEW                          | Binary `image/png` package QR                              |
| `GET`    | `/materials-receiving/packages/by-code/:lotDetailNo` | VIEW                   | Scan-a-box lookup — resolves a printed package QR's content (its `lotDetailNo`) to current tracking data (material, both lot numbers, box number, initial/current qty, unit, dates, status). Added alongside the Internal Lot format change below. |
| `GET`    | `/materials-receiving/:id/pieces-qr`          | VIEW                          | Binary `image/png`; only PIPE/SHEET/COIL                   |

Static paths are declared before `/:id`; clients should use the exact paths above.

**Internal Lot / Supplier Lot date format changed 2026-09-07** (see AGENTS.md § Material Receiving for the full writeup): Internal Lot No. is now `CCI-{YY}{MonthCode}{DD}-{SEQ}` (e.g. `CCI-26J07-001`) instead of the old `CCI-YYYYMMDD-XXX` — same fixed `CCI` prefix and the same global-per-day sequence (`inventory.material_receiving_lot_counters`, unchanged), only the date portion's format changed from raw `YYYYMMDD` to the custom `{YY}{MonthCode}{DD}` scheme. **The material's own code is deliberately NOT part of the Internal Lot** (an earlier revision of this change tried that; reverted — the lot number's uniqueness relies on staying keyed by date alone across every material, not per-material, so the prefix has to stay a fixed literal). `MonthCode` is a custom mapping, **not** a calendar abbreviation — Jan-Dec = A,B,C,D,F,G,H,I,J,K,L,M (deliberately skips "E"), see `lot-code.util.ts`. Supplier Lot No. is now `{YY}{MonthCode}{DD}` (e.g. `26J07`) instead of `SUP-YYYYMMDD` — still deterministic from `supplierProductionDate` alone (no running number, so multiple receives on the same supplier production date share one supplier lot). `run_no` (the header document number, `MR-YYYYMMDD-XXXX`) is unrelated and unchanged.

`material_receiving_packages` gained a `remaining_quantity` column (defaults to the package's own `quantity` at receive time) and a new `partial` package status (alongside the existing `pending/in_stock/issued/damaged/returned`), so a box can represent partial consumption (`IN_STOCK` when `remaining_quantity === quantity`, `PARTIAL` when `0 < remaining_quantity < quantity`, `ISSUED` when `remaining_quantity === 0`). **Nothing currently decrements `remaining_quantity`** — materials-disbursement's existing FIFO consumption logic (which flips a package straight to `issued`) was intentionally left untouched; wiring partial-quantity disbursement is a separate follow-up task.

### 9.2 List/report queries

List query supports:

- `page=1`, `limit=20` (max 100), `search?`
- `status=draft|confirmed|cancelled`
- `supplierId?`, `materialId?`, `internalLotNo?`
- `receiveDateFrom?`, `receiveDateTo?`
- `hasPackages?`
- `sortBy=internalLotNo|receiveDate|supplierLotNo|createdAt|updatedAt`
- `sortOrder=asc|desc`

Receiving report: `startDate?`, `endDate?`, `status?`, `supplierId?`, `materialId?`, `organizationId?`.

Unified report: `period=today|this_month|this_year|custom`, receive/disbursement date ranges, `type=receive|disbursement|both`, and `materialId?`. Known contract issue: current DTO incorrectly validates `materialId` with `IsDateString`.

### 9.3 Create/update bodies

```json
{
  "materialId": "1",
  "supplierId": "2",
  "receiveQuantity": "100.0000",
  "supplierProductionDate": "2026-08-20",
  "receiveDate": "2026-08-25",
  "poNo": "PO-2026/001",
  "remark": "optional",
  "packingQuantityOverride": 10,
  "ratioOverride": 4,
  "attachmentUrl": "/uploads/.../po.pdf",
  "attachmentName": "po.pdf"
}
```

`supplierId` may be omitted only when the material has exactly one active supplier mapping. `receiveQuantity` must be greater than zero with at most four decimals; receive date cannot be future. PO accepts 1–30 letters/numbers/dash/underscore/slash/space.

Update fields are optional but `updatedAt` is required. Only draft documents can be changed or deleted.

Cancel body:

```json
{ "cancelReason": "Required, 1–500 characters" }
```

### 9.4 State and stock effects

```text
draft --confirm--> confirmed --cancel--> cancelled
  └----------------cancel--------------> cancelled
```

Confirm increases `stock_balances`, creates a RECEIVE `stock_transactions` row, and changes packages to `in_stock`. Cancel of a confirmed document subtracts the received quantity and records an ADJUST transaction atomically; current code does not reset receiving-package status or guard against downstream FIFO use. Numeric fields remain decimal strings in JSON.

## 10. Materials Disbursement — `/materials-disbursement`

| Method   | Path                                  | Permission                       | Behavior                                  |
| -------- | ------------------------------------- | -------------------------------- | ----------------------------------------- |
| `GET`    | `/materials-disbursement`             | `MATERIALS_DISBURSEMENT_VIEW`    | Paginated list                            |
| `GET`    | `/materials-disbursement/report`      | VIEW                             | Traceability report with source FIFO lots |
| `GET`    | `/materials-disbursement/lookups`     | VIEW                             | Material/status/type lookups              |
| `GET`    | `/materials-disbursement/:id`         | VIEW                             | Header, items and package allocations     |
| `POST`   | `/materials-disbursement`             | `MATERIALS_DISBURSEMENT_CREATE`  | Create draft                              |
| `PATCH`  | `/materials-disbursement/:id`         | `MATERIALS_DISBURSEMENT_UPDATE`  | Update draft                              |
| `DELETE` | `/materials-disbursement/:id`         | `MATERIALS_DISBURSEMENT_DELETE`  | Delete draft; `204 No Content`            |
| `POST`   | `/materials-disbursement/:id/confirm` | `MATERIALS_DISBURSEMENT_CONFIRM` | FIFO allocate and issue stock             |
| `POST`   | `/materials-disbursement/:id/cancel`  | `MATERIALS_DISBURSEMENT_CANCEL`  | Reverse allocations/stock                 |

List query: `page`, `limit`, `search`, `status=draft|confirmed|cancelled`, `disbursementType=stock_cut|production`, `disbursementDateFrom`, `disbursementDateTo`, `sortBy=disbursementNo|disbursementDate|createdAt`, `sortOrder`.

Create body:

```json
{
  "disbursementType": "production",
  "disbursementDate": "2026-08-25",
  "reason": null,
  "attachmentUrl": null,
  "attachmentName": null,
  "items": [{ "materialId": "1", "requestedQuantity": "25.0000" }],
  "remark": "optional"
}
```

`stock_cut` requires `reason`. At least one item is required by service and each quantity must be greater than zero. Confirm processes oldest receiving packages first and fails the entire transaction when available stock is insufficient. Cancel body is `{ cancelReason: non-empty string }`.

Report query: `startDate?`, `endDate?`, `status?`, `disbursementType?`. Report rows include requested/disbursed quantities, document/type/status labels, and source lot numbers.

## 11. Stock Balances — `/stock-balances`

These routes reuse `MATERIALS_RECEIVING_VIEW`.

| Method | Path                          | Response                                                                           |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------- |
| `GET`  | `/stock-balances`             | Array of materials that currently have stock-balance rows                          |
| `GET`  | `/stock-balances/inventory`   | Paginated material inventory, stock KPI summary, filters and sorting               |
| `GET`  | `/stock-balances/:materialId` | One material; returns quantity `"0"` if the material exists but has no balance row |

```json
{
  "materialId": "1",
  "materialCode": "MAT-001",
  "materialName": "Steel pipe",
  "quantity": "75.0000",
  "unitCode": "PCS",
  "unitNameTh": "ชิ้น",
  "lastMovementAt": "2026-08-25T10:00:00.000Z"
}
```

Unknown material returns `404 Material not found`.

Inventory query supports `page`, `limit` (max 100), `search`, `isActive`, `type`, `supplierId`, `modelId`, `loadingPointId`, `processLineName`, `stockStatus` (`NORMAL|LOW_STOCK|OUT_OF_STOCK`), `sortBy` (`code|name|currentStock|lastReceivedAt`) and `sortOrder` (`asc|desc`). It returns full material rows plus `currentStock`, `minimumStock`, `stockStatus`, `lastMovementAt`, and the latest confirmed `lastReceivedAt`, along with pagination metadata and `{ total, normal, lowStock, outOfStock }` summary counts. Status logic is: current `<= 0` = out, current `> 0` and below minimum = low, otherwise normal. Summary counts retain the non-stock filters while ignoring the selected stock-status facet so all four KPI choices remain useful.

## 12. Permission code matrix

| Resource       | Codes                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Material       | `MATERIAL_VIEW`, `MATERIAL_CREATE`, `MATERIAL_UPDATE`, `MATERIAL_DELETE`                         |
| Unit           | `UNIT_VIEW`, `UNIT_CREATE`, `UNIT_UPDATE`, `UNIT_DELETE`                                         |
| Supplier       | `SUPPLIER_VIEW`, `SUPPLIER_CREATE`, `SUPPLIER_UPDATE`, `SUPPLIER_DELETE`                         |
| Material model | `MATERIAL_MODEL_VIEW`, `MATERIAL_MODEL_CREATE`, `MATERIAL_MODEL_UPDATE`, `MATERIAL_MODEL_DELETE` |
| Delivery type  | `DELIVERY_TYPE_VIEW`, `DELIVERY_TYPE_CREATE`, `DELIVERY_TYPE_UPDATE`, `DELIVERY_TYPE_DELETE`     |
| Loading point  | `LOADING_POINT_VIEW`, `LOADING_POINT_CREATE`, `LOADING_POINT_UPDATE`, `LOADING_POINT_DELETE`     |
| Category       | `CATEGORY_VIEW`, `CATEGORY_CREATE`, `CATEGORY_UPDATE`, `CATEGORY_DELETE`                         |
| Organization   | `ORGANIZATION_VIEW`, `ORGANIZATION_CREATE`, `ORGANIZATION_UPDATE`, `ORGANIZATION_DELETE`         |
| Status item    | `STATUS_ITEM_VIEW`, `STATUS_ITEM_CREATE`, `STATUS_ITEM_UPDATE`, `STATUS_ITEM_DELETE`             |
| Reject reason  | `REJECT_REASON_VIEW`, `REJECT_REASON_CREATE`, `REJECT_REASON_UPDATE`, `REJECT_REASON_DELETE`     |
| Receiving      | `MATERIALS_RECEIVING_VIEW                                                                        | CREATE | UPDATE | DELETE                                                                                                                   | CONFIRM  | CANCEL` |
| Disbursement   | `MATERIALS_DISBURSEMENT_VIEW                                                                     | CREATE | UPDATE | DELETE                                                                                                                   | CONFIRM  | CANCEL` |
| Product        | `PRODUCTS_VIEW                                                                                   | CREATE | UPDATE | DELETE                                                                                                                   | RESTORE` |
| BOM            | `BOMS_VIEW                                                                                       | CREATE | UPDATE | DELETE`; constants `BOMS_ACTIVATE`, `BOMS_DEACTIVATE`exist but activate/deactivate routes currently require`BOMS_UPDATE` |
| Product Workflow | `PRODUCT_WORKFLOWS_VIEW                                                                        | CREATE | UPDATE | DELETE` — activate/deactivate routes require `PRODUCT_WORKFLOWS_UPDATE`, same pattern as BOMs |
| Process Step (master) | `PROCESS_STEP_VIEW`, `PROCESS_STEP_CREATE`, `PROCESS_STEP_UPDATE`, `PROCESS_STEP_DELETE` — restore uses `PROCESS_STEP_UPDATE`, same pattern as Delivery type |

## 13. HTTP status/error guide

| Status | Typical causes                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `200`  | Read/update/action success                                                                                                              |
| `201`  | POST create/action under Nest default unless explicitly overridden                                                                      |
| `204`  | Successful delete for receiving/disbursement                                                                                            |
| `400`  | DTO validation, invalid business date/quantity, inactive reference, stock shortage, forbidden state operation represented as BadRequest |
| `401`  | Missing/invalid JWT, bad credentials, invalid/expired refresh or selection token                                                        |
| `403`  | Role/permission denied, inactive/locked user in custom guard flows                                                                      |
| `404`  | Resource/reference/QR not found                                                                                                         |
| `409`  | Duplicate code, optimistic concurrency conflict, invalid lifecycle transition represented as Conflict                                   |

Not every module uses the same exception class for an equivalent semantic condition. Clients should branch primarily on HTTP status and stable custom `code` when present, not on exact English message text.

## 14. Removed and non-existent endpoints

- `/goods-receipts/**` is not registered; the module and entities were removed in commit `b4114ab`
- `/customers`, `/locations`, `/product-models`, `/product-types`, `/process-lines` are not implemented controllers
- There is no generic `/uploads` API; Material/Product images are served statically and staged through `/materials/images` or `/products/images`
- Swagger is useful for discovery but is incomplete because many DTOs/controllers lack comprehensive Swagger decorators

## 15. Product Workflows — `/product-workflows`

Production routing for a product — the ordered sequence of process steps a product must go through (e.g. order production → weld → CNC → stamp → polish → inspect → QC → close), as distinct from a BOM (which is *what materials* are used, not *what steps* production goes through). Same versioning/status shape as BOMs (`DRAFT` → `ACTIVE` → `INACTIVE`, one `ACTIVE` per product, `activate` demotes any other `ACTIVE` workflow of the same product), added 2026-09-06.

| Method   | Path                                  | Permission                | Behavior                                                    |
| -------- | -------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| `GET`    | `/product-workflows/product/:productId` | `PRODUCT_WORKFLOWS_VIEW`   | Workflow versions for product, newest first                  |
| `GET`    | `/product-workflows/:id`               | `PRODUCT_WORKFLOWS_VIEW`   | Workflow with ordered steps                                   |
| `POST`   | `/product-workflows`                   | `PRODUCT_WORKFLOWS_CREATE` | Create next version in DRAFT                                  |
| `PATCH`  | `/product-workflows/:id`               | `PRODUCT_WORKFLOWS_UPDATE` | Update header (`remark`) only; ACTIVE prohibited              |
| `POST`   | `/product-workflows/:id/steps`         | `PRODUCT_WORKFLOWS_UPDATE` | Append step; ACTIVE prohibited                                 |
| `DELETE` | `/product-workflows/:id/steps/:stepId` | `PRODUCT_WORKFLOWS_UPDATE` | Remove step; ACTIVE prohibited                                 |
| `PATCH`  | `/product-workflows/:id/activate`      | `PRODUCT_WORKFLOWS_UPDATE` | Activate and deactivate other ACTIVE workflows of product      |
| `PATCH`  | `/product-workflows/:id/deactivate`    | `PRODUCT_WORKFLOWS_UPDATE` | Set INACTIVE                                                   |
| `DELETE` | `/product-workflows/:id`               | `PRODUCT_WORKFLOWS_DELETE` | Hard delete; ACTIVE prohibited                                 |

Create body:

```json
{
  "productId": "1",
  "remark": null,
  "steps": [
    { "processStepId": "1", "description": null },
    { "processStepId": "2", "description": null },
    { "processStepId": "3", "description": null },
    { "processStepId": "4", "description": null },
    { "processStepId": "5", "description": null },
    { "processStepId": "6", "description": null },
    { "processStepId": "7", "description": null },
    { "processStepId": "8", "description": null }
  ]
}
```

Steps: 1–100, each a `processStepId` FK into `/process-steps` (see § 16) + optional per-step `description` (a free-text override/note, not the step's name). **Changed 2026-09-06**: a step used to be a plain free-text `stepName` column; it is now a required FK so the frontend can offer a dropdown of master data instead of a text field (`process_step_id BIGINT NOT NULL REFERENCES master.process_steps(id) ON DELETE RESTRICT`, see migration `1786700000007-AddProcessStepsMaster.ts`). `create`/`addStep` both 409 (`ConflictException`) if any `processStepId` doesn't exist. The list/get responses still return a `stepName` field per step for display convenience — it's now derived by joining `processStep.nameTh` server-side (`ProductWorkflowsService#buildResponse`), not stored on the step row; also returns `processStepId`/`processStepCode`. `sortOrder` is server-assigned from array position (1-based) on create/append, not client-supplied. Update accepts `remark?` and required string `updatedAt`; the current service does not compare this token (same as BOMs' `UpdateBomDto`). Like `AddBomItemDto`, `AddProductWorkflowStepDto` has no `sortOrder` param — an appended step always goes to the end.

Permission codes (`PRODUCT_WORKFLOWS_VIEW/CREATE/UPDATE/DELETE`) are not seeded into any permissions table, same as `BOMS_*` — they work for `SUPER_ADMIN` (which bypasses permission checks) but would need a seed row to work for a non-super-admin role.

## 16. Process Steps (master data) — `/process-steps`

Master data catalog for Product Workflow steps (§ 15) — full CRUD, structurally a mirror of `/delivery-types` (same soft-delete-via-`isActive`/restore shape, same optimistic-concurrency `updatedAt` on update). Added 2026-09-06 so a workflow step can be picked from a dropdown instead of typed as free text.

| Method   | Path                      | Permission             | Behavior                                    |
| -------- | ------------------------- | ----------------------- | -------------------------------------------- |
| `GET`    | `/process-steps`          | `PROCESS_STEP_VIEW`     | Paginated list (`page`, `limit`, `search`, `isActive`, `sortBy`, `sortOrder`) |
| `GET`    | `/process-steps/:id`      | `PROCESS_STEP_VIEW`     | One process step                             |
| `POST`   | `/process-steps`          | `PROCESS_STEP_CREATE`   | Create (`code` unique, `nameTh` required)    |
| `PATCH`  | `/process-steps/:id`      | `PROCESS_STEP_UPDATE`   | Update; requires matching `updatedAt`        |
| `DELETE` | `/process-steps/:id`      | `PROCESS_STEP_DELETE`   | Soft-deactivate (`isActive: false`), not a hard delete |
| `PATCH`  | `/process-steps/:id/restore` | `PROCESS_STEP_UPDATE` | Reactivate (`isActive: true`)              |

Row shape: `{ id, code, nameTh, nameEn, description, isActive, createdBy, updatedBy, createdAt, updatedAt }`. Seeded on creation (migration `1786700000007-AddProcessStepsMaster.ts`) with 8 example rows (`PS-01` สั่งผลิต … `PS-08` ปิดกระบวนการผลิต) — an editable starting catalog, not a fixed enum; add/deactivate more via this CRUD. `product_workflow_steps.process_step_id` has `ON DELETE RESTRICT` against this table, so a process step referenced by any workflow step cannot be hard-deleted (not that this API exposes a hard delete anyway — only soft-deactivate).

Permission codes (`PROCESS_STEP_VIEW/CREATE/UPDATE/DELETE`) are not seeded into any permissions table yet — same caveat as `BOMS_*`/`PRODUCT_WORKFLOWS_*`, work for `SUPER_ADMIN` only until seeded.
