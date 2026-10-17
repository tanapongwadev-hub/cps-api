import { MigrationInterface, QueryRunner } from 'typeorm';

// เมนู 3 ตัวนี้เคยชี้ไปใช้ permission code ของเมนูอื่น (code ต้องไม่ซ้ำ)
// seed จึงข้ามไป เมนูไม่มี permission ของตัวเอง ผู้ใช้ทั่วไปจึงไม่เห็นในแถบเมนู
// แก้ด้วย permission นำทางของตัวเอง (action READ) ที่คุมเฉพาะการแสดงเมนู
// หน้าจอยังต้องใช้สิทธิ์ข้อมูลเดิม (เช่น MATERIAL_VIEW) ตามเดิม
// ขอบเขตแผนกเริ่มต้นคัดลอกจากสิทธิ์ข้อมูล เพื่อให้คนที่เปิดหน้าได้อยู่แล้วเห็นเมนู
// ดู docs/plans/2026-10-17-permission-management-plan.md (admin-dashboard) ขั้นที่ 5
const NAVIGATION_PERMISSIONS = [
  {
    menuCode: 'MATERIALS_PC_OVERVIEW',
    code: 'MATERIALS_PC_OVERVIEW_VIEW',
    description: 'แสดงเมนูทะเบียนวัสดุ (ดูข้อมูลต้องมี MATERIAL_VIEW)',
    sources: ['MATERIAL_VIEW'],
  },
  {
    menuCode: 'PRODUCTION_TRACEABILITY',
    code: 'PRODUCTION_TRACEABILITY_VIEW',
    description: 'แสดงเมนูสอบกลับการผลิต (ดูข้อมูลต้องมี PRODUCTION_ORDER_VIEW)',
    sources: ['PRODUCTION_ORDER_VIEW'],
  },
  {
    menuCode: 'MATERIALS_REPORT',
    code: 'MATERIALS_REPORT_VIEW',
    description:
      'แสดงเมนูรายงานวัสดุ (ดูข้อมูลต้องมี MATERIALS_RECEIVING_VIEW หรือ MATERIALS_DISBURSEMENT_VIEW)',
    sources: ['MATERIALS_RECEIVING_VIEW', 'MATERIALS_DISBURSEMENT_VIEW'],
  },
];

export class AddMenuNavigationPermissions1790600000035
  implements MigrationInterface
{
  name = 'AddMenuNavigationPermissions1790600000035';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const item of NAVIGATION_PERMISSIONS) {
      // Scope: ALL if any source is ALL (or missing), else the union of the
      // sources' active departments.
      const sources = (await queryRunner.query(
        `SELECT p.id, p.access_scope FROM iam.permissions p WHERE p.code = ANY($1)`,
        [item.sources],
      )) as Array<{ id: string; access_scope: string }>;
      const restricted =
        sources.length > 0 &&
        sources.every((source) => source.access_scope === 'DEPARTMENTS');

      const inserted = (await queryRunner.query(
        `INSERT INTO iam.permissions
           (menu_id, action_id, code, description, access_scope, is_active,
            created_at, updated_at)
         SELECT menu.id, action.id, $2, $3, $4, true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.menus menu
         CROSS JOIN iam.actions action
         WHERE menu.code = $1 AND action.code = 'READ'
         ON CONFLICT (code) DO NOTHING
         RETURNING id`,
        [
          item.menuCode,
          item.code,
          item.description,
          restricted ? 'DEPARTMENTS' : 'ALL',
        ],
      )) as Array<{ id: string }>;
      const permissionId = inserted[0]?.id;
      if (!permissionId || !restricted) continue;

      await queryRunner.query(
        `INSERT INTO iam.department_permissions
           (permission_id, department_id, is_active, created_at, updated_at)
         SELECT DISTINCT $1::bigint, dp.department_id, true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM iam.department_permissions dp
         WHERE dp.permission_id = ANY($2::bigint[]) AND dp.is_active
         ON CONFLICT (permission_id, department_id) DO NOTHING`,
        [permissionId, sources.map((source) => source.id)],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const codes = NAVIGATION_PERMISSIONS.map((item) => item.code);
    await queryRunner.query(
      `DELETE FROM iam.user_department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = ANY($1))`,
      [codes],
    );
    await queryRunner.query(
      `DELETE FROM iam.department_permissions
       WHERE permission_id IN (SELECT id FROM iam.permissions WHERE code = ANY($1))`,
      [codes],
    );
    await queryRunner.query(`DELETE FROM iam.permissions WHERE code = ANY($1)`, [
      codes,
    ]);
  }
}
