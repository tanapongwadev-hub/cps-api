import { Injectable } from '@nestjs/common';

export type MenuTreeType = 'MAIN' | 'SUB' | 'BUTTON';

export interface MenuResponse {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  path: string | null;
  icon: string | null;
  menuType: MenuTreeType;
  sortOrder: number;
  permissions: string[];
  children: MenuResponse[];
}

type MenuInput = {
  id: string;
  parentId?: string | null;
  code: string;
  nameTh: string;
  nameEn: string;
  path?: string | null;
  icon?: string | null;
  menuType: MenuTreeType;
  sortOrder: number;
  isActive: boolean;
  isVisible: boolean;
  permissions?: string[];
};

@Injectable()
export class MenuTreeService {
  buildMenuTree(
    menus: MenuInput[],
    permissionCodes: string[],
    isSuperAdmin = false,
  ): MenuResponse[] {
    const activeMenus = menus.filter((menu) => menu.isActive && menu.isVisible);
    const byId = new Map(activeMenus.map((menu) => [menu.id, menu]));
    const allowed = new Set(permissionCodes);
    const included = new Set<string>();

    for (const menu of activeMenus) {
      const menuPermissions = [...new Set(menu.permissions ?? [])].sort();
      if (isSuperAdmin || menuPermissions.some((code) => allowed.has(code))) {
        this.includeWithParents(menu.id, byId, included, new Set());
      }
    }

    const nodes = new Map<string, MenuResponse>();
    for (const menu of activeMenus) {
      if (!included.has(menu.id)) continue;
      nodes.set(menu.id, {
        id: menu.id,
        code: menu.code,
        name: menu.nameTh,
        nameEn: menu.nameEn,
        path: menu.path ?? null,
        icon: menu.icon ?? null,
        menuType: menu.menuType,
        sortOrder: menu.sortOrder,
        permissions: [...new Set(menu.permissions ?? [])]
          .filter((code) => isSuperAdmin || allowed.has(code))
          .sort(),
        children: [],
      });
    }

    const roots: MenuResponse[] = [];
    for (const menu of activeMenus) {
      const node = nodes.get(menu.id);
      if (!node) continue;
      const parent = menu.parentId ? nodes.get(menu.parentId) : undefined;
      if (parent && parent !== node) parent.children.push(node);
      else roots.push(node);
    }

    const sortTree = (items: MenuResponse[]) => {
      items.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      );
      items.forEach((item) => sortTree(item.children));
    };
    sortTree(roots);
    return roots;
  }

  private includeWithParents(
    menuId: string,
    byId: Map<string, MenuInput>,
    included: Set<string>,
    visiting: Set<string>,
  ) {
    if (included.has(menuId) || visiting.has(menuId)) return;
    const menu = byId.get(menuId);
    if (!menu) return;
    visiting.add(menuId);
    included.add(menuId);
    if (menu.parentId) {
      this.includeWithParents(menu.parentId, byId, included, visiting);
    }
    visiting.delete(menuId);
  }
}
