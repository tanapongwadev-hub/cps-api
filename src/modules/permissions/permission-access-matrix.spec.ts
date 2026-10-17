import {
  computePermissionAccessVersion,
  findReadDependencyViolations,
  PermissionAccessState,
} from './permission-access-matrix';

const state = (
  overrides: Partial<PermissionAccessState>,
): PermissionAccessState => ({
  id: '1',
  code: 'x',
  menuId: 'm1',
  actionCode: 'READ',
  isActive: true,
  accessScope: 'ALL',
  departmentIds: [],
  ...overrides,
});

describe('computePermissionAccessVersion', () => {
  it('ignores row and department order', () => {
    const a = computePermissionAccessVersion([
      { id: '2', accessScope: 'DEPARTMENTS', departmentIds: ['3', '1'] },
      { id: '1', accessScope: 'ALL', departmentIds: [] },
    ]);
    const b = computePermissionAccessVersion([
      { id: '1', accessScope: 'ALL', departmentIds: [] },
      { id: '2', accessScope: 'DEPARTMENTS', departmentIds: ['1', '3'] },
    ]);
    expect(a).toBe(b);
  });

  it('changes when a scope or department list changes', () => {
    const base = computePermissionAccessVersion([
      { id: '1', accessScope: 'ALL', departmentIds: [] },
    ]);
    expect(
      computePermissionAccessVersion([
        { id: '1', accessScope: 'DEPARTMENTS', departmentIds: [] },
      ]),
    ).not.toBe(base);
  });
});

describe('findReadDependencyViolations', () => {
  const read = state({ id: '1', code: 'm.view', actionCode: 'READ' });
  const create = state({ id: '2', code: 'm.create', actionCode: 'CREATE' });

  it('passes when READ is open wherever another action is', () => {
    expect(
      findReadDependencyViolations(
        [
          { ...read, accessScope: 'DEPARTMENTS', departmentIds: ['1'] },
          { ...create, accessScope: 'DEPARTMENTS', departmentIds: ['1'] },
        ],
        ['m1'],
        ['1', '2'],
      ),
    ).toEqual([]);
  });

  it('reports each department that has another action but not READ', () => {
    expect(
      findReadDependencyViolations(
        [{ ...read, accessScope: 'DEPARTMENTS', departmentIds: ['1'] }, create],
        ['m1'],
        ['1', '2'],
      ),
    ).toEqual([
      {
        menuId: 'm1',
        departmentId: '2',
        permissionCodes: ['m.create'],
        readPermissionCode: 'm.view',
      },
    ]);
  });

  it('skips menus without a READ permission and inactive permissions', () => {
    expect(
      findReadDependencyViolations(
        [
          { ...read, isActive: false, accessScope: 'DEPARTMENTS' },
          create,
        ],
        ['m1'],
        ['1'],
      ),
    ).toEqual([]);
  });
});
