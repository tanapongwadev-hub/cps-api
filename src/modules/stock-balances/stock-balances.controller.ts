import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequireAnyPermissions } from '../../common/decorators/require-any-permissions.decorator';
import { MATERIALS_RECEIVING_PERMISSIONS } from '../materials-receiving/materials-receiving-permissions';
import { StockBalancesService } from './stock-balances.service';
import { ListMaterialInventoryQueryDto } from './dto/list-material-inventory-query.dto';

// Stock-only permission so a group (e.g. production) can read balances without receiving access.
const STOCK_VIEW_PERMISSION = 'MATERIAL_STOCK_VIEW';

@Controller('stock-balances')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class StockBalancesController {
  constructor(private readonly stockBalancesService: StockBalancesService) {}

  @Get('inventory')
  @RequireAnyPermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW, STOCK_VIEW_PERMISSION)
  getInventory(@Query() query: ListMaterialInventoryQueryDto) {
    return this.stockBalancesService.getMaterialInventory(query);
  }

  @Get(':materialId')
  @RequireAnyPermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW, STOCK_VIEW_PERMISSION)
  getByMaterialId(@Param('materialId') materialId: string) {
    return this.stockBalancesService.getByMaterialId(materialId);
  }

  @Get()
  @RequireAnyPermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW, STOCK_VIEW_PERMISSION)
  getAll() {
    return this.stockBalancesService.getAll();
  }
}
