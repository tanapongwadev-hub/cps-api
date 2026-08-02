import { MenuTreeService } from './menu-tree.service';

describe('MenuTreeService', () => {
  it('includes accessible children and their parent, sorted without duplicates', () => {
    const service = new MenuTreeService();
    const menus = [
      {
        id: '2',
        parentId: '1',
        code: 'USER_LIST',
        nameTh: 'รายการผู้ใช้',
        nameEn: 'User list',
        path: '/users',
        icon: 'list',
        menuType: 'SUB',
        sortOrder: 2,
        isActive: true,
        isVisible: true,
        permissions: ['user.view'],
      },
      {
        id: '1',
        parentId: null,
        code: 'USER',
        nameTh: 'ผู้ใช้',
        nameEn: 'Users',
        path: '/users',
        icon: 'users',
        menuType: 'MAIN',
        sortOrder: 1,
        isActive: true,
        isVisible: true,
        permissions: [],
      },
      {
        id: '3',
        parentId: null,
        code: 'HIDDEN',
        nameTh: 'ซ่อน',
        nameEn: 'Hidden',
        path: '/hidden',
        icon: null,
        menuType: 'MAIN',
        sortOrder: 0,
        isActive: true,
        isVisible: false,
      },
    ] as any;

    expect(service.buildMenuTree(menus, ['user.view'])).toEqual([
      expect.objectContaining({
        id: '1',
        menuType: 'MAIN',
        permissions: [],
        children: [
          expect.objectContaining({
            id: '2',
            menuType: 'SUB',
            permissions: ['user.view'],
          }),
        ],
      }),
    ]);
  });
});
