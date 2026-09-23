import { REQUIRE_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { PRODUCTION_PLAN_PERMISSIONS } from './production-plan-permissions';
import { ProductionPlansController } from './production-plans.controller';

describe('ProductionPlansController permission gates', () => {
  const handler = (name: keyof ProductionPlansController) =>
    Object.getOwnPropertyDescriptor(ProductionPlansController.prototype, name)!
      .value as object;

  it.each([
    ['findAll', PRODUCTION_PLAN_PERMISSIONS.VIEW],
    ['findOne', PRODUCTION_PLAN_PERMISSIONS.VIEW],
    ['getLookups', PRODUCTION_PLAN_PERMISSIONS.VIEW],
    ['create', PRODUCTION_PLAN_PERMISSIONS.CREATE],
    ['importExcel', PRODUCTION_PLAN_PERMISSIONS.CREATE],
    ['update', PRODUCTION_PLAN_PERMISSIONS.UPDATE],
    ['approve', PRODUCTION_PLAN_PERMISSIONS.APPROVE],
    ['issue', PRODUCTION_PLAN_PERMISSIONS.ISSUE],
    ['cancel', PRODUCTION_PLAN_PERMISSIONS.CANCEL],
    ['remove', PRODUCTION_PLAN_PERMISSIONS.DELETE],
  ] as const)('%s requires %s', (method, permission) => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler(method)),
    ).toEqual([permission]);
  });
});
