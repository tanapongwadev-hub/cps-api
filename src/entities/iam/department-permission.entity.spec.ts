import { getMetadataArgsStorage } from 'typeorm';
import { DepartmentPermission } from './department-permission.entity';

describe('DepartmentPermission entity', () => {
  it('maps to iam.department_permissions with a unique permission and department pair', () => {
    const storage = getMetadataArgsStorage();
    const table = storage.tables.find(
      (item) => item.target === DepartmentPermission,
    );
    const unique = storage.indices.find(
      (item) =>
        item.target === DepartmentPermission &&
        item.unique === true &&
        JSON.stringify(item.columns) ===
          JSON.stringify(['permissionId', 'departmentId']),
    );

    expect(table).toMatchObject({
      name: 'department_permissions',
      schema: 'iam',
    });
    expect(unique).toBeDefined();
  });
});
