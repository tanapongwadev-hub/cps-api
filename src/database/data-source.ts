import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../config/database.config';
import { migrationGlob } from './migration-paths';

export const AppDataSource = new DataSource({
  ...getDatabaseConfig(),
  entities: [__dirname + '/../entities/**/*.entity{.ts,.js}'],
  migrations: [migrationGlob],
});
