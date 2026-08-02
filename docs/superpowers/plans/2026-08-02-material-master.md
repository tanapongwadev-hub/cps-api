# Material Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add the approved PostgreSQL Material Master schema and matching TypeORM entities for materials, lookup data, suppliers, and their many-to-many association.

**Architecture:** A new master PostgreSQL schema owns seven normalized tables. Material keeps one required unit, optional delivery/model/loading references, a text process-line name, a text scale, and one image path; supplier relationships use the explicit supplier_materials entity so status and audit fields remain first-class.

**Tech Stack:** NestJS 11, TypeScript 5.7, TypeORM 0.3, PostgreSQL 14+, Jest 30

## Global Constraints

- The approved requirement source is docs/wiki/material-master.md.
- Material uses one required field named name; do not add name_th or name_en to materials.
- Material code is the single company-wide code; do not add supplier-specific material codes.
- One material has exactly one unit and may have many suppliers.
- delivery_type_id, model_id, loading_point_id, process_line_name, scale, and image_path are nullable.
- Store one image path or URL per material; do not store image binary or Base64.
- Do not create process_lines or process_line_id.
- Do not add minimum stock, current stock, receipts, purchase orders, prices, lots, expiry data, warehouses, or stock movements.
- Database columns use snake_case; TypeScript properties use camelCase.
- Use bigint database IDs represented as string in TypeScript, matching existing IAM entities.
- Keep synchronize disabled and introduce schema changes only through a new migration.

---

## File Map

Create:

- src/database/migrations/1700000000005-CreateMaterialMaster.ts — schema and table migration.
- src/database/migrations/1700000000005-CreateMaterialMaster.spec.ts — migration SQL tests.
- src/entities/master/unit.entity.ts — unit lookup.
- src/entities/master/delivery-type.entity.ts — delivery type lookup.
- src/entities/master/material-model.entity.ts — material model lookup.
- src/entities/master/loading-point.entity.ts — loading point lookup.
- src/entities/master/material.entity.ts — material master and relations.
- src/entities/master/supplier.entity.ts — supplier master.
- src/entities/master/supplier-material.entity.ts — explicit Material/Supplier association.
- src/entities/master/master-lookups.entity.spec.ts — lookup metadata tests.
- src/entities/master/material.entity.spec.ts — Material metadata tests.
- src/entities/master/supplier.entity.spec.ts — Supplier metadata tests.
- src/entities/master/supplier-material.entity.spec.ts — association metadata tests.

Modify:

- PROJECT-WIKI.md — add the implemented master schema and entity directory to the project map.

No AppModule change is required: both runtime and CLI TypeORM configurations already discover src/**/*.entity files.

---

### Task 1: PostgreSQL Material Master migration

**Files:**

- Create: src/database/migrations/1700000000005-CreateMaterialMaster.spec.ts
- Create: src/database/migrations/1700000000005-CreateMaterialMaster.ts

**Interfaces:**

- Consumes: TypeORM MigrationInterface and QueryRunner.
- Produces: CreateMaterialMaster1700000000005 with up(queryRunner) and down(queryRunner).
- Produces seven tables in schema master.

- [ ] **Step 1: Write the failing migration tests**

Create the test with these exact assertions:

~~~ts
import { CreateMaterialMaster1700000000005 } from './1700000000005-CreateMaterialMaster';

describe('CreateMaterialMaster1700000000005', () => {
  it('creates the approved material master schema', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new CreateMaterialMaster1700000000005();

    await migration.up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS master');
    for (const table of [
      'units',
      'delivery_types',
      'material_models',
      'loading_points',
      'suppliers',
      'materials',
      'supplier_materials',
    ]) {
      expect(sql).toContain('CREATE TABLE master.' + table);
    }
    expect(sql).toContain('name VARCHAR(255) NOT NULL');
    expect(sql).not.toContain('CREATE TABLE master.process_lines');
    expect(sql).not.toContain('process_line_id');
    expect(sql).toContain('process_line_name VARCHAR(255)');
    expect(sql).toContain('scale VARCHAR(255)');
    expect(sql).toContain('image_path VARCHAR(500)');
    expect(sql).toContain('UNIQUE (material_id, supplier_id)');
    expect(sql).toContain(
      'FOREIGN KEY (unit_id) REFERENCES master.units(id) ON DELETE RESTRICT',
    );
  });

  it('drops owned tables in dependency-safe order', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new CreateMaterialMaster1700000000005();

    await migration.down({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql.indexOf('master.supplier_materials')).toBeLessThan(
      sql.indexOf('master.materials'),
    );
    expect(sql.indexOf('master.materials')).toBeLessThan(
      sql.indexOf('master.units'),
    );
    expect(sql).toContain('DROP SCHEMA IF EXISTS master');
    expect(sql).not.toContain('CASCADE');
  });
});
~~~

- [ ] **Step 2: Run the test and verify failure**

Run:

~~~powershell
pnpm.cmd run test database/migrations/1700000000005-CreateMaterialMaster.spec.ts --runInBand
~~~

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Implement the migration**

In up(), execute SQL in this order:

1. CREATE SCHEMA IF NOT EXISTS master.
2. Create units.
3. Create delivery_types, material_models, and loading_points.
4. Create suppliers.
5. Create materials.
6. Create supplier_materials.
7. Create indexes for all foreign-key columns.

Use these exact Material columns and constraints:

~~~sql
CREATE TABLE master.materials (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit_id BIGINT NOT NULL,
  delivery_type_id BIGINT,
  model_id BIGINT,
  loading_point_id BIGINT,
  process_line_name VARCHAR(255),
  scale VARCHAR(255),
  image_path VARCHAR(500),
  specification TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT,
  updated_by BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (unit_id) REFERENCES master.units(id) ON DELETE RESTRICT,
  FOREIGN KEY (delivery_type_id) REFERENCES master.delivery_types(id) ON DELETE RESTRICT,
  FOREIGN KEY (model_id) REFERENCES master.material_models(id) ON DELETE RESTRICT,
  FOREIGN KEY (loading_point_id) REFERENCES master.loading_points(id) ON DELETE RESTRICT
)
~~~

Use these exact association columns:

~~~sql
CREATE TABLE master.supplier_materials (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  material_id BIGINT NOT NULL,
  supplier_id BIGINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT,
  updated_by BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_id) REFERENCES master.materials(id) ON DELETE RESTRICT,
  FOREIGN KEY (supplier_id) REFERENCES master.suppliers(id) ON DELETE RESTRICT,
  UNIQUE (material_id, supplier_id)
)
~~~

The lookup tables use the exact fields in docs/wiki/material-master.md. In down(), drop supplier_materials first, then materials, suppliers, loading_points, material_models, delivery_types, and units. Finally run DROP SCHEMA IF EXISTS master without CASCADE.

- [ ] **Step 4: Run the focused migration tests**

~~~powershell
pnpm.cmd run test database/migrations/1700000000005-CreateMaterialMaster.spec.ts --runInBand
~~~

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/database/migrations/1700000000005-CreateMaterialMaster.ts src/database/migrations/1700000000005-CreateMaterialMaster.spec.ts
git commit -m "feat: add material master schema"
~~~

---

### Task 2: Lookup master entities

**Files:**

- Create: src/entities/master/master-lookups.entity.spec.ts
- Create: src/entities/master/unit.entity.ts
- Create: src/entities/master/delivery-type.entity.ts
- Create: src/entities/master/material-model.entity.ts
- Create: src/entities/master/loading-point.entity.ts

**Interfaces:**

- Produces classes Unit, DeliveryType, MaterialModel, and LoadingPoint.
- Task 3 consumes these classes from Material relations.

- [ ] **Step 1: Write failing metadata tests**

Use getMetadataArgsStorage() and assert:

~~~ts
const expected = [
  [Unit, 'units'],
  [DeliveryType, 'delivery_types'],
  [MaterialModel, 'material_models'],
  [LoadingPoint, 'loading_points'],
] as const;

for (const [target, name] of expected) {
  expect(storage.tables.find((item) => item.target === target)).toMatchObject({
    name,
    schema: 'master',
  });
  expect(
    storage.indices.find(
      (item) =>
        item.target === target &&
        item.unique === true &&
        JSON.stringify(item.columns) === JSON.stringify(['code']),
    ),
  ).toBeDefined();
}
~~~

Also assert Unit has symbol and every lookup has code, nameTh, nameEn, description, isActive, createdBy, updatedBy, createdAt, and updatedAt.

- [ ] **Step 2: Run and verify failure**

~~~powershell
pnpm.cmd run test entities/master/master-lookups.entity.spec.ts --runInBand
~~~

Expected: FAIL because the entity files do not exist.

- [ ] **Step 3: Implement all four entities**

For every entity:

- @Entity(tableName, { schema: 'master' }).
- @Index(['code'], { unique: true }).
- bigint string ID.
- code varchar(20) for Unit and varchar(50) for other lookups.
- nameTh maps name_th varchar(100).
- nullable nameEn maps name_en varchar(100).
- nullable description text.
- isActive maps is_active boolean default true.
- nullable createdBy/updatedBy map bigint audit fields.
- createdAt/updatedAt use timestamp date decorators.

Unit additionally maps nullable symbol varchar(20). Do not add inverse Material relations in this task; that avoids importing a file that is not created until Task 3. Task 3 uses unidirectional ManyToOne lookup relations, which still provides the required Material-to-lookup navigation and foreign-key mapping.

- [ ] **Step 4: Run the test**

~~~powershell
pnpm.cmd run test entities/master/master-lookups.entity.spec.ts --runInBand
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/entities/master/master-lookups.entity.spec.ts src/entities/master/unit.entity.ts src/entities/master/delivery-type.entity.ts src/entities/master/material-model.entity.ts src/entities/master/loading-point.entity.ts
git commit -m "feat: add material lookup entities"
~~~

---

### Task 3: Material and Supplier entities

**Files:**

- Create: src/entities/master/material.entity.spec.ts
- Create: src/entities/master/supplier.entity.spec.ts
- Create: src/entities/master/material.entity.ts
- Create: src/entities/master/supplier.entity.ts

**Interfaces:**

- Produces Material with unit, deliveryType, model, and loadingPoint relations.
- Produces Supplier master fields without importing the not-yet-created association.
- Task 4 consumes both classes.

- [ ] **Step 1: Write failing Material tests**

Assert schema/table, unique code, and these exact metadata rules:

~~~ts
const expectedColumns = {
  unitId: { name: 'unit_id', type: 'bigint' },
  deliveryTypeId: { name: 'delivery_type_id', type: 'bigint', nullable: true },
  modelId: { name: 'model_id', type: 'bigint', nullable: true },
  loadingPointId: { name: 'loading_point_id', type: 'bigint', nullable: true },
  processLineName: {
    name: 'process_line_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  },
  scale: { type: 'varchar', length: 255, nullable: true },
  imagePath: {
    name: 'image_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  },
};
~~~

Assert name is required varchar(255). Assert no properties nameTh, nameEn, or processLineId exist. Assert joins use unit_id, delivery_type_id, model_id, and loading_point_id.

- [ ] **Step 2: Write failing Supplier tests**

Assert Supplier maps master.suppliers, has unique code, required nameTh, and nullable nameEn, taxId, contactName, telephone, email, address, createdBy, and updatedBy. Verify lengths: code 50, names/contact 255, taxId 20, telephone 50, email 255.

- [ ] **Step 3: Run both tests and verify failure**

~~~powershell
pnpm.cmd run test entities/master/material.entity.spec.ts entities/master/supplier.entity.spec.ts --runInBand
~~~

Expected: FAIL because Material and Supplier do not exist.

- [ ] **Step 4: Implement Material**

Implement every section 4 Wiki field with strict nullable types. Add @Index() to four FK ID properties and these relations:

~~~ts
@ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
@JoinColumn({ name: 'unit_id' })
unit: Unit;

@ManyToOne(() => DeliveryType, {
  nullable: true,
  onDelete: 'RESTRICT',
})
@JoinColumn({ name: 'delivery_type_id' })
deliveryType: DeliveryType | null;

@ManyToOne(() => MaterialModel, {
  nullable: true,
  onDelete: 'RESTRICT',
})
@JoinColumn({ name: 'model_id' })
model: MaterialModel | null;

@ManyToOne(() => LoadingPoint, {
  nullable: true,
  onDelete: 'RESTRICT',
})
@JoinColumn({ name: 'loading_point_id' })
loadingPoint: LoadingPoint | null;
~~~

- [ ] **Step 5: Implement Supplier**

Implement section 5.5 Wiki fields with strict nullable types and a unique code index. Do not import SupplierMaterial yet; Task 4 adds both inverse association properties when the association file exists.

- [ ] **Step 6: Run both tests**

~~~powershell
pnpm.cmd run test entities/master/material.entity.spec.ts entities/master/supplier.entity.spec.ts --runInBand
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add src/entities/master/material.entity.ts src/entities/master/material.entity.spec.ts src/entities/master/supplier.entity.ts src/entities/master/supplier.entity.spec.ts
git commit -m "feat: add material and supplier entities"
~~~

---

### Task 4: Supplier-to-Material association

**Files:**

- Create: src/entities/master/supplier-material.entity.spec.ts
- Create: src/entities/master/supplier-material.entity.ts
- Modify: src/entities/master/material.entity.ts
- Modify: src/entities/master/supplier.entity.ts

**Interfaces:**

- Consumes Material and Supplier.
- Produces SupplierMaterial with both FK IDs, status/audit columns, and relations.
- Adds supplierMaterials: SupplierMaterial[] to Material and Supplier in the same compilable change.

- [ ] **Step 1: Write the failing test**

Assert mapping to master.supplier_materials, @Index(['materialId', 'supplierId'], { unique: true }), indexed bigint IDs, isActive default true, nullable audit user IDs, timestamps, join columns, and onDelete RESTRICT. Also assert Material and Supplier each have a OneToMany relation whose inverse side points to the matching SupplierMaterial relation.

- [ ] **Step 2: Run and verify failure**

~~~powershell
pnpm.cmd run test entities/master/supplier-material.entity.spec.ts --runInBand
~~~

Expected: FAIL because SupplierMaterial does not exist.

- [ ] **Step 3: Implement SupplierMaterial**

Map all section 6 Wiki fields and use:

~~~ts
@ManyToOne(() => Material, (material) => material.supplierMaterials, {
  onDelete: 'RESTRICT',
})
@JoinColumn({ name: 'material_id' })
material: Material;

@ManyToOne(() => Supplier, (supplier) => supplier.supplierMaterials, {
  onDelete: 'RESTRICT',
})
@JoinColumn({ name: 'supplier_id' })
supplier: Supplier;
~~~

In the same step, add the inverse property to Material:

~~~ts
@OneToMany(
  () => SupplierMaterial,
  (supplierMaterial) => supplierMaterial.material,
)
supplierMaterials: SupplierMaterial[];
~~~

Add the corresponding inverse property to Supplier:

~~~ts
@OneToMany(
  () => SupplierMaterial,
  (supplierMaterial) => supplierMaterial.supplier,
)
supplierMaterials: SupplierMaterial[];
~~~

- [ ] **Step 4: Run the focused test**

~~~powershell
pnpm.cmd run test entities/master/supplier-material.entity.spec.ts --runInBand
~~~

Expected: PASS.

- [ ] **Step 5: Run all new tests**

~~~powershell
pnpm.cmd run test database/migrations/1700000000005-CreateMaterialMaster.spec.ts entities/master --runInBand
~~~

Expected: all new migration and entity suites PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add src/entities/master/supplier-material.entity.ts src/entities/master/supplier-material.entity.spec.ts src/entities/master/material.entity.ts src/entities/master/supplier.entity.ts
git commit -m "feat: map material supplier associations"
~~~

---

### Task 5: Project map and full verification

**Files:**

- Modify: PROJECT-WIKI.md

**Interfaces:**

- Consumes the completed migration/entities.
- Produces an accurate architecture/data-model map.

- [ ] **Step 1: Update PROJECT-WIKI.md**

Add src/entities/master beside src/entities/iam and list all seven entity files. Add the master schema/table names to the data model. Keep detailed rules in the linked docs/wiki/material-master.md to avoid duplication.

- [ ] **Step 2: Verify documentation references**

~~~powershell
rg -n "entities/master|master.materials|Material Master Requirements" PROJECT-WIKI.md docs/wiki/material-master.md
~~~

Expected: all concepts appear and the linked file exists.

- [ ] **Step 3: Run all unit tests**

~~~powershell
pnpm.cmd run test --runInBand
~~~

Expected: all suites PASS with zero failures.

- [ ] **Step 4: Run the build**

~~~powershell
pnpm.cmd run build
~~~

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 5: Run non-mutating lint**

~~~powershell
pnpm.cmd exec eslint "src/entities/master/**/*.ts" "src/database/migrations/1700000000005-CreateMaterialMaster*.ts"
~~~

Expected: exit code 0 with no lint errors.

- [ ] **Step 6: Check formatting and diff**

~~~powershell
pnpm.cmd exec prettier --check "src/entities/master/**/*.ts" "src/database/migrations/1700000000005-CreateMaterialMaster*.ts" "docs/wiki/material-master.md" "PROJECT-WIKI.md"
git diff --check
git status --short
~~~

Expected: formatting and diff checks pass; status contains only intended files.

- [ ] **Step 7: Commit**

~~~powershell
git add PROJECT-WIKI.md
git commit -m "docs: map material master implementation"
~~~

---

## Completion Criteria

- Migration creates exactly seven approved master tables and no process_lines table.
- Material has name only; it has no nameTh, nameEn, processLineId, minimum-stock, or transaction fields.
- All optional Material fields remain nullable.
- Material/Supplier uniqueness exists in SQL and TypeORM metadata.
- Runtime and CLI entity discovery require no configuration change.
- Focused tests, full Jest, build, ESLint, Prettier, and diff checks pass.
- Both Wiki files match the implemented design.
