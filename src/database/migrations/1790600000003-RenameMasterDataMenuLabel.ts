import { MigrationInterface, QueryRunner } from 'typeorm';

// The MAIN menu "MASTER DATA" was created through the menu UI with the label
// "MAster Data" (typo, English). Give it the Thai label used everywhere else.
export class RenameMasterDataMenuLabel1790600000003 implements MigrationInterface {
  name = 'RenameMasterDataMenuLabel1790600000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus
       SET name_th = 'ข้อมูลหลัก', name_en = 'Master Data', updated_at = CURRENT_TIMESTAMP
       WHERE code = 'MASTER DATA' AND name_th = 'MAster Data'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE iam.menus SET name_th = 'MAster Data', updated_at = CURRENT_TIMESTAMP
       WHERE code = 'MASTER DATA' AND name_th = 'ข้อมูลหลัก'`,
    );
  }
}
