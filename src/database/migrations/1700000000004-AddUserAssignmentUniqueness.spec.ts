import { AddUserAssignmentUniqueness1700000000004 } from './1700000000004-AddUserAssignmentUniqueness';

describe('AddUserAssignmentUniqueness1700000000004', () => {
  it('adds deferrable normal-assignment and partial system-assignment uniqueness', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddUserAssignmentUniqueness1700000000004();

    await migration.up({ query } as never);

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]?.[0]).toContain(
      'Duplicate user assignment pairs exist',
    );
    expect(query.mock.calls[1]?.[0]).toContain(
      'CONSTRAINT uq_user_department_roles_user_department_role',
    );
    expect(query.mock.calls[1]?.[0]).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(query.mock.calls[2]?.[0]).toContain(
      'uq_user_department_roles_user_system_role',
    );
    expect(query.mock.calls[2]?.[0]).toContain('WHERE department_id IS NULL');
  });

  it('drops both uniqueness rules on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddUserAssignmentUniqueness1700000000004();

    await migration.down({ query } as never);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain(
      'DROP INDEX IF EXISTS iam.uq_user_department_roles_user_system_role',
    );
    expect(query.mock.calls[1]?.[0]).toContain(
      'DROP CONSTRAINT IF EXISTS uq_user_department_roles_user_department_role',
    );
  });
});
