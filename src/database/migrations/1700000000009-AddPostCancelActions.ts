import { MigrationInterface, QueryRunner } from 'typeorm';

interface ActionSeed {
  code: string;
  nameTh: string;
  nameEn: string;
  sortOrder: number;
}

const ACTIONS: readonly ActionSeed[] = [
  { code: 'POST', nameTh: 'รับรองเอกสาร', nameEn: 'Post', sortOrder: 5 },
  { code: 'CANCEL', nameTh: 'ยกเลิกเอกสาร', nameEn: 'Cancel', sortOrder: 6 },
];

export class AddPostCancelActions1700000000009 implements MigrationInterface {
  name = 'AddPostCancelActions1700000000009';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const action of ACTIONS) {
      await queryRunner.query(
        `INSERT INTO iam.actions (code, name_th, name_en, sort_order, is_system, is_active)
         VALUES ($1, $2, $3, $4, true, true)
         ON CONFLICT (code) DO NOTHING`,
        [action.code, action.nameTh, action.nameEn, action.sortOrder],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // iam.permissions.action_id และ iam.role_actions.action_id เป็น ON DELETE CASCADE
    // การลบ action จึงลบ permission และ role_action ที่อ้างถึงให้เอง
    for (const action of ACTIONS) {
      await queryRunner.query(`DELETE FROM iam.actions WHERE code = $1`, [
        action.code,
      ]);
    }
  }
}
