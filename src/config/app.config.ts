import { registerAs } from '@nestjs/config';
import { getEnv, getEnvNumber } from './env.utils';

export const APP_CONFIG_TOKEN = 'app';

function getDefaultOrganizationCode(): string {
  const code = getEnv('DEFAULT_ORGANIZATION_CODE', 'CPS').trim().toUpperCase();
  if (!code) {
    throw new Error(
      'Environment variable DEFAULT_ORGANIZATION_CODE must not be empty',
    );
  }
  return code;
}

export const getAppConfig = () => ({
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3001),
  corsOrigin: getEnv('CORS_ORIGIN', ''),
  defaultOrganizationCode: getDefaultOrganizationCode(),
});

export const appConfig = registerAs(APP_CONFIG_TOKEN, getAppConfig);
