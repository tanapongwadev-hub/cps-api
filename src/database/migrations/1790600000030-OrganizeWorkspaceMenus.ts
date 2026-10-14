import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizeWorkspaceMenus1790600000030 implements MigrationInterface {
  name = 'OrganizeWorkspaceMenus1790600000030';

  async up(runner: QueryRunner): Promise<void> {
    // Serialize with menu management; retain IDs, routes, permissions and visibility.
    await runner.query('LOCK TABLE iam.menus IN SHARE ROW EXCLUSIVE MODE');
    for (const [code, th, en, icon, order] of [
      ['PRODUCT_ENGINEERING', 'สินค้าและวิศวกรรม', 'Products and Engineering', 'git-branch', 4],
      ['REPORTS_AUDIT', 'รายงานและตรวจสอบ', 'Reports and Audit', 'file-bar-chart', 5],
      ['REFERENCE_SYSTEM', 'ข้อมูลพื้นฐานและระบบ', 'Reference Data and System', 'database', 6],
    ] as const) {
      await runner.query(`INSERT INTO iam.menus
        (code,name_th,name_en,menu_type,path,icon,sort_order,parent_id,is_visible,is_active,created_at,updated_at)
        VALUES ($1,$2,$3,'MAIN',NULL,$4,$5,NULL,true,true,now(),now())
        ON CONFLICT(code) DO UPDATE SET name_th=EXCLUDED.name_th,name_en=EXCLUDED.name_en,
          menu_type='MAIN',path=NULL,parent_id=NULL,icon=EXCLUDED.icon,
          sort_order=EXCLUDED.sort_order,updated_at=now()`, [code, th, en, icon, order]);
    }

    // NULL parent denotes a workspace root. Existing descendants (including
    // BUTTON permission nodes) travel with their parent and remain intact.
    const layout: [string, string | null, number, string, string][] = [
      ['DASHBOARD', null, 0, 'ภาพรวม', 'Overview'],
      ['MATERIALS_MANAGEMENTS', null, 1, 'คลังวัสดุ', 'Material Warehouse'],
      ['MATERIAL_PROCESSING', null, 2, 'แปรรูปวัตถุดิบ', 'Material Processing'],
      ['PRODUCTION_PLANNING', null, 3, 'วางแผนและดำเนินการผลิต', 'Production Planning and Execution'],
      ['MATERIALS_PC_OVERVIEW', 'MATERIALS_MANAGEMENTS', 0, 'ทะเบียนวัสดุ', 'Material Registry'],
      ['MATERIALS_RECEIVING', 'MATERIALS_MANAGEMENTS', 1, 'รับเข้าวัสดุ', 'Materials Receiving'],
      ['MATERIAL_JOB_ORDERS', 'MATERIALS_MANAGEMENTS', 2, 'ใบจัดงาน', 'Job Orders'],
      ['MATERIALS_DISBURSEMENT', 'MATERIALS_MANAGEMENTS', 3, 'จ่ายออกวัสดุ', 'Materials Disbursement'],
      ['PRODUCTION_PLANS', 'PRODUCTION_PLANNING', 0, 'แผนผลิตสินค้า', 'Product Production Plans'],
      ['MATERIAL_PRODUCTION_PLANS', 'PRODUCTION_PLANNING', 1, 'แผนผลิตวัสดุภายใน', 'Internal Material Production Plans'],
      ['PROCESS_PRODUCTION', 'PRODUCTION_PLANNING', 2, 'สั่งผลิตตามกระบวนการ', 'Process Production'],
      ['PRODUCTS_LIST', 'PRODUCT_ENGINEERING', 0, 'ทะเบียนสินค้า', 'Product Registry'],
      ['BOM_WORKFLOW', 'PRODUCT_ENGINEERING', 1, 'BOM และขั้นตอนการผลิต', 'BOM and Workflow'],
      ['BOMS', 'BOM_WORKFLOW', 0, 'BOM และขั้นตอนการผลิตสินค้า', 'Product BOM and Workflow'],
      ['MATERIAL_ENGINEERING', 'BOM_WORKFLOW', 1, 'BOM และขั้นตอนการผลิตวัสดุ', 'Material BOM and Workflow'],
      ['MATERIALS_REPORT', 'REPORTS_AUDIT', 0, 'รายงานติดตามวัสดุ', 'Material Traceability'],
      ['PRODUCTION_TRACEABILITY', 'REPORTS_AUDIT', 1, 'สอบกลับการผลิต', 'Production Traceability'],
      ['AUDIT_LOG', 'REPORTS_AUDIT', 2, 'บันทึกการตรวจสอบ', 'Audit Log'],
      ['MASTER DATA', 'REFERENCE_SYSTEM', 0, 'ข้อมูลพื้นฐาน', 'Reference Data'],
      ['ACCESS CONTROL', 'REFERENCE_SYSTEM', 1, 'ผู้ใช้งานและสิทธิ์', 'Users and Access Control'],
      ['MENU_MANAGEMENT', 'REFERENCE_SYSTEM', 2, 'จัดการเมนู', 'Menu Management'],
    ];
    for (const [code, parent, order, th, en] of layout) {
      if (parent) {
        const rows = await runner.query('SELECT id FROM iam.menus WHERE code=$1', [parent]);
        if (!rows.length) throw new Error(`Missing menu category: ${parent}`);
      }
      await runner.query(`UPDATE iam.menus SET
        parent_id=(SELECT id FROM iam.menus WHERE code=$2),
        menu_type='${parent ? 'SUB' : 'MAIN'}',
        sort_order=$3,name_th=$4,name_en=$5,updated_at=now() WHERE code=$1`,
      [code, parent, order, th, en]);
    }
    // Include hidden and custom menus so subsequent drag-and-drop saves still
    // satisfy the backend's contiguous zero-based sibling ordering contract.
    await runner.query(`WITH ranked AS (
      SELECT id,(row_number() OVER (PARTITION BY parent_id ORDER BY sort_order,id)-1)::int AS position
      FROM iam.menus
    ) UPDATE iam.menus m SET sort_order=r.position,updated_at=now()
      FROM ranked r WHERE m.id=r.id AND m.sort_order<>r.position`);
  }

  async down(): Promise<void> {
    throw new Error('Use a forward migration to preserve menu customizations and permission mappings');
  }
}
