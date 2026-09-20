/**
 * Seed 3 mockup materials — one per `type` (PC / OF / OF_MAT) — for
 * exercising /materials/pc and related pages in admin-dashboard.
 *
 * Idempotent: re-running skips any row whose unique code already exists.
 *
 * Run from the cps-api project root:
 *   node ./node_modules/ts-node/dist/bin.js -r tsconfig-paths/register \
 *        src/database/seeds/seed-mock-materials.ts
 */
import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../../config/database.config';

async function seedMockMaterials() {
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
    for (const code of ['KG', 'PIPE']) {
      const rows = await qr.query(
        `SELECT id FROM master.units WHERE code = $1`,
        [code],
      );
      if (rows.length > 0) {
        unitIdMap[code] = rows[0].id;
        console.log(`  - unit ${code} -> id=${rows[0].id}`);
      } else {
        console.warn(`  ! unit ${code} not found — run the base seed first`);
      }
    }

    // ============================================================
    // 2) Delivery types
    // ============================================================
    console.log('\nResolving delivery types...');
    const deliveryTypeIdMap: Record<string, string> = {};
    const deliverySeed = [
      { code: 'TRUCK', nameTh: 'รถบรรทุก', nameEn: 'Truck' },
      { code: 'CONTAINER', nameTh: 'ตู้คอนเทนเนอร์', nameEn: 'Container' },
      { code: 'PICKUP', nameTh: 'รับเองที่หน้าโรงงาน', nameEn: 'Self Pickup' },
    ];
    for (const d of deliverySeed) {
      const existing = await qr.query(
        `SELECT id FROM master.delivery_types WHERE code = $1`,
        [d.code],
      );
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
      { code: 'LP-BPI', nameTh: 'โรงงานบางปะอิน', nameEn: 'Bang Pa-in Plant' },
      { code: 'LP-RYG', nameTh: 'โรงงานระยอง', nameEn: 'Rayong Plant' },
    ];
    for (const lp of loadingPointSeed) {
      const existing = await qr.query(
        `SELECT id FROM master.loading_points WHERE code = $1`,
        [lp.code],
      );
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
    // 4) Material model (used by the PC material only)
    // ============================================================
    console.log('\nSeeding material_models...');
    const materialModelIdMap: Record<string, string> = {};
    const modelSeed = [
      {
        code: 'CIVIC-24',
        nameTh: 'Honda Civic 2024',
        nameEn: 'Honda Civic 2024',
      },
    ];
    for (const m of modelSeed) {
      const existing = await qr.query(
        `SELECT id FROM master.material_models WHERE code = $1`,
        [m.code],
      );
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.material_models (code, name_th, name_en, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $4) RETURNING id`,
          [m.code, m.nameTh, m.nameEn, now],
        );
        materialModelIdMap[m.code] = r[0].id;
        console.log(`  ✓ Created material_model: ${m.code}`);
      } else {
        materialModelIdMap[m.code] = existing[0].id;
        console.log(`  - material_model already exists: ${m.code}`);
      }
    }

    // ============================================================
    // 5) Material types master (PC / OF / OF_MAT — seeded by migration
    //    1786700000011, just fetch ids; create if genuinely missing)
    // ============================================================
    console.log('\nResolving material_types...');
    const materialTypeIdMap: Record<string, string> = {};
    const materialTypeSeed = [
      { code: 'PC', nameTh: 'ชิ้นส่วนหลัก', nameEn: 'PC' },
      { code: 'OF', nameTh: 'วัสดุประกอบ', nameEn: 'OF' },
      { code: 'OF_MAT', nameTh: 'วัสดุสิ้นเปลือง', nameEn: 'OF-MAT' },
    ];
    for (const mt of materialTypeSeed) {
      const existing = await qr.query(
        `SELECT id FROM master.material_types WHERE code = $1`,
        [mt.code],
      );
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.material_types (code, name_th, name_en, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $4) RETURNING id`,
          [mt.code, mt.nameTh, mt.nameEn, now],
        );
        materialTypeIdMap[mt.code] = r[0].id;
        console.log(`  ✓ Created material_type: ${mt.code}`);
      } else {
        materialTypeIdMap[mt.code] = existing[0].id;
        console.log(`  - material_type already exists: ${mt.code}`);
      }
    }

    // ============================================================
    // 6) Suppliers
    // ============================================================
    console.log('\nSeeding suppliers...');
    const supplierIdMap: Record<string, string> = {};
    const supplierSeed = [
      {
        code: 'SUP-001',
        nameTh: 'ซีพีเอส สตีล',
        nameEn: 'CPS Steel Co., Ltd.',
      },
      {
        code: 'SUP-007',
        nameTh: 'ไทยสตีล พาย',
        nameEn: 'Thai Steel Pipe Co., Ltd.',
      },
      {
        code: 'SUP-021',
        nameTh: 'เวลด์โปร ซัพพลาย',
        nameEn: 'WeldPro Supply Co., Ltd.',
      },
    ];
    for (const s of supplierSeed) {
      const existing = await qr.query(
        `SELECT id FROM master.suppliers WHERE code = $1`,
        [s.code],
      );
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.suppliers (code, name_th, name_en, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $4) RETURNING id`,
          [s.code, s.nameTh, s.nameEn, now],
        );
        supplierIdMap[s.code] = r[0].id;
        console.log(`  ✓ Created supplier: ${s.code}`);
      } else {
        supplierIdMap[s.code] = existing[0].id;
        console.log(`  - supplier already exists: ${s.code}`);
      }
    }

    // ============================================================
    // 7) Materials — 1 per type (PC / OF / OF_MAT)
    // ============================================================
    console.log('\nSeeding mock materials...');
    const materialSeed = [
      {
        code: 'PC-AC5C-001',
        name: 'Aluminum Sheet AC5C-T5',
        type: 'PC',
        materialType: 'SHEET',
        ratio: null as number | null,
        unitCode: 'KG',
        deliveryTypeCode: 'TRUCK',
        materialTypeCode: 'PC',
        modelCode: 'CIVIC-24' as string | null,
        loadingPointCode: 'LP-BPI',
        processLineName: 'สาย PC-01',
        scale: '1:1' as string | null,
        specification:
          'อลูมิเนียมแผ่นเกรด AC5C-T5 หนา 3.0 มม. ขนาด 1200x2400 มม.',
        description: 'ใช้สำหรับขึ้นรูปชิ้นส่วนโครงสร้างหลักของผลิตภัณฑ์ PC',
        packingQuantity: 50,
        minimumStock: 100,
        isActive: true,
        supplierCodes: ['SUP-001'],
      },
      {
        code: 'OF-STPIPE-002',
        name: 'Steel Pipe SGP Schedule 40',
        type: 'OF',
        materialType: 'PIPE',
        ratio: 4,
        unitCode: 'PIPE',
        deliveryTypeCode: 'CONTAINER',
        materialTypeCode: 'OF',
        modelCode: null,
        loadingPointCode: 'LP-RYG',
        processLineName: 'สาย OF-02',
        scale: null,
        specification:
          'ท่อเหล็กกล้า SGP Schedule 40 ขนาดเส้นผ่านศูนย์กลาง 2 นิ้ว ยาว 6 ม./ท่อน',
        description: 'ใช้สำหรับงานโครงสร้างและระบบท่อในกระบวนการผลิตทั่วไป',
        packingQuantity: 20,
        minimumStock: 300,
        isActive: true,
        supplierCodes: ['SUP-007'],
      },
      {
        code: 'OFMAT-WIRECOIL-003',
        name: 'Welding Wire Coil ER70S-6',
        type: 'OF_MAT',
        materialType: 'COIL',
        ratio: null,
        unitCode: 'KG',
        deliveryTypeCode: 'PICKUP',
        materialTypeCode: 'OF_MAT',
        modelCode: null,
        loadingPointCode: 'LP-BPI',
        processLineName: 'สาย เชื่อมชิ้นงาน',
        scale: null,
        specification: 'ลวดเชื่อม ER70S-6 ขนาด 1.2 มม. ม้วนละ 15 กก.',
        description: 'วัสดุสิ้นเปลืองสำหรับกระบวนการเชื่อม CO2/MIG',
        packingQuantity: 4,
        minimumStock: 60,
        isActive: false,
        supplierCodes: ['SUP-021', 'SUP-001'],
      },
    ];

    for (const m of materialSeed) {
      const existing = await qr.query(
        `SELECT id FROM master.materials WHERE code = $1`,
        [m.code],
      );
      let materialId: string;
      if (existing.length === 0) {
        const r = await qr.query(
          `INSERT INTO master.materials
            (code, name, type, material_type, ratio, unit_id, delivery_type_id, material_type_id,
             model_id, loading_point_id, process_line_name, scale, specification, description,
             packing_quantity, minimum_stock, is_active, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18) RETURNING id`,
          [
            m.code,
            m.name,
            m.type,
            m.materialType,
            m.ratio,
            unitIdMap[m.unitCode],
            deliveryTypeIdMap[m.deliveryTypeCode],
            materialTypeIdMap[m.materialTypeCode],
            m.modelCode ? materialModelIdMap[m.modelCode] : null,
            loadingPointIdMap[m.loadingPointCode],
            m.processLineName,
            m.scale,
            m.specification,
            m.description,
            m.packingQuantity,
            m.minimumStock,
            m.isActive,
            now,
          ],
        );
        materialId = r[0].id;
        console.log(`  ✓ Created material: ${m.code} (${m.type})`);
      } else {
        materialId = existing[0].id;
        console.log(`  - material already exists: ${m.code}`);
      }

      for (const supplierCode of m.supplierCodes) {
        const supplierId = supplierIdMap[supplierCode];
        if (!supplierId) continue;
        const existingLink = await qr.query(
          `SELECT id FROM master.supplier_materials WHERE material_id = $1 AND supplier_id = $2`,
          [materialId, supplierId],
        );
        if (existingLink.length === 0) {
          await qr.query(
            `INSERT INTO master.supplier_materials (material_id, supplier_id, is_active, created_at, updated_at)
             VALUES ($1, $2, true, $3, $3)`,
            [materialId, supplierId, now],
          );
          console.log(`    ✓ Linked supplier ${supplierCode}`);
        }
      }
    }

    console.log('\n✓ Mock materials seed complete!');
    await qr.release();
  } catch (err) {
    console.error('Error seeding mock materials:', err);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

seedMockMaterials();
