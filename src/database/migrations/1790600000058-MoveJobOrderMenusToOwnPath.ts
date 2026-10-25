import { MigrationInterface, QueryRunner } from 'typeorm';

// ใบจัดงานเคยอยู่ใต้ /materials/job-orders จึงใช้ prefix เดียวกับเมนู "คลังวัสดุ" (/materials)
// และถูกไฮไลต์/ขยายพร้อมกัน ย้ายไปใช้ path ของตัวเอง /job-orders (browser route เท่านั้น)
export class MoveJobOrderMenusToOwnPath1790600000058 implements MigrationInterface {
  name = 'MoveJobOrderMenusToOwnPath1790600000058';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus
          SET path = '/job-orders' || substring(path FROM length('/materials/job-orders') + 1),
              updated_at = now()
        WHERE path = '/materials/job-orders' OR path LIKE '/materials/job-orders/%'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus
          SET path = '/materials/job-orders' || substring(path FROM length('/job-orders') + 1),
              updated_at = now()
        WHERE code IN ('MATERIAL_JOB_ORDERS', 'PRODUCT_JOB_ORDERS', 'INTERNAL_MATERIAL_JOB_ORDERS')
          AND (path = '/job-orders' OR path LIKE '/job-orders/%')`,
    );
  }
}
