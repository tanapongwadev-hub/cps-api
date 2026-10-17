import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StockBalancesService } from '../stock-balances/stock-balances.service';
import { ListMaterialInventoryQueryDto } from '../stock-balances/dto/list-material-inventory-query.dto';

export const DASHBOARD_TREND_DAYS = 14;

export interface DashboardSummary {
  inventory: { total: number; normal: number; lowStock: number; outOfStock: number };
  /** Confirmed documents per Bangkok calendar day, oldest first. */
  trend: Array<{ date: string; received: number; disbursed: number }>;
  receivedLast7: number;
  disbursedLast7: number;
  /** Row counts per status; keys are the raw status values. */
  productionOrders: Record<string, number>;
  productionPlans: Record<string, number>;
}

// Aggregate counts only (no document numbers, material names or quantities
// per record), so it is safe for any signed-in user. Detail lists on the
// dashboard still come from the permission-guarded module endpoints.
@Injectable()
export class DashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly stockBalances: StockBalancesService,
  ) {}

  private async statusCounts(table: string): Promise<Record<string, number>> {
    const rows = (await this.dataSource.query(
      `SELECT status, COUNT(*)::int AS count FROM ${table} GROUP BY status`,
    )) as Array<{ status: string; count: number }>;
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  }

  async getSummary(): Promise<DashboardSummary> {
    const [inventory, trendRows, productionOrders, productionPlans] = await Promise.all([
      this.stockBalances.getMaterialInventory({
        page: 1,
        limit: 1,
        isActive: true,
        sortBy: 'code',
        sortOrder: 'asc',
      } as ListMaterialInventoryQueryDto),
      this.dataSource.query(
        `WITH days AS (
           SELECT generate_series(
             (now() AT TIME ZONE 'Asia/Bangkok')::date - ($1::int - 1),
             (now() AT TIME ZONE 'Asia/Bangkok')::date,
             interval '1 day')::date AS day
         )
         SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
           (SELECT COUNT(*)::int FROM inventory.material_receivings r
             WHERE r.status = 'confirmed' AND r.receive_date = days.day) AS received,
           (SELECT COUNT(*)::int FROM inventory.materials_disbursements d
             WHERE d.status = 'confirmed' AND d.disbursement_date = days.day) AS disbursed
         FROM days ORDER BY days.day`,
        [DASHBOARD_TREND_DAYS],
      ) as Promise<Array<{ date: string; received: number; disbursed: number }>>,
      this.statusCounts('inventory.production_orders'),
      this.statusCounts('inventory.production_plans'),
    ]);

    const trend = trendRows.map((row) => ({
      date: row.date,
      received: Number(row.received),
      disbursed: Number(row.disbursed),
    }));
    const last7 = trend.slice(-7);

    return {
      inventory: inventory.summary,
      trend,
      receivedLast7: last7.reduce((sum, row) => sum + row.received, 0),
      disbursedLast7: last7.reduce((sum, row) => sum + row.disbursed, 0),
      productionOrders,
      productionPlans,
    };
  }
}
