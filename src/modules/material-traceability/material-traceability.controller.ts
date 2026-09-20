import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequireAnyPermissions } from '../../common/decorators/require-any-permissions.decorator';
import { ActiveAssignmentGuard } from '../../common/guards/active-assignment.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { MATERIALS_DISBURSEMENT_PERMISSIONS } from '../materials-disbursement/materials-disbursement-permissions';
import { MATERIALS_RECEIVING_PERMISSIONS } from '../materials-receiving/materials-receiving-permissions';
import { QueryMaterialTraceabilityDto } from './dto/query-material-traceability.dto';
import { MaterialTraceabilityService } from './material-traceability.service';

/**
 * A viewer needs EITHER receiving-view OR disbursement-view — the report
 * joins both flows and a warehouse role commonly only has one of the two
 * (see the handoff's "verify guard semantics before trying to express
 * OR-permission behavior" — `@RequireAnyPermissions` is the guard's real OR
 * primitive, distinct from `@RequirePermissions`'s AND semantics).
 */
const VIEW_ANY = [
  MATERIALS_RECEIVING_PERMISSIONS.VIEW,
  MATERIALS_DISBURSEMENT_PERMISSIONS.VIEW,
];

@Controller('material-traceability')
@UseGuards(JwtAuthGuard, ActiveAssignmentGuard, PermissionGuard)
export class MaterialTraceabilityController {
  constructor(private readonly service: MaterialTraceabilityService) {}

  @Get()
  @RequireAnyPermissions(...VIEW_ANY)
  getReport(@Query() query: QueryMaterialTraceabilityDto) {
    return this.service.getReport(query);
  }

  @Get('summary')
  @RequireAnyPermissions(...VIEW_ANY)
  getSummary(@Query() query: QueryMaterialTraceabilityDto) {
    return this.service.getSummary(query);
  }

  @Get('movements')
  @RequireAnyPermissions(...VIEW_ANY)
  getMovements(@Query() query: QueryMaterialTraceabilityDto) {
    return this.service.getMovements(query);
  }

  @Get('qr/:code')
  @RequireAnyPermissions(...VIEW_ANY)
  traceByCode(@Param('code') code: string) {
    return this.service.traceByCode(code);
  }

  @Get('main-qr/:id')
  @RequireAnyPermissions(...VIEW_ANY)
  traceMainQr(@Param('id') id: string) {
    return this.service.traceMainQr(id);
  }

  @Get('sub-qr/:id')
  @RequireAnyPermissions(...VIEW_ANY)
  traceSubQr(@Param('id') id: string) {
    return this.service.traceSubQr(id);
  }

  @Get('receivings/:id')
  @RequireAnyPermissions(...VIEW_ANY)
  traceReceiving(@Param('id') id: string) {
    return this.service.traceReceiving(id);
  }

  @Get('disbursements/:id')
  @RequireAnyPermissions(...VIEW_ANY)
  traceDisbursement(@Param('id') id: string) {
    return this.service.traceDisbursement(id);
  }
}
