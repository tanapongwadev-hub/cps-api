import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPiecesQrToReceiving1786700000002 implements MigrationInterface {
  name = 'AddPiecesQrToReceiving1786700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // pieces_qr_code: base64 PNG image of the pieces QR (for PIPE/SHEET/COIL only)
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
      ADD COLUMN pieces_qr_code TEXT NULL;
    `);

    // pieces_qr_payload: JSON containing pieces-specific QR metadata
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
      ADD COLUMN pieces_qr_payload JSONB NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
      DROP COLUMN IF EXISTS pieces_qr_payload;
    `);
    await queryRunner.query(`
      ALTER TABLE inventory.material_receivings
      DROP COLUMN IF EXISTS pieces_qr_code;
    `);
  }
}
