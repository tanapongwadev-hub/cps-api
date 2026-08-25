/**
 * Seed master data for the rebuilt Products/BOMs feature
 * (products schema v2 + 5 new master tables).
 *
 * - Product models (5)    → master.product_models
 * - Customers (4)         → master.customers
 * - Locations (3)         → master.locations
 * - Product types (3)     → master.product_types
 * - Process lines (4)     → master.process_lines
 * - Products (4)          → master.products
 * - Product BOMs (2)      → master.product_boms + product_bom_items
 *
 * Run from the project root:
 *   node -r tsconfig-paths/register --import-file ./node_modules/ts-node/esm.mjs \
 *        src/database/seeds/seed-master-data.ts
 *
 * Or the simpler path used by the project (the ts-node + tsconfig-paths
 * stack expects the .ts extension):
 *   node ./node_modules/ts-node/dist/bin.js -r tsconfig-paths/register \
 *        src/database/seeds/seed-master-data.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../../config/database.config';

async function seedMasterData() {
  const config = getDatabaseConfig();
  const dataSource = new DataSource({ ...config, logging: false });

  try {
    await dataSource.initialize();
    console.log('✓ Database connection established');
    const qr = dataSource.createQueryRunner();
    const now = new Date().toISOString();

    // ============================================================
    // 1) Units (already seeded by base seed, just fetch ids)
    // ============================================================
    console.log('\nResolving units...');
    const unitIdMap: Record<string, string> = {};
    const unitCodes = ['PCS', 'SET', 'KG', 'LTR', 'COIL', 'SHEET', 'PIPE'];
    for (const code of unitCodes) {
      const rows = await qr.query(`SELECT id FROM master.units WHERE code = $1`, [code]);
      if (rows.length > 0) {
        unitIdMap[code] = rows[0].id;
        console.log(`  - unit ${code} -> id=${rows[0].id}`);
      }
    }

    // ============================================================
    // 2) Delivery types
    // ============================================================
    console.log('\nResolving delivery types...');
    const deliveryTypeIdMap: Record<string, string> = {};
    const deliverySeed = [
      { code: 'NORMAL', nameTh: 'จัดส่งปกติ', nameEn: 'Normal Delivery' },
      { code: 'EXPRESS', nameTh: 'จัดส่งด่วน', nameEn: 'Express Delivery' },
      { code: 'PICKUP', nameTh: 'รับเอง', nameEn: 'Pickup' },
    ];
    for (const d of deliverySeed) {
      const existing = await qr.query(`SELECT id FROM master.delivery_types WHERE code = $1`, [d.code]);
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.delivery_types (code, name_th, name_en, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $4) RETURNING id`,
          [d.code, d.nameTh, d.nameEn, now],
        );
        deliveryTypeIdMap[d.code] = r[0].id;
        console.log(`  ✓ Created delivery_type: ${d.code}`);
      } else {
        deliveryTypeIdMap[d.code] = existing[0].id;
        console.log(`  - delivery_type already exists: ${d.code}`);
      }
    }

    // ============================================================
    // 3) Loading points
    // ============================================================
    console.log('\nResolving loading points...');
    const loadingPointIdMap: Record<string, string> = {};
    const loadingPointSeed = [
      { code: 'DOCK-1', nameTh: 'จุดขนถ่าย 1', nameEn: 'Loading Dock 1' },
      { code: 'DOCK-2', nameTh: 'จุดขนถ่าย 2', nameEn: 'Loading Dock 2' },
      { code: 'DOCK-3', nameTh: 'จุดขนถ่าย 3', nameEn: 'Loading Dock 3' },
    ];
    for (const lp of loadingPointSeed) {
      const existing = await qr.query(`SELECT id FROM master.loading_points WHERE code = $1`, [lp.code]);
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.loading_points (code, name_th, name_en, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $4) RETURNING id`,
          [lp.code, lp.nameTh, lp.nameEn, now],
        );
        loadingPointIdMap[lp.code] = r[0].id;
        console.log(`  ✓ Created loading_point: ${lp.code}`);
      } else {
        loadingPointIdMap[lp.code] = existing[0].id;
        console.log(`  - loading_point already exists: ${lp.code}`);
      }
    }

    // ============================================================
    // 4) Product models (NEW)
    // ============================================================
    console.log('\nSeeding product_models...');
    const productModelIdMap: Record<string, string> = {};
    const productModelSeed = [
      { code: 'CMRY-2024', nameTh: 'Toyota Camry 2024', nameEn: 'Toyota Camry 2024', brand: 'Toyota' },
      { code: 'CIVC-2024', nameTh: 'Honda Civic 2024', nameEn: 'Honda Civic 2024', brand: 'Honda' },
      { code: 'CRLA-2024', nameTh: 'Toyota Corolla Altis 2024', nameEn: 'Toyota Corolla Altis 2024', brand: 'Toyota' },
      { code: 'HILX-2024', nameTh: 'Toyota Hilux Revo 2024', nameEn: 'Toyota Hilux Revo 2024', brand: 'Toyota' },
      { code: 'FRZA-2024', nameTh: 'Mazda BT-50 2024', nameEn: 'Mazda BT-50 2024', brand: 'Mazda' },
    ];
    for (const m of productModelSeed) {
      const existing = await qr.query(`SELECT id FROM master.product_models WHERE code = $1`, [m.code]);
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.product_models (code, name_th, name_en, brand, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, true, $5, $5) RETURNING id`,
          [m.code, m.nameTh, m.nameEn, m.brand, now],
        );
        productModelIdMap[m.code] = r[0].id;
        console.log(`  ✓ Created product_model: ${m.code}`);
      } else {
        productModelIdMap[m.code] = existing[0].id;
        console.log(`  - product_model already exists: ${m.code}`);
      }
    }

    // ============================================================
    // 5) Customers (NEW)
    // ============================================================
    console.log('\nSeeding customers...');
    const customerIdMap: Record<string, string> = {};
    const customerSeed = [
      { code: 'CUST-TOY', nameTh: 'บริษัท โตโยต้า มอเตอร์ จำกัด', nameEn: 'Toyota Motor Thailand', taxId: '0105556000123', contactName: 'คุณสมชาย ใจดี', telephone: '02-555-6000' },
      { code: 'CUST-HND', nameTh: 'บริษัท ฮอนด้า ออโตโมบิล จำกัด', nameEn: 'Honda Automobile Thailand', taxId: '0105555000234', contactName: 'คุณสมหญิง รักไทย', telephone: '02-555-5000' },
      { code: 'CUST-MZD', nameTh: 'บริษัท มาสด้า เซลส์ จำกัด', nameEn: 'Mazda Sales Thailand', taxId: '0105554000345', contactName: 'คุณมานี ขยัน', telephone: '02-555-4000' },
      { code: 'CUST-ISZ', nameTh: 'บริษัท อีซูซุ มอเตอร์ จำกัด', nameEn: 'Isuzu Motors Thailand', taxId: '0105553000456', contactName: 'คุณมานพ เก่งกล้า', telephone: '02-555-3000' },
    ];
    for (const c of customerSeed) {
      const existing = await qr.query(`SELECT id FROM master.customers WHERE code = $1`, [c.code]);
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.customers (code, name_th, name_en, tax_id, contact_name, telephone, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7) RETURNING id`,
          [c.code, c.nameTh, c.nameEn, c.taxId, c.contactName, c.telephone, now],
        );
        customerIdMap[c.code] = r[0].id;
        console.log(`  ✓ Created customer: ${c.code}`);
      } else {
        customerIdMap[c.code] = existing[0].id;
        console.log(`  - customer already exists: ${c.code}`);
      }
    }

    // ============================================================
    // 6) Locations (NEW)
    // ============================================================
    console.log('\nSeeding locations...');
    const locationIdMap: Record<string, string> = {};
    const locationSeed = [
      { code: 'WH-A1', nameTh: 'คลัง A1', nameEn: 'Warehouse A1', zone: 'A', warehouse: 'Main' },
      { code: 'WH-A2', nameTh: 'คลัง A2', nameEn: 'Warehouse A2', zone: 'A', warehouse: 'Main' },
      { code: 'WH-B1', nameTh: 'คลัง B1', nameEn: 'Warehouse B1', zone: 'B', warehouse: 'Annex' },
    ];
    for (const l of locationSeed) {
      const existing = await qr.query(`SELECT id FROM master.locations WHERE code = $1`, [l.code]);
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.locations (code, name_th, name_en, zone, warehouse, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, $6, $6) RETURNING id`,
          [l.code, l.nameTh, l.nameEn, l.zone, l.warehouse, now],
        );
        locationIdMap[l.code] = r[0].id;
        console.log(`  ✓ Created location: ${l.code}`);
      } else {
        locationIdMap[l.code] = existing[0].id;
        console.log(`  - location already exists: ${l.code}`);
      }
    }

    // ============================================================
    // 7) Product types (NEW)
    // ============================================================
    console.log('\nSeeding product_types...');
    const productTypeIdMap: Record<string, string> = {};
    const productTypeSeed = [
      { code: 'FG', nameTh: 'สินค้าสำเร็จรูป', nameEn: 'Finished Goods', sortOrder: 1 },
      { code: 'SFG', nameTh: 'สินค้ากึ่งสำเร็จรูป', nameEn: 'Semi-Finished Goods', sortOrder: 2 },
      { code: 'WIP', nameTh: 'งานระหว่างทำ', nameEn: 'Work In Process', sortOrder: 3 },
    ];
    for (const pt of productTypeSeed) {
      const existing = await qr.query(`SELECT id FROM master.product_types WHERE code = $1`, [pt.code]);
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.product_types (code, name_th, name_en, sort_order, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, true, $5, $5) RETURNING id`,
          [pt.code, pt.nameTh, pt.nameEn, pt.sortOrder, now],
        );
        productTypeIdMap[pt.code] = r[0].id;
        console.log(`  ✓ Created product_type: ${pt.code}`);
      } else {
        productTypeIdMap[pt.code] = existing[0].id;
        console.log(`  - product_type already exists: ${pt.code}`);
      }
    }

    // ============================================================
    // 8) Process lines (NEW)
    // ============================================================
    console.log('\nSeeding process_lines...');
    const processLineIdMap: Record<string, string> = {};
    const processLineSeed = [
      { code: 'ASM-1', nameTh: 'สายประกอบ 1', nameEn: 'Assembly Line 1' },
      { code: 'WLD-1', nameTh: 'สายเชื่อม 1', nameEn: 'Welding Line 1' },
      { code: 'PNT-1', nameTh: 'สายพ่นสี 1', nameEn: 'Paint Line 1' },
      { code: 'MCH-1', nameTh: 'สายกลึง 1', nameEn: 'Machining Line 1' },
    ];
    for (const pl of processLineSeed) {
      const existing = await qr.query(`SELECT id FROM master.process_lines WHERE code = $1`, [pl.code]);
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.process_lines (code, name_th, name_en, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $4) RETURNING id`,
          [pl.code, pl.nameTh, pl.nameEn, now],
        );
        processLineIdMap[pl.code] = r[0].id;
        console.log(`  ✓ Created process_line: ${pl.code}`);
      } else {
        processLineIdMap[pl.code] = existing[0].id;
        console.log(`  - process_line already exists: ${pl.code}`);
      }
    }

    // ============================================================
    // 9) Products (new schema)
    // ============================================================
    console.log('\nSeeding products (new schema)...');
    const productIdMap: Record<string, string> = {};
    const productSeed = [
      {
        code: 'PRD-001',
        name: 'เครื่องยนต์ 4 สูบ',
        unitCode: 'PCS',
        modelCode: 'HILX-2024',
        customerCode: 'CUST-TOY',
        locationCode: 'WH-A1',
        productTypeCode: 'FG',
        deliveryTypeCode: 'NORMAL',
        loadingPointCode: 'DOCK-1',
        processLineCode: 'ASM-1',
        packing: 1,
        lotSize: 100,
      },
      {
        code: 'PRD-002',
        name: 'ผ้าเบรกหน้า',
        unitCode: 'PCS',
        modelCode: 'CMRY-2024',
        customerCode: 'CUST-TOY',
        locationCode: 'WH-A1',
        productTypeCode: 'FG',
        deliveryTypeCode: 'NORMAL',
        loadingPointCode: 'DOCK-1',
        processLineCode: 'ASM-1',
        packing: 20,
        lotSize: 2000,
      },
      {
        code: 'PRD-003',
        name: 'ชุดกันสะเทือนหลัง',
        unitCode: 'SET',
        modelCode: 'HILX-2024',
        customerCode: 'CUST-ISZ',
        locationCode: 'WH-A2',
        productTypeCode: 'FG',
        deliveryTypeCode: 'EXPRESS',
        loadingPointCode: 'DOCK-2',
        processLineCode: 'WLD-1',
        packing: 4,
        lotSize: 200,
      },
      {
        code: 'PRD-004',
        name: 'แผงหน้าปัดดิจิทัล',
        unitCode: 'PCS',
        modelCode: 'CIVC-2024',
        customerCode: 'CUST-HND',
        locationCode: 'WH-B1',
        productTypeCode: 'SFG',
        deliveryTypeCode: 'EXPRESS',
        loadingPointCode: 'DOCK-3',
        processLineCode: 'ASM-1',
        packing: 10,
        lotSize: 500,
      },
    ];
    for (const p of productSeed) {
      const existing = await qr.query(`SELECT id FROM master.products WHERE code = $1`, [p.code]);
      // safety_stock = lotSize, min_stock = packing (formulas match service)
      const safetyStock = p.lotSize;
      const minStock = p.packing;
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.products
            (code, name, unit_id, model_id, customer_id, packing, location_id, safety_stock,
             product_type_id, lot_size, min_stock, delivery_type_id, scale, loading_point_id,
             process_line_id, is_active, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$16,$16) RETURNING id`,
          [
            p.code,
            p.name,
            unitIdMap[p.unitCode],
            productModelIdMap[p.modelCode],
            customerIdMap[p.customerCode],
            p.packing,
            locationIdMap[p.locationCode],
            safetyStock,
            productTypeIdMap[p.productTypeCode],
            p.lotSize,
            minStock,
            deliveryTypeIdMap[p.deliveryTypeCode],
            '1:1',
            loadingPointIdMap[p.loadingPointCode],
            processLineIdMap[p.processLineCode],
            now,
          ],
        );
        productIdMap[p.code] = r[0].id;
        console.log(`  ✓ Created product: ${p.code} (safety=${safetyStock}, min=${minStock})`);
      } else {
        productIdMap[p.code] = existing[0].id;
        console.log(`  - product already exists: ${p.code}`);
      }
    }

    // ============================================================
    // 10) Materials (used by BOMs)
    // ============================================================
    console.log('\nResolving materials...');
    const matIdMap: Record<string, string> = {};
    const materialSeed = [
      { code: 'MAT-001', name: 'เหล็กกล้าคาร์บอน', unitCode: 'KG' },
      { code: 'MAT-004', name: 'น้ำมันเครื่อง', unitCode: 'LTR' },
      { code: 'MAT-005', name: 'ผ้าเบรก', unitCode: 'PCS' },
    ];
    for (const m of materialSeed) {
      const existing = await qr.query(`SELECT id FROM master.materials WHERE code = $1`, [m.code]);
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.materials (code, name, unit_id, is_active, packing_quantity, created_at, updated_at)
           VALUES ($1, $2, $3, true, 1, $4, $4) RETURNING id`,
          [m.code, m.name, unitIdMap[m.unitCode], now],
        );
        matIdMap[m.code] = r[0].id;
        console.log(`  ✓ Created material: ${m.code}`);
      } else {
        matIdMap[m.code] = existing[0].id;
        console.log(`  - material already exists: ${m.code}`);
      }
    }

    // ============================================================
    // 11) Product BOMs
    // ============================================================
    console.log('\nSeeding product BOMs...');
    const bomSeed = [
      {
        productCode: 'PRD-001',
        version: 'v1',
        status: 'ACTIVE',
        specification: 'BOM สำหรับเครื่องยนต์ 4 สูบ',
        remark: 'ใช้วัตถุดิบคุณภาพสูง',
        items: [
          { materialCode: 'MAT-001', quantity: 250, unitCode: 'KG', wastagePercent: 5 },
          { materialCode: 'MAT-004', quantity: 5, unitCode: 'LTR', wastagePercent: null },
        ],
      },
      {
        productCode: 'PRD-002',
        version: 'v1',
        status: 'DRAFT',
        specification: 'BOM สำหรับผ้าเบรกหน้า',
        remark: null,
        items: [{ materialCode: 'MAT-005', quantity: 2, unitCode: 'PCS', wastagePercent: 10 }],
      },
    ];
    for (const bom of bomSeed) {
      const productId = productIdMap[bom.productCode];
      const existing = await qr.query(
        `SELECT id FROM master.product_boms WHERE product_id = $1 AND version = $2`,
        [productId, bom.version],
      );
      let bomId: string;
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.product_boms (product_id, version, status, specification, remark, effective_from, effective_to, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, '2026-01-01', null, $6, $6) RETURNING id`,
          [productId, bom.version, bom.status, bom.specification, bom.remark, now],
        );
        bomId = r[0].id;
        console.log(`  ✓ Created BOM: ${bom.productCode} ${bom.version} (${bom.status})`);
      } else {
        bomId = existing[0].id;
        console.log(`  - BOM already exists: ${bom.productCode} ${bom.version}`);
        continue;
      }
      for (let i = 0; i < bom.items.length; i++) {
        const item = bom.items[i];
        await qr.query(
          `INSERT INTO master.product_bom_items (bom_id, material_id, sort_order, quantity, unit_id, is_scrap, wastage_percent, remark, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, false, $6, null, $7, $7)`,
          [bomId, matIdMap[item.materialCode], i + 1, item.quantity, unitIdMap[item.unitCode], item.wastagePercent, now],
        );
      }
      console.log(`    → Added ${bom.items.length} items`);
    }

    console.log('\n✓ Master data seed complete!');
    await qr.release();
  } catch (err) {
    console.error('Error seeding master data:', err);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

seedMasterData();
