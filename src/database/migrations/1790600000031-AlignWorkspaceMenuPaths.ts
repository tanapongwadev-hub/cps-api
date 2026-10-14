import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignWorkspaceMenuPaths1790600000031 implements MigrationInterface {
  name = 'AlignWorkspaceMenuPaths1790600000031';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query('LOCK TABLE iam.menus IN SHARE ROW EXCLUSIVE MODE');
    // One projection from original paths: specific descendants win over parents.
    // Menu IDs, permissions, order, activity and visibility remain unchanged.
    await runner.query(`WITH aliases(source,destination,priority) AS (VALUES
      ('/products/process-orders','/production/products/orders',0),
      ('/materials/process-orders','/production/internal-materials/orders',1),
      ('/production/material-plans','/production/internal-materials/plans',2),
      ('/production/plans','/production/products/plans',3),
      ('/production/traceability','/reports/production',4),
      ('/materials/materials-report','/reports/materials',5),
      ('/materials/materials-receiving','/materials/receiving',6),
      ('/materials/materials-disbursement','/materials/disbursements',7),
      ('/materials/pc','/materials/catalog',8),
      ('/products/list','/engineering/products',9),
      ('/products','/engineering/products',10),
      ('/bom-workflow','/engineering/bom',11),
      ('/audit-logs','/reports/audit-logs',12),
      ('/analytics','/reports/analytics',13),
      ('/menus','/system/menus',14),
      ('/users','/system/users',15),
      ('/settings','/system/settings',16),
      ('/departments','/system/departments',17),
      ('/roles','/system/roles',18),
      ('/permissions','/system/permissions',19),
      ('/sessions','/system/sessions',20)
    ), projected AS (
      SELECT m.id,a.destination || substring(m.path FROM length(a.source)+1) AS path
      FROM iam.menus m
      CROSS JOIN LATERAL (
        SELECT * FROM aliases a
        WHERE m.path=a.source OR starts_with(m.path,a.source || '/')
        ORDER BY a.priority LIMIT 1
      ) a
    ) UPDATE iam.menus m SET path=p.path,updated_at=now()
      FROM projected p WHERE m.id=p.id`);
    // The existing Reference Data hub already has a real protected page.
    await runner.query(`UPDATE iam.menus SET path='/master-data',updated_at=now()
      WHERE code='MASTER DATA' AND (path IS NULL OR path='')`);
  }

  async down(): Promise<void> {
    throw new Error('Use a forward migration to preserve subsequent menu path customizations');
  }
}
