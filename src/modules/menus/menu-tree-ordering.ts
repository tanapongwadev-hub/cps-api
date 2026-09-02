import { createHash } from 'node:crypto';
import { Menu } from '../../entities/iam/menu.entity';
import { ReorderMenuItemDto } from './dto/reorder-menus.dto';

export const MAX_MENU_DEPTH = 4;

export interface ManagementMenuNode {
  id: string;
  parentId: string | null;
  code: string;
  nameTh: string;
  nameEn: string;
  menuType: Menu['menuType'];
  path: string | null;
  icon: string | null;
  sortOrder: number;
  isVisible: boolean;
  isActive: boolean;
  children: ManagementMenuNode[];
}

export interface ProjectedMenuLayout {
  id: string;
  parentId: string | null;
  sortOrder: number;
  menuType: Menu['menuType'];
}

export class MenuLayoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MenuLayoutValidationError';
  }
}

function assertUniqueMenuRecordIds(records: Menu[]): void {
  const seenIds = new Set<string>();

  for (const menu of records) {
    if (seenIds.has(menu.id)) {
      throw new MenuLayoutValidationError(
        `Menu records contain duplicate ID ${menu.id}.`,
      );
    }
    seenIds.add(menu.id);
  }
}

export function buildManagementTree(records: Menu[]): ManagementMenuNode[] {
  assertUniqueMenuRecordIds(records);
  const nodes = new Map<string, ManagementMenuNode>();

  for (const menu of records) {
    nodes.set(menu.id, {
      id: menu.id,
      parentId: menu.parentId ?? null,
      code: menu.code,
      nameTh: menu.nameTh,
      nameEn: menu.nameEn,
      menuType: menu.menuType,
      path: menu.path ?? null,
      icon: menu.icon ?? null,
      sortOrder: menu.sortOrder,
      isVisible: menu.isVisible,
      isActive: menu.isActive,
      children: [],
    });
  }

  const roots: ManagementMenuNode[] = [];
  for (const menu of records) {
    const node = nodes.get(menu.id);
    if (!node) continue;

    const parent = menu.parentId ? nodes.get(menu.parentId) : undefined;
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (siblings: ManagementMenuNode[]): void => {
    siblings.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    );
    for (const sibling of siblings) sortTree(sibling.children);
  };

  sortTree(roots);
  return roots;
}

export function computeMenuTreeVersion(records: Menu[]): string {
  assertUniqueMenuRecordIds(records);
  const versionInput = records
    .map((menu) => ({
      id: menu.id,
      parentId: menu.parentId ?? null,
      sortOrder: menu.sortOrder,
      menuType: menu.menuType,
      updatedAt: new Date(menu.updatedAt).toISOString(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return `sha256:${createHash('sha256')
    .update(JSON.stringify(versionInput))
    .digest('hex')}`;
}

export function validateAndProjectMenuLayout(
  records: Menu[],
  items: ReorderMenuItemDto[],
): ProjectedMenuLayout[] {
  assertUniqueMenuRecordIds(records);
  const byId = new Map(records.map((menu) => [menu.id, menu]));
  const childrenByParent = new Map<string | null, ReorderMenuItemDto[]>();
  const incomingById = new Map<string, string | null>();
  const submittedIds = new Set<string>();

  for (const item of items) {
    if (submittedIds.has(item.id)) {
      throw new MenuLayoutValidationError(
        `Menu ${item.id} appears more than once.`,
      );
    }
    submittedIds.add(item.id);
    incomingById.set(item.id, item.parentId);
  }

  const missingIds = records
    .filter((menu) => !submittedIds.has(menu.id))
    .map((menu) => menu.id)
    .sort((left, right) => left.localeCompare(right));
  if (missingIds.length > 0) {
    throw new MenuLayoutValidationError(
      `Menu arrangement is incomplete. Missing menu IDs: ${missingIds.join(', ')}.`,
    );
  }

  const extraIds = items
    .filter((item) => !byId.has(item.id))
    .map((item) => item.id)
    .sort((left, right) => left.localeCompare(right));
  if (extraIds.length > 0) {
    throw new MenuLayoutValidationError(
      `Menu arrangement contains unknown menu IDs: ${extraIds.join(', ')}.`,
    );
  }

  for (const item of items) {
    if (item.parentId === item.id) {
      throw new MenuLayoutValidationError(
        `Menu ${item.id} cannot be its own parent.`,
      );
    }
    if (item.parentId !== null && !byId.has(item.parentId)) {
      throw new MenuLayoutValidationError(
        `Menu ${item.id} references an unknown parent (${item.parentId}).`,
      );
    }

    const siblings = childrenByParent.get(item.parentId) ?? [];
    siblings.push(item);
    childrenByParent.set(item.parentId, siblings);
  }

  for (const menu of records) {
    if (
      menu.menuType === 'BUTTON' &&
      (childrenByParent.get(menu.id)?.length ?? 0) > 0
    ) {
      throw new MenuLayoutValidationError(
        `Button menu ${menu.id} cannot contain child menus.`,
      );
    }
  }

  for (const [parentId, siblings] of childrenByParent) {
    const orders = siblings
      .map((item) => item.sortOrder)
      .sort((left, right) => left - right);
    const parentLabel =
      parentId === null ? 'the top level' : `menu ${parentId}`;

    for (let index = 1; index < orders.length; index += 1) {
      if (orders[index] === orders[index - 1]) {
        throw new MenuLayoutValidationError(
          `Sibling menus under ${parentLabel} cannot share sort order ${orders[index]}.`,
        );
      }
    }

    if (orders.some((order, index) => order !== index)) {
      throw new MenuLayoutValidationError(
        `Sibling menus under ${parentLabel} must use contiguous sort orders starting at 0.`,
      );
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  const walk = (item: ReorderMenuItemDto, depth: number): void => {
    if (visiting.has(item.id)) {
      throw new MenuLayoutValidationError(
        `Menu arrangement contains a cycle involving menu ${item.id}.`,
      );
    }
    if (visited.has(item.id)) return;
    if (depth > MAX_MENU_DEPTH) {
      throw new MenuLayoutValidationError(
        `Menu ${item.id} exceeds the maximum depth of ${MAX_MENU_DEPTH}.`,
      );
    }

    visiting.add(item.id);
    for (const child of childrenByParent.get(item.id) ?? []) {
      walk(child, depth + 1);
    }
    visiting.delete(item.id);
    visited.add(item.id);
  };

  const roots = items.filter((item) => incomingById.get(item.id) === null);
  for (const root of roots) walk(root, 1);

  if (visited.size !== records.length) {
    const unresolved = items.find((item) => !visited.has(item.id));
    throw new MenuLayoutValidationError(
      unresolved
        ? `Menu arrangement contains a cycle involving menu ${unresolved.id}.`
        : 'Every menu must resolve to a top-level menu.',
    );
  }

  return items.map((item) => {
    const existing = byId.get(item.id);
    if (!existing) {
      throw new MenuLayoutValidationError(
        `Menu arrangement contains unknown menu ID ${item.id}.`,
      );
    }

    const menuType: Menu['menuType'] =
      existing.menuType === 'BUTTON'
        ? 'BUTTON'
        : item.parentId === null
          ? 'MAIN'
          : 'SUB';

    return {
      id: item.id,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      menuType,
    };
  });
}
