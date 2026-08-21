import { registerAs } from '@nestjs/config';
import { getEnv, getEnvNumber, getEnvBoolean } from './env.utils';

export const DATABASE_CONFIG_TOKEN = 'database';

export const getDatabaseConfig = () => ({
  type: 'postgres' as const,
  host: getEnv('DB_HOST', 'localhost'),
  port: getEnvNumber('DB_PORT', 5432),
  username: getEnv('DB_USERNAME', 'postgres'),
  password: getEnv('DB_PASSWORD'),
  database: getEnv('DB_DATABASE', 'cps_database'),
  schema: getEnv('DB_SCHEMA', 'iam'),
  synchronize: false,
  logging: getEnvBoolean('DB_LOGGING', false),
});

export const databaseConfig = registerAs(
  DATABASE_CONFIG_TOKEN,
  getDatabaseConfig,
);
