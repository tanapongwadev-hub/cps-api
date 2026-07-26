import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { getDatabaseConfig } from '../../config/database.config';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnv();
  const [username, password] = process.argv.slice(2);

  if (!username || !password) {
    console.error(
      'Usage: ts-node src/database/seeds/create-super-admin.ts <username> <password>',
    );
    process.exit(1);
  }

  const dataSource = new DataSource(getDatabaseConfig());
  await dataSource.initialize();

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const superAdminRole = await queryRunner.query(
      `SELECT id FROM iam.roles WHERE code = 'SUPER_ADMIN'`,
    );

    if (superAdminRole.length === 0) {
      throw new Error('SUPER_ADMIN role not found. Run `pnpm seed:run` first.');
    }

    const existingUser = await queryRunner.query(
      `SELECT id FROM iam.users WHERE username = $1`,
      [username],
    );

    if (existingUser.length > 0) {
      throw new Error(`User '${username}' already exists.`);
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const userResult = await queryRunner.query(
      `INSERT INTO iam.users (username, password_hash, first_name, last_name, email, is_active, is_locked, permission_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [username, passwordHash, 'System', 'Administrator', `${username}@example.com`],
    );

    const userId = userResult[0].id;

    await queryRunner.query(
      `INSERT INTO iam.user_department_roles (user_id, department_id, role_id, is_active, assigned_at, created_at, updated_at)
       VALUES ($1, NULL, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, superAdminRole[0].id],
    );

    await queryRunner.commitTransaction();
    console.log(`✅ Created super admin user: ${username}`);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Failed to create super admin:', error.message);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main();
