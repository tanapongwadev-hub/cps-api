import { MigrationInterface, QueryRunner } from 'typeorm';

// วัสดุหลังแปรรูป (PCS ที่ผูกจาก PIPE/SHEET/COIL ผ่าน processing_material_id) เคยถูกสร้าง
// โดยไม่มีซัพพลายเออร์ ฟอร์มแก้ไขจึงว่าง จากนี้ MaterialsService เพิ่มซัพพลายเออร์ของต้นทาง
// ให้เอง migration นี้เติมข้อมูลเดิม: เพิ่มเฉพาะคู่ (ปลายทาง, ซัพพลายเออร์) ที่ยังไม่มีแถวเลย
export class CopySuppliersToProcessedOutputs1790600000062 implements MigrationInterface {
  name = 'CopySuppliersToProcessedOutputs1790600000062';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO master.supplier_materials (material_id, supplier_id, is_active, created_by, updated_by)
      SELECT DISTINCT source.processing_material_id, mapping.supplier_id, true, NULL::bigint, NULL::bigint
      FROM master.materials source
      JOIN master.supplier_materials mapping
        ON mapping.material_id = source.id AND mapping.is_active
      WHERE source.processing_material_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM master.supplier_materials existing
          WHERE existing.material_id = source.processing_material_id
            AND existing.supplier_id = mapping.supplier_id
        )
    `);
  }

  async down(): Promise<void> {
    // Data backfill only: the added rows cannot be told apart from ones made
    // later through the form, so nothing is removed on revert.
  }
}
