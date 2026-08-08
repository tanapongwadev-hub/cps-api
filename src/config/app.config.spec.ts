import { getAppConfig } from './app.config';

describe('getAppConfig', () => {
  const originalDefaultOrganizationCode = process.env.DEFAULT_ORGANIZATION_CODE;

  afterEach(() => {
    if (originalDefaultOrganizationCode === undefined) {
      delete process.env.DEFAULT_ORGANIZATION_CODE;
    } else {
      process.env.DEFAULT_ORGANIZATION_CODE = originalDefaultOrganizationCode;
    }
  });

  it('defaults the goods receipt organization code to CPS', () => {
    delete process.env.DEFAULT_ORGANIZATION_CODE;
    expect(getAppConfig().defaultOrganizationCode).toBe('CPS');
  });

  it('normalizes a configured organization code', () => {
    process.env.DEFAULT_ORGANIZATION_CODE = '  cci-hq  ';
    expect(getAppConfig().defaultOrganizationCode).toBe('CCI-HQ');
  });

  it('rejects an empty organization code', () => {
    process.env.DEFAULT_ORGANIZATION_CODE = '   ';
    expect(() => getAppConfig()).toThrow(
      'Environment variable DEFAULT_ORGANIZATION_CODE must not be empty',
    );
  });
});
