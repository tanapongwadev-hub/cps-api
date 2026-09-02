import { Menu } from '../../entities/iam/menu.entity';
import { ReorderMenuItemDto } from './dto/reorder-menus.dto';
import {
  buildManagementTree,
  computeMenuTreeVersion,
  MAX_MENU_DEPTH,
  MenuLayoutValidationError,
  validateAndProjectMenuLayout,
} from './menu-tree-ordering';

describe('menu tree ordering', () => {
  const timestamp = new Date('2026-09-02T08:00:00.000Z');

  function menu(
    id: string,
    parentId: string | null,
    sortOrder: number,
    overrides: Partial<Menu> = {},
  ): Menu {
    return {
      id,
      parentId,
      code: `MENU_${id}`,
      nameTh: `เมนู ${id}`,
      nameEn: `Menu ${id}`,
      menuType: parentId === null ? 'MAIN' : 'SUB',
      path: `/menu-${id}`,
      icon: 'circle',
      sortOrder,
      isVisible: true,
      isActive: true,
      createdBy: '1',
      updatedBy: '1',
      createdAt: timestamp,
      updatedAt: timestamp,
      parent: null,
      ...overrides,
    } as Menu;
  }

  const records: Menu[] = [
    menu('6', '4', 0, { isActive: false }),
    menu('4', null, 1, { isVisible: false }),
    menu('2', '1', 0),
    menu('5', '3', 0, { menuType: 'BUTTON' }),
    menu('1', null, 0),
    menu('3', '2', 0),
  ];

  const currentItems = (): ReorderMenuItemDto[] =>
    records.map(({ id, parentId, sortOrder }) => ({
      id,
      parentId,
      sortOrder,
    }));

  const replaceItem = (
    id: string,
    replacement: Partial<ReorderMenuItemDto>,
    items = currentItems(),
  ): ReorderMenuItemDto[] =>
    items.map((item) => (item.id === id ? { ...item, ...replacement } : item));

  it('builds a deterministic complete management tree', () => {
    const tree = buildManagementTree(records);

    expect(tree.map(({ id }) => id)).toEqual(['1', '4']);
    expect(tree[0].children[0].id).toBe('2');
    expect(tree[1]).toMatchObject({ id: '4', isVisible: false });
    expect(tree[1].children[0]).toMatchObject({
      id: '6',
      isActive: false,
    });
  });

  it('uses menu ID to break equal sibling-order ties deterministically', () => {
    const tiedRecords = [
      menu('10', null, 0),
      menu('2', null, 0),
      menu('1', null, 0),
    ];

    expect(buildManagementTree(tiedRecords).map(({ id }) => id)).toEqual([
      '1',
      '10',
      '2',
    ]);
  });

  it('computes the same version regardless of database return order', () => {
    expect(computeMenuTreeVersion([...records].reverse())).toBe(
      computeMenuTreeVersion(records),
    );
    expect(computeMenuTreeVersion(records)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('changes the version when ordering-relevant state changes', () => {
    const changed = records.map((record) =>
      record.id === '4' ? { ...record, sortOrder: 2 } : record,
    );

    expect(computeMenuTreeVersion(changed)).not.toBe(
      computeMenuTreeVersion(records),
    );
  });

  it('projects a valid cross-level move and normalizes non-button types', () => {
    const crossLevelItems = replaceItem('4', {
      parentId: '2',
      sortOrder: 1,
    });

    expect(
      validateAndProjectMenuLayout(records, crossLevelItems),
    ).toContainEqual({
      id: '4',
      parentId: '2',
      sortOrder: 1,
      menuType: 'SUB',
    });
  });

  it('retains a moved subtree and keeps its deepest node at depth four', () => {
    const movedSubtreeItems = replaceItem(
      '4',
      { parentId: '2', sortOrder: 1 },
      currentItems(),
    );

    const projected = validateAndProjectMenuLayout(records, movedSubtreeItems);

    expect(MAX_MENU_DEPTH).toBe(4);
    expect(projected).toEqual(
      expect.arrayContaining([
        { id: '4', parentId: '2', sortOrder: 1, menuType: 'SUB' },
        { id: '6', parentId: '4', sortOrder: 0, menuType: 'SUB' },
      ]),
    );
  });

  it('preserves button type when a button moves', () => {
    const items = replaceItem(
      '5',
      { parentId: '4', sortOrder: 1 },
      replaceItem('6', { sortOrder: 0 }),
    );

    expect(validateAndProjectMenuLayout(records, items)).toContainEqual({
      id: '5',
      parentId: '4',
      sortOrder: 1,
      menuType: 'BUTTON',
    });
  });

  it.each([
    [
      'duplicate IDs',
      () => [...currentItems(), { ...currentItems()[0] }],
      /appears more than once/i,
    ],
    [
      'missing IDs',
      () => currentItems().filter(({ id }) => id !== '6'),
      /incomplete/i,
    ],
    [
      'extra IDs',
      () => [...currentItems(), { id: '999', parentId: null, sortOrder: 2 }],
      /unknown menu/i,
    ],
    [
      'an unknown parent',
      () => replaceItem('2', { parentId: '999' }),
      /unknown parent/i,
    ],
    [
      'self-parenting',
      () => replaceItem('2', { parentId: '2' }),
      /own parent/i,
    ],
    [
      'a multi-node cycle',
      () =>
        replaceItem(
          '1',
          { parentId: '3', sortOrder: 1 },
          replaceItem('4', { sortOrder: 0 }),
        ),
      /cycle/i,
    ],
    [
      'a fifth level',
      () =>
        replaceItem(
          '4',
          { parentId: '3', sortOrder: 1 },
          replaceItem('6', { parentId: '4', sortOrder: 0 }),
        ),
      /maximum depth/i,
    ],
    [
      'children under a button',
      () =>
        replaceItem(
          '4',
          { parentId: '5', sortOrder: 0 },
          replaceItem('6', { parentId: '4', sortOrder: 0 }),
        ),
      /button menu/i,
    ],
    [
      'duplicate sibling orders',
      () => replaceItem('4', { sortOrder: 0 }),
      /share sort order/i,
    ],
    [
      'non-contiguous sibling orders',
      () => replaceItem('4', { sortOrder: 2 }),
      /contiguous/i,
    ],
  ])(
    'rejects %s with a user-safe validation error',
    (_label, makeItems, message) => {
      expect(() => validateAndProjectMenuLayout(records, makeItems())).toThrow(
        MenuLayoutValidationError,
      );
      expect(() => validateAndProjectMenuLayout(records, makeItems())).toThrow(
        message,
      );
    },
  );
});
