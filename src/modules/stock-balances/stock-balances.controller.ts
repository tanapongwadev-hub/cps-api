import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { MATERIALS_RECEIVING_PERMISSIONS } from '../materials-receiving/materials-receiving-permissions';
import { StockBalancesService } from './stock-balances.service';

@Controller('stock-balances')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class StockBalancesController {
  constructor(private readonly stockBalancesService: StockBalancesService) {}

  @Get(':materialId')
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW)
  getByMaterialId(@Param('materialId') materialId: string) {
    return this.stockBalancesService.getByMaterialId(materialId);
  }

  @Get()
  @RequirePermissions(MATERIALS_RECEIVING_PERMISSIONS.VIEW)
  getAll() {
    return this.stockBalancesService.getAll();
  }
}
