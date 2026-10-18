import {
  Controller,
  ConflictException,
  Delete,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  UseGuards,
  type Type,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { createTraceId, recordAuditEvent } from '../../common/stock-ledger';
import { AccessControlModule } from '../access-control/access-control.module';

/**
 * Permanent delete for simple master-data rows: `DELETE /<path>/:id/permanent`.
 * One generic implementation instead of a copy per module. A row that anything
 * else still references (any inbound foreign key, including a parent/child link)
 * is refused with a Thai 409 — use "ปิดใช้งาน" for those.
 */
interface MasterTarget {
  path: string;
  table: string; // inside the master schema
  permission: string;
  label: string; // Thai noun used in messages
}

const TARGETS: MasterTarget[] = [
  { path: 'categories', table: 'categories', permission: 'CATEGORY_DELETE', label: 'หมวดหมู่' },
  { path: 'customers', table: 'customers', permission: 'CUSTOMER_DELETE', label: 'ลูกค้า' },
  { path: 'delivery-types', table: 'delivery_types', permission: 'DELIVERY_TYPE_DELETE', label: 'ประเภทการจัดส่ง' },
  { path: 'loading-points', table: 'loading_points', permission: 'LOADING_POINT_DELETE', label: 'จุดขนถ่าย' },
  { path: 'locations', table: 'locations', permission: 'LOCATION_DELETE', label: 'สถานที่' },
  { path: 'material-models', table: 'material_models', permission: 'MATERIAL_MODEL_DELETE', label: 'รุ่นวัสดุ' },
  { path: 'organizations', table: 'organizations', permission: 'ORGANIZATION_DELETE', label: 'องค์กร' },
  { path: 'process-lines', table: 'process_lines', permission: 'PROCESS_LINE_DELETE', label: 'สายการผลิต' },
  { path: 'process-steps', table: 'process_steps', permission: 'PROCESS_STEP_DELETE', label: 'ขั้นตอนการผลิต' },
  { path: 'product-models', table: 'product_models', permission: 'PRODUCT_MODEL_DELETE', label: 'รุ่นสินค้า' },
  { path: 'product-types', table: 'product_types', permission: 'PRODUCT_TYPE_DELETE', label: 'ประเภทสินค้า' },
  { path: 'reject-reasons', table: 'reject_reasons', permission: 'REJECT_REASON_DELETE', label: 'เหตุผลการปฏิเสธ' },
  { path: 'status-items', table: 'status_items', permission: 'STATUS_ITEM_DELETE', label: 'สถานะ' },
  { path: 'units', table: 'units', permission: 'UNIT_DELETE', label: 'หน่วยนับ' },
];

const TABLE_LABELS: Record<string, string> = {
  materials: 'วัสดุ',
  products: 'สินค้า',
  material_receivings: 'รายการรับเข้า',
  material_bom_items: 'BOM วัสดุ',
  product_bom_items: 'BOM สินค้า',
  product_workflow_steps: 'Workflow สินค้า',
  material_workflow_steps: 'Workflow วัสดุ',
  categories: 'หมวดหมู่ย่อย',
  production_transactions: 'ประวัติการผลิต',
  process_wip: 'งานระหว่างผลิต',
};

@Injectable()
export class MasterPermanentDeleteService {
  constructor(private readonly dataSource: DataSource) {}

  async remove(target: MasterTarget, id: string, userId: string) {
    if (!/^[1-9]\d*$/.test(id)) throw new NotFoundException(`ไม่พบ${target.label}`);
    const relation = `master.${target.table}`;
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(`SELECT * FROM ${relation} WHERE id = $1 FOR UPDATE`, [id]);
      if (rows.length === 0) throw new NotFoundException(`ไม่พบ${target.label}`);
      const references: { tableName: string; relation: string; columnName: string }[] = await manager.query(
        `
        SELECT c.relname AS "tableName", quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS relation,
               quote_ident(a.attname) AS "columnName"
        FROM pg_constraint fk
        JOIN pg_class c ON c.oid = fk.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(fk.conkey)
        WHERE fk.contype = 'f' AND fk.confrelid = $1::regclass
      `,
        [relation],
      );
      const blockers = new Set<string>();
      for (const reference of references) {
        const used = await manager.query(
          `SELECT 1 FROM ${reference.relation} WHERE ${reference.columnName} = $1 LIMIT 1`,
          [id],
        );
        if (used.length) blockers.add(TABLE_LABELS[reference.tableName] ?? 'ข้อมูลที่เชื่อมโยง');
      }
      if (blockers.size > 0) {
        throw new ConflictException(
          `ลบถาวรไม่ได้: ${target.label}นี้ยังถูกใช้โดย ${[...blockers].join(', ')} — ใช้ปิดใช้งานแทน`,
        );
      }
      await manager.query(`DELETE FROM ${relation} WHERE id = $1`, [id]);
      const before = { id, code: rows[0].code ?? null, name: rows[0].name_th ?? rows[0].name ?? null };
      await recordAuditEvent(manager, {
        traceId: createTraceId(),
        action: 'DELETE',
        eventName: 'master_data.permanently_deleted',
        targetType: target.table.toUpperCase(),
        targetId: id,
        performedBy: userId,
        before,
      });
      return { id, deleted: true as const };
    });
  }
}

function createController(target: MasterTarget): Type<unknown> {
  @Controller(target.path)
  @UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
  class GeneratedMasterPermanentDeleteController {
    constructor(
      @Inject(MasterPermanentDeleteService)
      private readonly service: MasterPermanentDeleteService,
    ) {}

    @Delete(':id/permanent')
    @RequirePermissions(target.permission)
    remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
      return this.service.remove(target, id, userId);
    }
  }
  return GeneratedMasterPermanentDeleteController;
}

@Module({
  imports: [AccessControlModule],
  controllers: TARGETS.map(createController),
  providers: [MasterPermanentDeleteService, PermissionGuard],
})
export class MasterPermanentDeleteModule {}
